import ChevronsDownUp from "@lucide/svelte/icons/chevrons-down-up";
import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
import Dock from "@lucide/svelte/icons/dock";
import Ellipsis from "@lucide/svelte/icons/ellipsis";
import SquareSquare from "@lucide/svelte/icons/square-square";
import X from "@lucide/svelte/icons/x";
import { mount, unmount } from "svelte";
import type { Writable } from "svelte/store";
import { LifecycleDiagnostics } from "./lifecycle-diagnostics";
import type { PanelSettingsTarget, PanelState, WorkspaceRendererDefinition } from "./workspace";

/**
 * Vendor-neutral panel parts shared by the Dockview adapter and the Scrollview
 * rails. Nothing here imports Dockview; the adapter subclasses these to add the
 * Dockview-shaped `init`/`update` entry points.
 */

let rootSequence = 0;

export interface TabActions {
  close?: (() => void) | undefined;
  collapse?: (() => boolean) | undefined;
  configure?: ((target: PanelSettingsTarget) => void) | undefined;
  floatDock?: (() => boolean) | undefined;
}

type IconComponent = typeof X;

export class PanelCardHeader {
  readonly element = document.createElement("div");
  readonly #label = document.createElement("span");
  readonly #closeButton: HTMLButtonElement | undefined = undefined;
  readonly #collapseButton: HTMLButtonElement | undefined = undefined;
  readonly #configureButton: HTMLButtonElement | undefined = undefined;
  readonly #floatButton: HTMLButtonElement | undefined = undefined;
  readonly #iconRoots: Record<string, unknown>[] = [];
  protected titleSubscription: { dispose(): void } | undefined;
  protected locationSubscription: { dispose(): void } | undefined;
  #title = "";
  #collapsed = false;
  #floating: boolean;

  constructor(
    private readonly panelId: string,
    actions: TabActions,
    floating: boolean,
    private readonly onDispose?: () => void,
  ) {
    this.#floating = floating;
    this.element.className = "dv-default-tab";
    this.element.dataset.panelDragHandle = "true";
    this.element.dataset.panelId = panelId;
    this.#label.className = "dv-default-tab-content";
    this.element.appendChild(this.#label);

    if (actions.configure) {
      this.#configureButton = this.#createAction([Ellipsis], () => {
        actions.configure!({
          button: this.#configureButton!,
          floating: this.#floating || this.element.closest(".dv-resize-container") !== null,
          panelId: this.panelId,
          title: this.#title,
        });
      });
    }

    if (actions.collapse) {
      this.#collapseButton = this.#createAction([ChevronsDownUp, ChevronsUpDown], () => {
        this.#collapsed = actions.collapse!();
        this.#refreshLabels();
      });
    }
    if (actions.floatDock) {
      this.#floatButton = this.#createAction([SquareSquare, Dock], () => {
        this.#floating = actions.floatDock!();
        this.#refreshLabels();
      });
    }
    if (actions.close) {
      this.#closeButton = this.#createAction([X], actions.close);
    }
  }

  #createAction(icons: readonly IconComponent[], handler: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dv-default-tab-action df-tab-action";
    button.style.background = "none";
    button.style.border = "0";
    button.style.color = "inherit";
    button.style.cursor = "pointer";
    button.style.font = "inherit";
    for (const [index, icon] of icons.entries()) {
      const slot = document.createElement("span");
      slot.style.alignItems = "center";
      slot.style.display = index === 0 ? "inline-flex" : "none";
      slot.style.paddingTop = "0px";
      button.appendChild(slot);
      const root = mount(icon, { target: slot, props: { size: 14 } });
      this.#iconRoots.push(root);
    }
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
    this.element.appendChild(button);
    return button;
  }

  dispose(): void {
    this.titleSubscription?.dispose();
    this.titleSubscription = undefined;
    this.locationSubscription?.dispose();
    this.locationSubscription = undefined;
    for (const root of this.#iconRoots) void unmount(root);
    this.onDispose?.();
    this.element.remove();
  }

  setCloseButtonVisible(visible: boolean): void {
    if (!this.#closeButton) return;
    this.#closeButton.hidden = !visible;
    this.#closeButton.disabled = !visible;
    this.#closeButton.style.display = visible ? "" : "none";
  }

  /**
   * Track the pane's real location. A pane dragged out to float never presses
   * the float control, so without this the control keeps offering "Float" on an
   * already-floating pane -- which is the only dock affordance a keyboard user
   * has.
   */
  setFloating(floating: boolean): void {
    this.#floating = floating;
    this.#refreshLabels();
  }

  setCollapsed(collapsed: boolean): void {
    this.#collapsed = collapsed;
    this.#refreshLabels();
  }

  setTitle(title: string | undefined): void {
    this.#title = title ?? this.panelId;
    this.#label.textContent = title ?? "";
    this.#refreshLabels();
  }

  #refreshLabels(): void {
    // `aria-label` reaches screen readers; `title` is the sighted hover tooltip
    // native browsers show on button hover. Set both so keyboard, screen-reader,
    // and pointer users all see the same intent.
    const close = `Close ${this.#title}`;
    const collapse = `${this.#collapsed ? "Expand" : "Collapse"} ${this.#title}`;
    const floatDock = `${this.#floating ? "Dock" : "Float"} ${this.#title}`;
    const configure = `Settings for ${this.#title}`;
    this.#showActionIcon(this.#collapseButton, this.#collapsed ? 1 : 0);
    this.#showActionIcon(this.#floatButton, this.#floating ? 1 : 0);
    for (const [btn, label] of [
      [this.#closeButton, close],
      [this.#collapseButton, collapse],
      [this.#floatButton, floatDock],
      [this.#configureButton, configure],
    ] as const) {
      if (!btn) continue;
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
    }
  }

  #showActionIcon(button: HTMLButtonElement | undefined, index: number): void {
    if (!button) return;
    for (const [childIndex, child] of [...button.children].entries()) {
      (child as HTMLElement).style.display = childIndex === index ? "inline-flex" : "none";
    }
  }
}

export class SveltePanelBody {
  readonly element = document.createElement("div");
  #disposed = false;
  #mounted = false;
  #root: Record<string, unknown> | undefined;
  #unmountPromise: Promise<void> | undefined;

  constructor(
    private readonly panelId: string,
    private readonly definition: WorkspaceRendererDefinition,
    private readonly state: Writable<PanelState>,
    private readonly diagnostics: LifecycleDiagnostics,
    private readonly onDisposed: (renderer: SveltePanelBody) => void,
  ) {
    this.element.dataset.workspaceOwned = "true";
    this.element.dataset.workspaceRootId = panelId;
    this.element.style.height = "100%";
    this.diagnostics.registerHost(this.element);
  }

  initState(params: PanelState): void {
    if (this.#disposed || this.#root) {
      return;
    }

    this.state.set(params);
    this.refreshPresentation();
    this.#root = mount(this.definition.component, {
      target: this.element,
      props: {
        panelId: this.panelId,
        state: this.state,
        ...(this.definition.session ? { session: this.definition.session } : {}),
        ...this.definition.componentProps,
      },
    });
    this.element.dataset.workspaceRootId = `${this.panelId}-${++rootSequence}`;
    this.#mounted = true;
    this.diagnostics.mountRoot(this.panelId, this.element);
  }

  dispose(): void {
    if (this.#disposed) {
      this.diagnostics.recordDuplicateDisposal();
      return;
    }

    this.#disposed = true;
    if (!this.#root) {
      this.#finishDispose();
      this.#unmountPromise = Promise.resolve();
      return;
    }

    this.#unmountPromise = this.diagnostics.trackUnmount(
      unmount(this.#root).then(
        () => this.#finishDispose(),
        (error: unknown) => {
          this.#finishDispose();
          throw error;
        },
      ),
    );
  }

  whenDisposed(): Promise<void> {
    return this.#unmountPromise ?? Promise.resolve();
  }

  refreshPresentation(): void {
    const fontSize = this.definition.panelPreference?.(this.panelId)?.fontSize;
    if (fontSize === undefined) {
      this.element.style.removeProperty("--pane-font-scale");
      this.element.style.removeProperty("font-size");
    } else {
      this.element.style.setProperty("--pane-font-scale", String(fontSize / 12));
      this.element.style.fontSize = `${fontSize}px`;
    }
  }

  #finishDispose(): void {
    if (this.#mounted) {
      this.diagnostics.unmountRoot(this.panelId);
    }
    this.diagnostics.unregisterHost(this.element);
    this.element.remove();
    this.onDisposed(this);
  }
}
