import "./dockview-styles.js";

import {
  createDockview,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
  type ITabRenderer,
  type Parameters as DockviewParameters,
  type TabPartInitParameters,
} from "dockview";
import { get, writable, type Writable } from "svelte/store";
import { attractFloatingResize, FLOATING_SNAP_DISTANCE, FLOATING_SNAP_GAP } from "./floating-snap";
import { LifecycleDiagnostics } from "./lifecycle-diagnostics";
import { PanelCardHeader, SveltePanelBody } from "./panel-parts";
import type {
  PanelPlacement,
  PanelState,
  Workspace,
  WorkspacePanelSpec,
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

type FloatingBounds = { height: number; left: number; top: number; width: number };
type FloatingSnapTarget = FloatingBounds & { element: HTMLElement };

// Legacy snapping adjusts only the current drag position; it never links the panes.
function attractFloatingGroup<T extends FloatingBounds>(
  proposed: FloatingBounds,
  others: readonly T[],
): { left: number; target: T; top: number } | undefined {
  const right = proposed.left + proposed.width;
  const bottom = proposed.top + proposed.height;
  const overlaps = (start: number, end: number, otherStart: number, otherEnd: number) =>
    end >= otherStart - FLOATING_SNAP_DISTANCE && otherEnd >= start - FLOATING_SNAP_DISTANCE;
  let left = proposed.left;
  let top = proposed.top;
  let nearestLeft = FLOATING_SNAP_DISTANCE + 1;
  let nearestTop = FLOATING_SNAP_DISTANCE + 1;
  let target: T | undefined;

  for (const other of others) {
    const otherRight = other.left + other.width;
    const otherBottom = other.top + other.height;
    if (overlaps(proposed.top, bottom, other.top, otherBottom)) {
      for (const candidate of [
        otherRight + FLOATING_SNAP_GAP,
        other.left - proposed.width - FLOATING_SNAP_GAP,
        other.left,
        otherRight - proposed.width,
      ]) {
        const distance = Math.abs(proposed.left - candidate);
        if (distance < nearestLeft && distance <= FLOATING_SNAP_DISTANCE) {
          nearestLeft = distance;
          left = candidate;
          target = other;
        }
      }
    }
    if (overlaps(proposed.left, right, other.left, otherRight)) {
      for (const candidate of [
        otherBottom + FLOATING_SNAP_GAP,
        other.top - proposed.height - FLOATING_SNAP_GAP,
        other.top,
        otherBottom - proposed.height,
      ]) {
        const distance = Math.abs(proposed.top - candidate);
        if (distance < nearestTop && distance <= FLOATING_SNAP_DISTANCE) {
          nearestTop = distance;
          top = candidate;
          target = other;
        }
      }
    }
  }

  return target ? { left, target, top } : undefined;
}

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
class WorkspaceTabRenderer extends PanelCardHeader implements ITabRenderer {
  init(parameters: TabPartInitParameters): void {
    this.setTitle(parameters.title);
    // A pane created already floating never fires a location *change*, so seed
    // the control from the api rather than trusting the construction-time guess.
    this.setFloating(parameters.api.location.type === "floating");
    this.titleSubscription = parameters.api.onDidTitleChange(({ title }) => {
      this.setTitle(title);
    });
    this.locationSubscription = parameters.api.onDidLocationChange(({ location }) => {
      this.setFloating(location.type === "floating");
    });
  }

  update(parameters: DockviewParameters): void {
    if (typeof parameters.title === "string") {
      this.setTitle(parameters.title);
    }
  }
}

class SvelteDockviewRenderer extends SveltePanelBody implements IContentRenderer {
  init(parameters: GroupPanelPartInitParameters): void {
    this.initState(parameters.params as PanelState);
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
  const expandedFloatingHeights = new Map<string, number>();
  const pendingUnmounts = new Set<Promise<void>>();
  const layoutSubscribers = new Set<(snapshot: WorkspaceSnapshot) => void>();
  const panelDragSubscribers = new Set<(event: { cancel(): void; panelId: string }) => void>();
  let dragSnapTargets: FloatingSnapTarget[] = [];
  let activeSnapTarget: HTMLElement | undefined;
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
          configure: definition?.configure
            ? (target) =>
                definition.configure!({
                  ...target,
                  floating: Boolean(
                    api.getPanel(id)?.group.element.closest<HTMLElement>(".dv-resize-container"),
                  ),
                })
            : undefined,
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
    // Keep floating groups fully inside the overlay host. Without this, a user
    // drag on the titlebar can push the pane so far off-centre that only its
    // titlebar peeks in from the edge -- the rest is clipped by the host's
    // `overflow: hidden`.
    floatingGroupBounds: "boundedWithinViewport",
    floatingGroupDragHandle: "titlebar",
    transformFloatingGroupDrag: ({ proposed, others }) => {
      const snapped = attractFloatingGroup(
        proposed,
        dragSnapTargets.length > 0 ? dragSnapTargets : others,
      );
      setSnapTarget(
        snapped?.target &&
          "element" in snapped.target &&
          snapped.target.element instanceof HTMLElement
          ? snapped.target.element
          : undefined,
      );
      return snapped ? { left: snapped.left, top: snapped.top } : undefined;
    },
    keyboardNavigation: true,
    singleTabMode: "fullwidth",
  });

  const setSnapTarget = (target?: HTMLElement): void => {
    if (activeSnapTarget === target) return;
    activeSnapTarget?.classList.remove("df-floating-snap-target");
    activeSnapTarget = target;
    activeSnapTarget?.classList.add("df-floating-snap-target");
  };

  const snapshotDockedBounds = (origin?: DOMRect): FloatingSnapTarget[] =>
    api.groups
      .filter((group) => group.api.location.type === "grid")
      .map((group) => {
        const bounds = group.element.getBoundingClientRect();
        return {
          height: bounds.height,
          left: bounds.left - (origin?.left ?? 0),
          top: bounds.top - (origin?.top ?? 0),
          width: bounds.width,
          element: group.element,
        };
      });

  const snapshotFloatingBounds = (frame: HTMLElement, origin?: DOMRect): FloatingSnapTarget[] =>
    [...(frame.parentElement?.querySelectorAll<HTMLElement>(":scope > .dv-resize-container") ?? [])]
      .filter((candidate) => candidate !== frame)
      .map((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        return {
          height: bounds.height,
          left: bounds.left - (origin?.left ?? 0),
          top: bounds.top - (origin?.top ?? 0),
          width: bounds.width,
          element: candidate,
        };
      });

  const primeFloatingDragPosition = (event: PointerEvent): void => {
    if (event.button !== 0 || event.shiftKey) return;
    const frame = (event.currentTarget as HTMLElement).parentElement;
    const container = frame?.offsetParent;
    if (!frame || !container) return;
    const frameBounds = frame.getBoundingClientRect();
    const containerBounds = container.getBoundingClientRect();
    dragSnapTargets = [
      ...snapshotFloatingBounds(frame, containerBounds),
      ...snapshotDockedBounds(containerBounds),
    ];
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      frame.style.left = `${frameBounds.left - containerBounds.left + moveEvent.clientX - event.clientX}px`;
      frame.style.top = `${frameBounds.top - containerBounds.top + moveEvent.clientY - event.clientY}px`;
      frame.style.right = "auto";
      frame.style.bottom = "auto";
      window.removeEventListener("pointermove", move, true);
    };
    const cleanup = () => {
      dragSnapTargets = [];
      setSnapTarget();
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", cleanup, true);
      window.removeEventListener("pointercancel", cleanup, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", cleanup, true);
    window.addEventListener("pointercancel", cleanup, true);
  };

  const primeFloatingResizePosition = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const frame = (event.currentTarget as HTMLElement).parentElement;
    if (!frame) return;
    const frameBounds = frame.getBoundingClientRect();
    const offsetX = frameBounds.right - event.clientX;
    const offsetY = frameBounds.bottom - event.clientY;
    const siblingBounds = snapshotFloatingBounds(frame).concat(snapshotDockedBounds());
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId || !moveEvent.isTrusted) return;
      moveEvent.stopImmediatePropagation();
      const snapped = attractFloatingResize(
        frameBounds.left,
        frameBounds.top,
        moveEvent.clientX + offsetX,
        moveEvent.clientY + offsetY,
        siblingBounds,
      );
      setSnapTarget(snapped.target?.element);
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          buttons: moveEvent.buttons,
          clientX: snapped.right,
          clientY: snapped.bottom,
          pointerId: moveEvent.pointerId,
          pointerType: moveEvent.pointerType,
        }),
      );
    };
    const cleanup = () => {
      setSnapTarget();
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", cleanup, true);
      window.removeEventListener("pointercancel", cleanup, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", cleanup, true);
    window.addEventListener("pointercancel", cleanup, true);
  };

  const syncFloatingOverlayLayers = () => {
    const tierStride = api.panels.length * 2 + 2;
    for (const frame of host.querySelectorAll<HTMLElement>(
      ".dv-floating-overlay-host > .dv-resize-container",
    )) {
      const groups = api.groups.filter((group) => frame.contains(group.element));
      const activeGroup =
        groups.find((group) => group.activePanel?.id === api.activePanel?.id) ??
        groups.find((group) => group.element.classList.contains("dv-active-group")) ??
        groups[0];
      const activePanelId = activeGroup?.activePanel?.id;
      const level = Number(frame?.getAttribute("aria-level"));
      if (!activePanelId || !Number.isFinite(level)) continue;

      const activeRecord = records.get(activePanelId);
      const layer = activeRecord
        ? registry[activeRecord.kind]?.panelPreference?.(activePanelId)?.layer
        : undefined;
      const tier = layer === "always-on-top" ? 2 : layer === "above" ? 1 : 0;
      const zIndex = `calc(var(--dv-overlay-z-index, 999) + ${tier * tierStride + level * 2})`;

      // Dockview v7 only layers preserved content from a floating window's
      // anchor group. Keep its active-front level within a semantic tier.
      frame.style.zIndex = zIndex;
      for (const panel of api.panels.filter((candidate) =>
        frame.contains(candidate.group.element),
      )) {
        const overlay = renderers.get(panel.id)?.element.closest<HTMLElement>(".dv-render-overlay");
        if (overlay) overlay.style.zIndex = `calc(${zIndex} + 1)`;
      }
    }
  };

  const annotateFloatingTitlebars = () => {
    const floatingPanels = api.panels.filter((panel) => panel.api.location.type === "floating");
    const titlebars = host.querySelectorAll<HTMLElement>(".dv-floating-titlebar");
    for (const [index, titlebar] of [...titlebars].entries()) {
      titlebar.dataset.floatingDragHandle = "true";
      if (!titlebar.dataset.dragOriginFixed) {
        titlebar.dataset.dragOriginFixed = "true";
        titlebar.addEventListener("pointerdown", primeFloatingDragPosition, true);
      }
      const panel = floatingPanels[index];
      if (panel) {
        titlebar.dataset.panelId = panel.group.activePanel?.id ?? panel.id;
        const resizeGrip = titlebar.parentElement?.querySelector<HTMLElement>(
          ".dv-resize-handle-bottomright",
        );
        if (resizeGrip) {
          resizeGrip.title = `Resize ${panel.title ?? panel.id}`;
          if (!resizeGrip.dataset.resizeOriginFixed) {
            resizeGrip.dataset.resizeOriginFixed = "true";
            resizeGrip.addEventListener("pointerdown", primeFloatingResizePosition, true);
          }
        }
      } else {
        delete titlebar.dataset.panelId;
      }
    }
    syncFloatingOverlayLayers();
  };
  const removeEmptyFloatingGroups = () => {
    // Close controls belong to tabs. A restored empty floating group has none,
    // so it must be removed through Dockview rather than left as an unclosable shell.
    for (const group of api.groups) {
      if (group.api.location.type === "floating" && group.panels.length === 0) {
        api.removeGroup(group);
      }
    }
  };
  const markTerminalGroup = () => {
    for (const group of api.groups) {
      group.element.toggleAttribute("data-terminal-active", group.activePanel?.id === "terminal");
    }
    syncFloatingOverlayLayers();
  };
  const emitLayout = () => {
    if (disposed || suppressLayoutEvents) {
      return;
    }
    removeEmptyFloatingGroups();
    annotateFloatingTitlebars();
    markTerminalGroup();

    const snapshot: WorkspaceSnapshot = { layout: api.toJSON(), version: 1 };
    for (const listener of layoutSubscribers) {
      listener(snapshot);
    }
  };
  const releaseLayoutListener = diagnostics.trackResource("listener");
  const layoutListener = api.onDidLayoutChange(emitLayout);
  const releaseActivePanelListener = diagnostics.trackResource("listener");
  const activePanelListener = api.onDidActivePanelChange(markTerminalGroup);
  const releaseLayerObserver = diagnostics.trackResource("observer");
  const layerObserver = new MutationObserver(syncFloatingOverlayLayers);
  layerObserver.observe(host, { attributeFilter: ["aria-level"], attributes: true, subtree: true });
  const publishPanelDrag = (panelId: string, nativeEvent: PointerEvent) => {
    const cancel = () => {
      const event = new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: nativeEvent.pointerId,
        pointerType: nativeEvent.pointerType,
      });
      window.dispatchEvent(event);
    };
    for (const listener of panelDragSubscribers) listener({ cancel, panelId });
  };
  const panelDragListener = api.onWillDragPanel(({ nativeEvent, panel }) => {
    if (nativeEvent instanceof PointerEvent) {
      publishPanelDrag(panel.id, nativeEvent);
    }
  });
  const releasePanelDragListener = diagnostics.trackResource("listener");
  const groupDragListener = api.onWillDragGroup(({ nativeEvent, group }) => {
    const floatingWindow = group.element.closest(".dv-resize-container");
    const panelCount = floatingWindow
      ? api.groups
          .filter((candidate) => floatingWindow.contains(candidate.element))
          .reduce((count, candidate) => count + candidate.panels.length, 0)
      : group.panels.length;
    if (nativeEvent instanceof PointerEvent && panelCount === 1) {
      const panel = group.panels[0];
      if (panel) publishPanelDrag(panel.id, nativeEvent);
    }
  });
  const releaseGroupDragListener = diagnostics.trackResource("listener");
  const layoutHost = () => {
    diagnostics.recordLayout();
    api.layout(host.clientWidth, host.clientHeight, true);
    if (clampFloatingFrames()) queueMicrotask(emitLayout);
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

  const pinFloatingTopLeft = (panel: DockviewPanelLike): void => {
    const frame = panel.group.element.closest<HTMLElement>(".dv-resize-container");
    if (!frame) return;
    const frameBounds = frame.getBoundingClientRect();
    const containerBounds =
      frame.offsetParent?.getBoundingClientRect() ?? host.getBoundingClientRect();
    frame.style.top = `${frameBounds.top - containerBounds.top}px`;
    frame.style.left = `${frameBounds.left - containerBounds.left}px`;
    frame.style.right = "auto";
    frame.style.bottom = "auto";
  };

  /** Collapse hides the pane body but keeps the header and the mounted content. */
  const toggleCollapse = (id: string): boolean => {
    const panel = api.getPanel(id) as DockviewPanelLike | undefined;
    if (!panel) return false;
    const stored = paneConstraints.get(id) ?? {};
    const floating = panel.api.location.type === "floating";
    if (floating) pinFloatingTopLeft(panel);
    if (collapsedPanes.has(id)) {
      collapsedPanes.delete(id);
      panel.group.element.removeAttribute("data-collapsed");
      panel.group.api.setConstraints({
        ...stored,
        minimumHeight: stored.minimumHeight ?? 0,
        maximumHeight: 100_000,
      });
      const expandedHeight = expandedFloatingHeights.get(id);
      if (floating && expandedHeight !== undefined) panel.api.setSize({ height: expandedHeight });
      expandedFloatingHeights.delete(id);
    } else {
      if (floating) {
        expandedFloatingHeights.set(id, panel.group.element.getBoundingClientRect().height);
      }
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
      } else {
        // Nothing left in the grid to dock beside. Without this the dock control
        // silently does nothing and a lone floated pane can never be put back --
        // reachable now that the rails are their own roots, so the grid can hold
        // the floating pane and nothing else.
        panel.api.moveTo({ group: api.addGroup(), position: "center" });
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
      // Bound the origin by the remaining space, not by the host alone. Clamping
      // origin and size independently lets `left + width` exceed the host, which
      // makes the host scrollable; a focus then scrolls it and every panel's
      // client rect shifts by that amount, silently breaking pointer hit-testing.
      x: Math.max(0, Math.min(bounds.left, hostWidth - width)),
      y: Math.max(0, Math.min(bounds.top, hostHeight - height)),
    };
  };

  function clampFloatingFrames(): boolean {
    const container = host.querySelector<HTMLElement>(".dv-floating-overlay-host");
    if (!container) return false;
    const containerBounds = container.getBoundingClientRect();
    let changed = false;
    for (const frame of container.querySelectorAll<HTMLElement>(":scope > .dv-resize-container")) {
      const bounds = frame.getBoundingClientRect();
      const width = Math.min(bounds.width, containerBounds.width);
      const height = Math.min(bounds.height, containerBounds.height);
      const left = Math.max(
        0,
        Math.min(bounds.left - containerBounds.left, containerBounds.width - width),
      );
      const top = Math.max(
        0,
        Math.min(bounds.top - containerBounds.top, containerBounds.height - height),
      );
      if (
        Math.abs(bounds.width - width) < 0.5 &&
        Math.abs(bounds.height - height) < 0.5 &&
        Math.abs(bounds.left - containerBounds.left - left) < 0.5 &&
        Math.abs(bounds.top - containerBounds.top - top) < 0.5
      ) {
        continue;
      }
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.style.left = `${left}px`;
      frame.style.top = `${top}px`;
      frame.style.right = "auto";
      frame.style.bottom = "auto";
      changed = true;
    }
    return changed;
  }

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

  const reapplySerializedFloatingBounds = (layout: ReturnType<typeof api.toJSON>): void => {
    requestAnimationFrame(() => {
      if (disposed) return;
      for (const floating of layout.floatingGroups ?? []) {
        const groupId = floating.data?.id ?? firstSerializedGroupId(floating.grid?.root);
        const group = api.groups.find((candidate) => candidate.id === groupId);
        const frame = group?.element.closest<HTMLElement>(".dv-resize-container");
        if (!frame) continue;
        const position = floating.position;
        frame.style.width = `${position.width}px`;
        frame.style.height = `${position.height}px`;
        if ("left" in position) {
          frame.style.left = `${position.left}px`;
          frame.style.right = "auto";
        } else {
          frame.style.right = `${position.right}px`;
          frame.style.left = "auto";
        }
        if ("top" in position) {
          frame.style.top = `${position.top}px`;
          frame.style.bottom = "auto";
        } else {
          frame.style.bottom = `${position.bottom}px`;
          frame.style.top = "auto";
        }
      }
      annotateFloatingTitlebars();
    });
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
    expandedFloatingHeights.delete(id);
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

    getPanelState(id) {
      const state = records.get(id)?.state;
      return state ? get(state) : undefined;
    },

    removePanel,

    requestClosePanel,

    setPanelCollapsed(id, collapsed) {
      const current = collapsedPanes.has(id);
      return current === collapsed ? current : toggleCollapse(id);
    },

    refreshPanelPresentation() {
      for (const renderer of renderers.values()) renderer.refreshPresentation();
      syncFloatingOverlayLayers();
    },

    setFloatingPanelBounds(boundsById) {
      const layout = api.toJSON();
      let changed = false;
      for (const [id, requested] of Object.entries(boundsById)) {
        const panel = api.getPanel(id);
        const floating = layout.floatingGroups?.find((group) => group.data?.id === panel?.group.id);
        if (!floating) continue;
        const bounds = clampFloatingBounds(requested);
        floating.position = {
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
        changed = true;
      }
      if (!changed) return false;
      const requestedLayout = structuredClone(layout);
      suppressLayoutEventsForFrame();
      preserveOwnedFocus(() => {
        api.fromJSON(layout, { reuseExistingPanels: true });
        layoutHost();
      });
      reapplySerializedFloatingBounds(requestedLayout);
      queueMicrotask(annotateFloatingTitlebars);
      return true;
    },

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
        const layout = structuredClone(snapshot.layout as unknown as ReturnType<typeof api.toJSON>);
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
          api.fromJSON(layout, { reuseExistingPanels: true });
          removeEmptyFloatingGroups();
          layoutHost();
        });
        reapplySerializedFloatingBounds(
          snapshot.layout as unknown as ReturnType<typeof api.toJSON>,
        );
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

    subscribePanelDrag(listener) {
      assertUsable();
      panelDragSubscribers.add(listener);
      return () => panelDragSubscribers.delete(listener);
    },

    dispose() {
      if (disposePromise) {
        return disposePromise;
      }

      disposed = true;
      layoutSubscribers.clear();
      panelDragSubscribers.clear();
      api.dispose();
      layoutListener.dispose();
      activePanelListener.dispose();
      panelDragListener.dispose();
      releasePanelDragListener();
      groupDragListener.dispose();
      releaseGroupDragListener();
      releaseLayoutListener();
      releaseActivePanelListener();
      resizeObserver.disconnect();
      releaseResizeObserver();
      layerObserver.disconnect();
      releaseLayerObserver();
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

function firstSerializedGroupId(node: unknown): string | undefined {
  if (!isObject(node)) return undefined;
  if (node.type === "leaf" && isObject(node.data) && typeof node.data.id === "string") {
    return node.data.id;
  }
  if (node.type === "branch" && Array.isArray(node.data)) {
    for (const child of node.data) {
      const id = firstSerializedGroupId(child);
      if (id) return id;
    }
  }
  return undefined;
}
