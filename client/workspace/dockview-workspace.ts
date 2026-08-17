import "./dockview-styles.js";

import {
  createDockview,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
  type ITabRenderer,
  type Parameters as DockviewParameters,
  type TabPartInitParameters,
} from "dockview";
import { mount, unmount } from "svelte";
import { writable, type Writable } from "svelte/store";
import { LifecycleDiagnostics } from "./lifecycle-diagnostics";
import type {
  PanelPlacement,
  PanelState,
  Workspace,
  WorkspacePanelSpec,
  WorkspaceRendererDefinition,
  WorkspaceRendererRegistry,
  WorkspaceSnapshot,
} from "./workspace";

interface PanelRecord {
  readonly id: string;
  kind: string;
  state: Writable<PanelState>;
  title: string;
}

interface DockviewPanelLike {
  api: {
    moveTo(options: {
      group: unknown;
      position: "top" | "bottom" | "left" | "right" | "center";
    }): void;
    setSize(size: { width?: number; height?: number }): void;
    setTitle(title: string): void;
    setActive(): void;
    updateParameters(parameters: PanelState): void;
    readonly location: { readonly type: "grid" | "floating" | "popout" };
  };
  group: {
    element: HTMLElement;
    api: {
      setConstraints(value: {
        minimumWidth?: number;
        maximumWidth?: number;
        minimumHeight?: number;
        maximumHeight?: number;
      }): void;
    };
  };
}

let rootSequence = 0;

export interface WorkspacePanelInspection {
  active: boolean;
  bounds: { height: number; left: number; top: number; width: number };
  floating: boolean;
  groupId: string | null;
  groupIndex: number;
  mountCount: number;
  panelIndex: number;
  rootIdentity: string;
  title: string;
}

export interface WorkspaceInspector {
  inspectPanel(id: string): WorkspacePanelInspection | null;
}

interface TabActions {
  close?: (() => void) | undefined;
  collapse?: (() => boolean) | undefined;
  floatDock?: (() => boolean) | undefined;
}

class WorkspaceTabRenderer implements ITabRenderer {
  readonly element = document.createElement("div");
  readonly #label = document.createElement("span");
  readonly #closeButton: HTMLButtonElement | undefined = undefined;
  readonly #collapseButton: HTMLButtonElement | undefined = undefined;
  readonly #floatButton: HTMLButtonElement | undefined = undefined;
  #titleSubscription: { dispose(): void } | undefined;
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

    if (actions.collapse) {
      this.#collapseButton = this.#createAction("–", () => {
        this.#collapsed = actions.collapse!();
        this.#refreshLabels();
      });
    }
    if (actions.floatDock) {
      this.#floatButton = this.#createAction("❐", () => {
        this.#floating = actions.floatDock!();
        this.#refreshLabels();
      });
    }
    if (actions.close) {
      this.#closeButton = this.#createAction("×", actions.close);
    }
  }

  #createAction(glyph: string, handler: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dv-default-tab-action df-tab-action";
    button.textContent = glyph;
    button.style.background = "none";
    button.style.border = "0";
    button.style.color = "inherit";
    button.style.cursor = "pointer";
    button.style.font = "inherit";
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

  init(parameters: TabPartInitParameters): void {
    this.#setTitle(parameters.title);
    this.#titleSubscription = parameters.api.onDidTitleChange(({ title }) => {
      this.#setTitle(title);
    });
  }

  update(parameters: DockviewParameters): void {
    if (typeof parameters.title === "string") {
      this.#setTitle(parameters.title);
    }
  }

  dispose(): void {
    this.#titleSubscription?.dispose();
    this.#titleSubscription = undefined;
    this.onDispose?.();
    this.element.remove();
  }

  setCloseButtonVisible(visible: boolean): void {
    if (!this.#closeButton) return;
    this.#closeButton.hidden = !visible;
    this.#closeButton.disabled = !visible;
    this.#closeButton.style.display = visible ? "" : "none";
  }

  #setTitle(title: string | undefined): void {
    this.#title = title ?? this.panelId;
    this.#label.textContent = title ?? "";
    this.#refreshLabels();
  }

  #refreshLabels(): void {
    this.#closeButton?.setAttribute("aria-label", `Close ${this.#title}`);
    this.#collapseButton?.setAttribute(
      "aria-label",
      `${this.#collapsed ? "Expand" : "Collapse"} ${this.#title}`,
    );
    this.#floatButton?.setAttribute(
      "aria-label",
      `${this.#floating ? "Dock" : "Float"} ${this.#title}`,
    );
  }
}

class SvelteDockviewRenderer implements IContentRenderer {
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
    private readonly onDisposed: (renderer: SvelteDockviewRenderer) => void,
  ) {
    this.element.dataset.workspaceOwned = "true";
    this.element.dataset.workspaceRootId = panelId;
    this.element.style.height = "100%";
    this.diagnostics.registerHost(this.element);
  }

  init(parameters: GroupPanelPartInitParameters): void {
    if (this.#disposed || this.#root) {
      return;
    }

    this.state.set(parameters.params as PanelState);
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

  #finishDispose(): void {
    if (this.#mounted) {
      this.diagnostics.unmountRoot(this.panelId);
    }
    this.diagnostics.unregisterHost(this.element);
    this.element.remove();
    this.onDisposed(this);
  }
}

/**
 * The only Dockview-aware implementation. The public workspace contract stays
 * vendor-neutral in workspace.ts.
 */
export function createWorkspace(
  host: HTMLElement,
  registry: WorkspaceRendererRegistry,
  diagnostics = new LifecycleDiagnostics(),
): Workspace & WorkspaceInspector {
  const records = new Map<string, PanelRecord>();
  const renderers = new Map<string, SvelteDockviewRenderer>();
  const tabRenderers = new Map<string, WorkspaceTabRenderer>();
  const paneConstraints = new Map<
    string,
    { minimumWidth?: number; maximumWidth?: number; minimumHeight?: number }
  >();
  const collapsedPanes = new Set<string>();
  const pendingUnmounts = new Set<Promise<void>>();
  const layoutSubscribers = new Set<(snapshot: WorkspaceSnapshot) => void>();
  let disposed = false;
  let disposePromise: Promise<void> | undefined;
  let requestClosePanel: (id: string) => Promise<boolean> = async () => false;
  let suppressLayoutEvents = true;

  const api = createDockview(host, {
    createTabComponent: ({ id }) => {
      const record = records.get(id);
      const definition = record ? registry[record.kind] : undefined;
      const floating =
        (api.getPanel(id) as DockviewPanelLike | undefined)?.api.location.type === "floating";
      const tab = new WorkspaceTabRenderer(
        id,
        {
          close: definition?.canClose ? () => void requestClosePanel(id) : undefined,
          collapse: definition?.collapsible ? () => toggleCollapse(id) : undefined,
          floatDock: definition?.floatable ? () => toggleFloatDock(id) : undefined,
        },
        floating,
        () => tabRenderers.delete(id),
      );
      tab.setCloseButtonVisible(
        definition?.showCloseButton?.(id) ?? definition?.canClose !== undefined,
      );
      tabRenderers.set(id, tab);
      return tab;
    },
    createComponent: ({ id, name }) => {
      const record = records.get(id);
      const definition = registry[name];

      if (!record || !definition) {
        throw new Error(`No workspace renderer is registered for panel '${id}' of kind '${name}'.`);
      }

      const renderer = new SvelteDockviewRenderer(
        id,
        definition,
        record.state,
        diagnostics,
        (disposedRenderer) => {
          if (renderers.get(id) === disposedRenderer) {
            renderers.delete(id);
          }
        },
      );
      renderers.set(id, renderer);
      return renderer;
    },
    dndStrategy: "pointer",
    floatingGroupDragHandle: "titlebar",
    keyboardNavigation: true,
  });

  const annotateFloatingTitlebars = () => {
    const floatingPanels = api.panels.filter((panel) => panel.api.location.type === "floating");
    const titlebars = host.querySelectorAll<HTMLElement>(".dv-floating-titlebar");
    for (const [index, titlebar] of [...titlebars].entries()) {
      titlebar.dataset.floatingDragHandle = "true";
      const panel = floatingPanels[index];
      if (panel) {
        titlebar.dataset.panelId = panel.group.activePanel?.id ?? panel.id;
      } else {
        delete titlebar.dataset.panelId;
      }
    }
  };
  const emitLayout = () => {
    annotateFloatingTitlebars();
    if (disposed || suppressLayoutEvents) {
      return;
    }

    const snapshot: WorkspaceSnapshot = { layout: api.toJSON(), version: 1 };
    for (const listener of layoutSubscribers) {
      listener(snapshot);
    }
  };
  const releaseLayoutListener = diagnostics.trackResource("listener");
  const layoutListener = api.onDidLayoutChange(emitLayout);
  const layoutHost = () => {
    diagnostics.recordLayout();
    api.layout(host.clientWidth, host.clientHeight, true);
  };
  const releaseResizeObserver = diagnostics.trackResource("observer");
  const resizeObserver = new ResizeObserver(() => {
    if (!disposed) {
      layoutHost();
    }
  });
  resizeObserver.observe(host);
  requestAnimationFrame(() => {
    suppressLayoutEvents = false;
  });

  const suppressLayoutEventsForFrame = () => {
    suppressLayoutEvents = true;
    requestAnimationFrame(() => {
      suppressLayoutEvents = false;
    });
  };

  const assertUsable = () => {
    if (disposed) {
      throw new Error("Workspace has been disposed.");
    }
  };

  const trackUnmount = (renderer: SvelteDockviewRenderer | undefined) => {
    if (!renderer) {
      return;
    }

    const pending = renderer.whenDisposed();
    pendingUnmounts.add(pending);
    void pending.then(
      () => pendingUnmounts.delete(pending),
      () => pendingUnmounts.delete(pending),
    );
  };

  const waitForUnmounts = async () => {
    while (pendingUnmounts.size > 0) {
      await Promise.all([...pendingUnmounts]);
    }
    await diagnostics.whenIdle();
  };

  const preserveOwnedFocus = (operation: () => void) => {
    const focused = document.activeElement;
    const ownedFocus =
      focused instanceof HTMLElement && host.contains(focused) ? focused : undefined;
    operation();
    if (!ownedFocus) {
      return;
    }

    const restoreFocus = () => {
      if (ownedFocus.isConnected && document.activeElement !== ownedFocus) {
        ownedFocus.focus({ preventScroll: true });
      }
    };
    restoreFocus();
    queueMicrotask(restoreFocus);
    requestAnimationFrame(restoreFocus);
  };

  const makeRecord = (spec: WorkspacePanelSpec): PanelRecord => ({
    id: spec.id,
    kind: spec.kind,
    state: writable(spec.state),
    title: spec.title,
  });

  const updateRecord = (record: PanelRecord, spec: WorkspacePanelSpec) => {
    if (record.kind !== spec.kind) {
      throw new Error(`Panel '${spec.id}' cannot change renderer kind while it is mounted.`);
    }

    record.title = spec.title;
    record.state.set(spec.state);
    diagnostics.updateRoot();
  };

  const rendererMode = (spec: WorkspacePanelSpec): "always" | "onlyWhenVisible" => {
    const definition = registry[spec.kind];
    if (!definition) {
      throw new Error(`No workspace renderer is registered for kind '${spec.kind}'.`);
    }

    return definition.preserveDomWhenHidden || spec.kind === "terminal"
      ? "always"
      : "onlyWhenVisible";
  };

  const panelOptions = (spec: WorkspacePanelSpec) => ({
    component: spec.kind,
    id: spec.id,
    params: spec.state,
    ...(spec.size?.height !== undefined ? { initialHeight: spec.size.height } : {}),
    ...(spec.size?.width !== undefined ? { initialWidth: spec.size.width } : {}),
    renderer: rendererMode(spec),
    tabComponent: "workspace-tab",
    title: spec.title,
  });

  // A fixed grid width (rails) or a resize minimum survives Dockview's
  // proportional rebalancing only as a group constraint; initialWidth/setSize
  // alone get rebalanced away. Floating panels size via bounds, so they are
  // left unconstrained here and clamped to the host instead.
  const applyPaneConstraints = (panel: unknown, spec: WorkspacePanelSpec): void => {
    if (spec.placement?.kind === "floating") return;
    const constraints: {
      minimumWidth?: number;
      maximumWidth?: number;
      minimumHeight?: number;
    } = {};
    if (spec.size?.width !== undefined) {
      constraints.minimumWidth = spec.size.width;
      constraints.maximumWidth = spec.size.width;
    } else if (spec.minSize?.width !== undefined) {
      constraints.minimumWidth = spec.minSize.width;
    }
    if (spec.minSize?.height !== undefined) constraints.minimumHeight = spec.minSize.height;
    if (Object.keys(constraints).length === 0) return;
    paneConstraints.set(spec.id, constraints);
    // Constrain the group (gridview) rather than the panel (splitview) axis.
    (panel as DockviewPanelLike).group.api.setConstraints(constraints);
  };

  const COLLAPSED_HEIGHT = 30;

  /** Collapse hides the pane body but keeps the header and the mounted content. */
  const toggleCollapse = (id: string): boolean => {
    const panel = api.getPanel(id) as DockviewPanelLike | undefined;
    if (!panel) return false;
    const stored = paneConstraints.get(id) ?? {};
    if (collapsedPanes.has(id)) {
      collapsedPanes.delete(id);
      panel.group.element.removeAttribute("data-collapsed");
      panel.group.api.setConstraints({
        ...stored,
        minimumHeight: stored.minimumHeight ?? 0,
        maximumHeight: 100_000,
      });
    } else {
      collapsedPanes.add(id);
      panel.group.element.setAttribute("data-collapsed", "true");
      panel.group.api.setConstraints({
        ...stored,
        minimumHeight: COLLAPSED_HEIGHT,
        maximumHeight: COLLAPSED_HEIGHT,
      });
      panel.api.setSize({ height: COLLAPSED_HEIGHT });
    }
    return collapsedPanes.has(id);
  };

  /** Float a docked pane (centered, clamped) or dock a floating pane back to the grid. */
  const toggleFloatDock = (id: string): boolean => {
    const panel = api.getPanel(id) as DockviewPanelLike | undefined;
    if (!panel) return false;
    if (panel.api.location.type === "floating") {
      const anchor = api.panels.find(
        (candidate) =>
          candidate.id !== id &&
          (candidate as unknown as DockviewPanelLike).api.location.type === "grid",
      );
      if (anchor) {
        applyPlacement(panel, { kind: "grid", direction: "right", referencePanelId: anchor.id });
      }
      return false;
    }
    const hostWidth = host.clientWidth || window.innerWidth;
    const hostHeight = host.clientHeight || window.innerHeight;
    const width = Math.min(440, Math.max(280, Math.round(hostWidth * 0.4)));
    const height = Math.min(420, Math.max(220, Math.round(hostHeight * 0.5)));
    applyPlacement(panel, {
      kind: "floating",
      bounds: {
        left: Math.max(0, Math.round((hostWidth - width) / 2)),
        top: Math.max(0, Math.round((hostHeight - height) / 3)),
        width,
        height,
      },
    });
    return true;
  };

  // Keep a floating pane within the host so a grab handle stays reachable.
  const clampFloatingBounds = (bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): { x: number; y: number; width: number; height: number } => {
    const hostWidth = host.clientWidth || window.innerWidth;
    const hostHeight = host.clientHeight || window.innerHeight;
    const width = Math.max(160, Math.min(bounds.width, hostWidth));
    const height = Math.max(80, Math.min(bounds.height, hostHeight));
    return {
      width,
      height,
      x: Math.max(0, Math.min(bounds.left, Math.max(0, hostWidth - 48))),
      y: Math.max(0, Math.min(bounds.top, Math.max(0, hostHeight - 24))),
    };
  };

  const addPanel = (spec: WorkspacePanelSpec): void => {
    const options = panelOptions(spec);
    const placement = spec.placement;

    if (placement?.kind === "floating") {
      api.addPanel({ ...options, floating: clampFloatingBounds(placement.bounds) });
      queueMicrotask(annotateFloatingTitlebars);
      return;
    }

    if (placement?.kind === "grid" && placement.referencePanelId) {
      applyPaneConstraints(
        api.addPanel({
          ...options,
          position: {
            direction: placement.direction ?? "within",
            referencePanel: placement.referencePanelId,
          },
        }),
        spec,
      );
      queueMicrotask(annotateFloatingTitlebars);
      return;
    }

    if (placement?.kind === "grid" && placement.direction && placement.direction !== "within") {
      applyPaneConstraints(
        api.addPanel({ ...options, position: { direction: placement.direction } }),
        spec,
      );
      queueMicrotask(annotateFloatingTitlebars);
      return;
    }

    applyPaneConstraints(api.addPanel(options), spec);
    queueMicrotask(annotateFloatingTitlebars);
  };

  const applyPlacement = (panel: DockviewPanelLike, placement: PanelPlacement): void => {
    if (placement.kind === "floating") {
      api.addFloatingGroup(panel as never, clampFloatingBounds(placement.bounds));
      panel.api.setActive();
      return;
    }

    if (placement.referencePanelId) {
      const reference = api.getPanel(placement.referencePanelId);
      if (!reference) {
        throw new Error(`Cannot place panel: '${placement.referencePanelId}' does not exist.`);
      }

      panel.api.moveTo({
        group: reference.group,
        position:
          placement.direction === "above"
            ? "top"
            : placement.direction === "below"
              ? "bottom"
              : placement.direction === "left"
                ? "left"
                : placement.direction === "right"
                  ? "right"
                  : "center",
      });
      panel.api.setActive();
      return;
    }

    if (placement.direction && placement.direction !== "within") {
      const group = api.addGroup({ direction: placement.direction });
      panel.api.moveTo({ group, position: "center" });
      panel.api.setActive();
    }
  };

  const inspectPanel = (id: string): WorkspacePanelInspection | null => {
    const panel = api.getPanel(id);
    if (!panel) {
      return null;
    }

    const root = renderers.get(id)?.element;
    const group = panel.group;
    const groupBounds = group.api.boundingBox;
    const hostBounds = host.getBoundingClientRect();
    const rootBounds = root?.getBoundingClientRect();
    const bounds = groupBounds
      ? {
          height: groupBounds.height,
          left: hostBounds.left + groupBounds.left,
          top: hostBounds.top + groupBounds.top,
          width: groupBounds.width,
        }
      : rootBounds;
    return {
      active: api.activePanel?.id === id,
      bounds: {
        height: bounds?.height ?? 0,
        left: bounds?.left ?? 0,
        top: bounds?.top ?? 0,
        width: bounds?.width ?? 0,
      },
      floating: panel.api.location.type === "floating",
      groupId: group.id,
      groupIndex: api.groups.indexOf(group),
      mountCount: diagnostics.mountCount(id),
      panelIndex: group.panels.indexOf(panel),
      rootIdentity: root?.dataset.workspaceRootId ?? "",
      title: panel.title ?? "",
    };
  };

  const removePanel = async (id: string): Promise<void> => {
    assertUsable();
    const panel = api.getPanel(id);
    if (!panel) {
      records.delete(id);
      return;
    }

    const renderer = renderers.get(id);
    records.delete(id);
    api.removePanel(panel);
    trackUnmount(renderer);
    queueMicrotask(annotateFloatingTitlebars);
    await waitForUnmounts();
  };

  requestClosePanel = async (id: string): Promise<boolean> => {
    const record = records.get(id);
    const definition = record ? registry[record.kind] : undefined;
    if (definition?.canClose && !definition.canClose(id)) return false;
    await removePanel(id);
    return true;
  };

  return {
    addOrUpdatePanel(spec) {
      assertUsable();
      const existingRecord = records.get(spec.id);
      if (existingRecord) {
        updateRecord(existingRecord, spec);
        const definition = registry[spec.kind];
        tabRenderers
          .get(spec.id)
          ?.setCloseButtonVisible(
            definition?.showCloseButton?.(spec.id) ?? definition?.canClose !== undefined,
          );
        const panel = api.getPanel(spec.id);
        if (!panel) {
          addPanel(spec);
          return;
        }

        panel.api.setTitle(spec.title);
        panel.api.updateParameters(spec.state);
        if (spec.size) {
          panel.api.setSize(spec.size);
        }
        if (spec.placement) {
          preserveOwnedFocus(() => {
            applyPlacement(panel as unknown as DockviewPanelLike, spec.placement!);
          });
        }
        if (spec.size || spec.placement) {
          layoutHost();
        }
        return;
      }

      records.set(spec.id, makeRecord(spec));
      addPanel(spec);
    },

    activatePanel(id) {
      assertUsable();
      const panel = api.getPanel(id);
      if (panel) {
        preserveOwnedFocus(() => panel.api.setActive());
      }
    },

    hasPanel(id) {
      return !disposed && api.getPanel(id) !== undefined;
    },

    removePanel,

    requestClosePanel,

    save() {
      assertUsable();
      return { layout: api.toJSON(), version: 1 };
    },

    restore(snapshot, panels) {
      assertUsable();
      if (snapshot.version !== 1 || !isObject(snapshot.layout)) {
        suppressLayoutEventsForFrame();
        api.clear();
        for (const renderer of renderers.values()) {
          trackUnmount(renderer);
        }
        return false;
      }

      try {
        suppressLayoutEventsForFrame();
        for (const spec of panels) {
          const record = records.get(spec.id);
          if (record) {
            updateRecord(record, spec);
          } else {
            records.set(spec.id, makeRecord(spec));
          }
        }
        preserveOwnedFocus(() => {
          api.fromJSON(snapshot.layout as never, { reuseExistingPanels: true });
          layoutHost();
        });
        queueMicrotask(annotateFloatingTitlebars);
        return true;
      } catch {
        suppressLayoutEventsForFrame();
        api.clear();
        for (const renderer of renderers.values()) {
          trackUnmount(renderer);
        }
        return false;
      }
    },

    subscribeLayout(listener) {
      assertUsable();
      layoutSubscribers.add(listener);
      return () => layoutSubscribers.delete(listener);
    },

    dispose() {
      if (disposePromise) {
        return disposePromise;
      }

      disposed = true;
      layoutSubscribers.clear();
      api.dispose();
      layoutListener.dispose();
      releaseLayoutListener();
      resizeObserver.disconnect();
      releaseResizeObserver();
      for (const renderer of renderers.values()) {
        trackUnmount(renderer);
      }
      disposePromise = waitForUnmounts().finally(() => {
        host.replaceChildren();
      });
      return disposePromise;
    },
    inspectPanel,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
