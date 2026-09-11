import { get, writable, type Writable } from "svelte/store";
import { LifecycleDiagnostics } from "./lifecycle-diagnostics";
import { PanelCardHeader, SveltePanelBody } from "./panel-parts";
import type { PanelState, WorkspacePanelSpec, WorkspaceRendererRegistry } from "./workspace";

interface Card {
  body: SveltePanelBody;
  element: HTMLElement;
  header: PanelCardHeader;
  state: Writable<PanelState>;
}

export interface ScrollviewCallbacks {
  /**
   * A card from a sibling rail was dropped here. The caller must remove it
   * from its origin, then `addOrUpdatePanel` it here at `index`.
   */
  onAcceptForeign?: ((id: string, index: number) => void) | undefined;
  /** Button-triggered float. The rail drops its card; the caller re-homes it. */
  onFloat?: ((id: string) => void) | undefined;
  /** Card order, visibility, or collapse changed. */
  onChange?: (() => void) | undefined;
  requestClose?: ((id: string) => Promise<boolean>) | undefined;
}

/**
 * Rail cards move by native HTML5 drag rather than pointer tracking. The same
 * payload is what a cross-root drag has to publish for Dockview's
 * `onUnhandledDragOver` to see it, so intra-rail and cross-root drags share one
 * mechanism.
 */
export const RAIL_DRAG_TYPE = "application/x-darkflow-rail-panel";

/**
 * A rail root: panels stack at their content height under one scrollbar.
 *
 * Deliberately not a Dockview construct. Dockview's grid distributes a fixed
 * extent among its children with a minimum-size floor, which is what clips the
 * tenth rail panel; a flex column with `flex: 0 0 auto` cards has no such floor.
 *
 * The DOM is the ordered source of truth. `ids()` reads child order rather than
 * shadowing it in an array, so insert and remove cannot drift out of sync.
 */
export class Scrollview {
  readonly #cards = new Map<string, Card>();
  readonly #pendingUnmounts = new Set<Promise<void>>();
  #disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly registry: WorkspaceRendererRegistry,
    private readonly diagnostics: LifecycleDiagnostics,
    private readonly callbacks: ScrollviewCallbacks = {},
  ) {
    this.host.classList.add("df-workspace", "df-rail");
    this.host.style.display = "flex";
    this.host.style.flexDirection = "column";
    this.host.style.overflowY = "auto";
    this.host.style.overflowX = "hidden";
    this.host.addEventListener("dragover", this.#onDragOver);
    this.host.addEventListener("dragleave", this.#clearDropMarker);
    this.host.addEventListener("drop", this.#onDrop);
  }

  addOrUpdatePanel(spec: WorkspacePanelSpec, index?: number): void {
    const existing = this.#cards.get(spec.id);
    if (existing) {
      existing.state.set(spec.state);
      existing.header.setTitle(spec.title);
      return;
    }

    const definition = this.registry[spec.kind];
    if (!definition) {
      throw new Error(
        `No workspace renderer is registered for panel '${spec.id}' of kind '${spec.kind}'.`,
      );
    }

    const state = writable<PanelState>(spec.state);
    const body = new SveltePanelBody(spec.id, definition, state, this.diagnostics, () => {});
    // The shared body part sizes itself to a Dockview group; a rail card is
    // content-height by definition.
    body.element.style.height = "auto";

    const bodyWrapper = document.createElement("div");
    bodyWrapper.className = "df-rail-card-body";
    bodyWrapper.appendChild(body.element);

    const header = new PanelCardHeader(
      spec.id,
      {
        close: definition.canClose ? () => void this.#close(spec.id) : undefined,
        collapse: definition.collapsible ? () => this.#toggleCollapse(spec.id) : undefined,
        configure: definition.configure,
        floatDock:
          definition.floatable && this.callbacks.onFloat ? () => this.#float(spec.id) : undefined,
      },
      false,
      () => {},
    );
    header.setTitle(spec.title);
    header.setCloseButtonVisible(
      definition.showCloseButton?.(spec.id) ?? definition.canClose !== undefined,
    );

    const element = document.createElement("div");
    element.className = "df-rail-card";
    element.dataset.panelId = spec.id;
    element.style.flex = "0 0 auto";
    element.appendChild(header.element);
    element.appendChild(bodyWrapper);

    // Only the header drags; the body holds interactive panel content.
    header.element.draggable = true;
    header.element.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData(RAIL_DRAG_TYPE, spec.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      // The header alone makes a misleading drag image; show the whole card.
      event.dataTransfer?.setDragImage(element, 0, 0);
      // Restyling the drag source synchronously inside `dragstart` cancels the
      // drag in Chromium; defer past the browser's drag-image snapshot.
      setTimeout(() => {
        element.style.opacity = "0.4";
      }, 0);
    });
    header.element.addEventListener("dragend", () => {
      element.style.opacity = "";
      this.#clearDropMarker();
    });

    this.host.insertBefore(element, this.host.children[index ?? this.host.children.length] ?? null);
    this.#cards.set(spec.id, { body, element, header, state });
    body.initState(spec.state);
  }

  /** Ordered panel ids, read from the DOM. This is what the snapshot stores. */
  ids(): string[] {
    return [...this.host.children]
      .map((child) => (child as HTMLElement).dataset.panelId)
      .filter((id): id is string => typeof id === "string");
  }

  collapsedIds(): string[] {
    return this.ids().filter((id) =>
      this.#cards.get(id)?.element.querySelector(".df-rail-card-body")?.hasAttribute("hidden"),
    );
  }

  hasPanel(id: string): boolean {
    return this.#cards.has(id);
  }

  refreshPanelPresentation(): void {
    for (const card of this.#cards.values()) card.body.refreshPresentation();
  }

  getPanelState(id: string): PanelState | undefined {
    const state = this.#cards.get(id)?.state;
    return state ? get(state) : undefined;
  }

  indexOf(id: string): number {
    return this.ids().indexOf(id);
  }

  async removePanel(id: string): Promise<void> {
    const card = this.#cards.get(id);
    if (!card) return;
    this.#cards.delete(id);
    card.header.dispose();
    card.body.dispose();
    card.element.remove();
    const unmount = card.body.whenDisposed();
    this.#pendingUnmounts.add(unmount);
    await unmount;
    this.#pendingUnmounts.delete(unmount);
  }

  /** Compact and mobile zones hide the rails; an inert root cannot eat pointer input. */
  setInert(inert: boolean): void {
    // `hidden` alone loses to the inline display this class sets in its
    // constructor, so drive display directly and keep `hidden` for semantics.
    this.host.hidden = inert;
    this.host.style.display = inert ? "none" : "flex";
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.host.removeEventListener("dragover", this.#onDragOver);
    this.host.removeEventListener("dragleave", this.#clearDropMarker);
    this.host.removeEventListener("drop", this.#onDrop);
    await Promise.all([...this.#cards.keys()].map((id) => this.removePanel(id)));
    await Promise.all([...this.#pendingUnmounts]);
  }

  /**
   * Insertion index for a pointer position. `getBoundingClientRect` is
   * viewport-relative, so this is correct at any `scrollTop`.
   */
  #dropIndex(clientY: number): number {
    const cards = [...this.host.children] as HTMLElement[];
    const before = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return before === -1 ? cards.length : before;
  }

  #clearDropMarker = (): void => {
    for (const card of [...this.host.children] as HTMLElement[]) {
      card.style.borderTop = "";
      card.style.borderBottom = "";
    }
  };

  #markDropIndex(index: number): void {
    this.#clearDropMarker();
    const cards = [...this.host.children] as HTMLElement[];
    const marker = "2px solid var(--df-accent, #58a6ff)";
    if (index < cards.length) cards[index]!.style.borderTop = marker;
    else cards[cards.length - 1]?.style.setProperty("border-bottom", marker);
  }

  #onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes(RAIL_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    this.#markDropIndex(this.#dropIndex(event.clientY));
  };

  #onDrop = (event: DragEvent): void => {
    const id = event.dataTransfer?.getData(RAIL_DRAG_TYPE);
    this.#clearDropMarker();
    if (!id) return;
    event.preventDefault();
    const index = this.#dropIndex(event.clientY);
    const card = this.#cards.get(id)?.element;
    if (!card) {
      // Card belongs to a sibling rail. Let the caller re-home it.
      this.callbacks.onAcceptForeign?.(id, index);
      return;
    }

    const children = [...this.host.children] as HTMLElement[];
    const current = children.indexOf(card);
    // Removing the card shifts every later position down by one.
    const others = children.filter((child) => child !== card);
    const target = index > current ? index - 1 : index;
    if (target === current) return;
    this.host.insertBefore(card, others[target] ?? null);
    this.callbacks.onChange?.();
  };

  /** Public: display the drop marker at the pointer position. */
  markDropIndicatorAt(clientY: number): void {
    this.#markDropIndex(this.#dropIndex(clientY));
  }

  /** Public: pointer-derived insertion index; correct at any scrollTop. */
  dropIndexAt(clientY: number): number {
    return this.#dropIndex(clientY);
  }

  /** Public: clear any drop marker left by the pointer. */
  clearDropIndicator(): void {
    this.#clearDropMarker();
  }

  /** Public: bring a card into view. Used after dock-back so the returned card is not offscreen. */
  scrollCardIntoView(id: string): void {
    const card = this.#cards.get(id)?.element;
    card?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  focusPanel(id: string): void {
    this.#cards.get(id)?.header.element.querySelector<HTMLElement>("button")?.focus();
  }

  setCollapsed(id: string, collapsed: boolean): void {
    const card = this.#cards.get(id);
    const wrapper = card?.element.querySelector<HTMLElement>(".df-rail-card-body");
    if (!card || !wrapper) return;
    wrapper.hidden = collapsed;
    card.header.setCollapsed(collapsed);
  }

  #toggleCollapse(id: string): boolean {
    const wrapper = this.#cards.get(id)?.element.querySelector<HTMLElement>(".df-rail-card-body");
    if (!wrapper) return false;
    wrapper.hidden = !wrapper.hidden;
    this.callbacks.onChange?.();
    return wrapper.hidden;
  }

  #float(id: string): boolean {
    this.callbacks.onFloat?.(id);
    return true;
  }

  async #close(id: string): Promise<void> {
    if ((await this.callbacks.requestClose?.(id)) === false) return;
    await this.removePanel(id);
    this.callbacks.onChange?.();
  }
}
