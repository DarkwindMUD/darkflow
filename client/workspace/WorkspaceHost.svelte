<script lang="ts">
  import { onMount, tick } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { InteractionWindow } from "../gmcp/contracts/interactions.ts";
  import type { CharacterProfileId } from "../model/ids";
  import type { InformationPanelId } from "../runtime/information.ts";
  import type { Session } from "../runtime/session.ts";
  import type { WorldPanelId } from "../runtime/world.ts";
  import { createWorkspace, type WorkspaceInspector } from "./dockview-workspace";
  import { LifecycleDiagnostics } from "./lifecycle-diagnostics";
  import { RAIL_DRAG_TYPE, Scrollview } from "./scrollview";
  import "./dockview-theme.css";
  import InformationPanel from "./InformationPanel.svelte";
  import ConnectionHealthPanel from "./ConnectionHealthPanel.svelte";
  import CombatPanel from "./CombatPanel.svelte";
  import FishingPanel from "./FishingPanel.svelte";
  import IdePanel from "./IdePanel.svelte";
  import MapPanel from "./MapPanel.svelte";
  import RoomImagePanel from "./RoomImagePanel.svelte";
  import RoomPlaylistPanel from "./RoomPlaylistPanel.svelte";
  import { loadCharacterWorkspace, saveCharacterWorkspace } from "./persistence";
  import TerminalPanel from "./TerminalPanel.svelte";
  import ServerWindowPanel from "./ServerWindowPanel.svelte";
  import { focusTerminalIsland } from "./terminal-island";
  import type {
    CompositeWorkspaceSnapshot,
    PersistedWorkspaceSnapshot,
    Workspace,
    WorkspacePanelSpec,
    WorkspaceRendererRegistry,
  } from "./workspace";

  const SHARED_VIDEO_GEOMETRY_KEY = "darkwind-shared-video-window-geometry";

  let {
    characterProfileId,
    presentationAllowed,
    session,
    workspaceToolbar,
  }: {
    characterProfileId: CharacterProfileId;
    presentationAllowed: boolean;
    session: Session;
    workspaceToolbar?: HTMLElement | undefined;
  } = $props();

  const terminal: WorkspacePanelSpec = {
    id: "terminal",
    kind: "terminal",
    title: "Terminal",
    state: {},
    // The >=940px rail-collapse breakpoint (260+260+420) already floors the
    // terminal at 420px wide on desktop; a hard width constraint would only
    // overflow narrower zones, so enforce the height minimum here.
    minSize: { height: 260 },
  };
  const informationPanelLabels: readonly [InformationPanelId, string][] = [
    ["avatar", "Avatar"],
    ["status", "Status"],
    ["vitals", "Vitals"],
    ["guildVitals", "Guild vitals"],
    ["xpmon", "XP monitor"],
    ["omens", "Omens"],
    ["sky", "Sky"],
    ["stats", "Stats"],
    ["buffs", "Buffs"],
    ["worth", "Worth"],
    ["group", "Group"],
    ["inventory", "Inventory"],
    ["quests", "Quests"],
    ["achievements", "Achievements"],
    ["cyberware", "Cyberware"],
    ["connection-health", "Connection health"],
  ];
  const informationPanels: readonly (WorkspacePanelSpec & { id: InformationPanelId })[] =
    informationPanelLabels.map(([id, title]) => ({
      id,
      kind: id,
      title,
      state: {},
      minSize: { width: 200, height: 80 },
      placement: { kind: "grid", direction: "right", referencePanelId: terminal.id },
    }));
  const worldPanels: readonly (WorkspacePanelSpec & { id: WorldPanelId })[] = [
    {
      id: "map",
      kind: "map",
      title: "Map",
      state: { mapZoom: 1 },
      placement: { kind: "grid", direction: "right", referencePanelId: terminal.id },
    },
    {
      id: "roomImage",
      kind: "roomImage",
      title: "Room Image",
      state: {},
      placement: { kind: "grid", direction: "right", referencePanelId: terminal.id },
    },
    {
      id: "roomPlaylist",
      kind: "roomPlaylist",
      title: "Jukebox",
      state: {},
      placement: { kind: "grid", direction: "right", referencePanelId: terminal.id },
    },
  ];
  const areaMap: WorkspacePanelSpec & { id: WorldPanelId } = {
    id: "areaMap",
    kind: "areaMap",
    title: "Area Map",
    state: { mapZoom: 1 },
    placement: { kind: "floating", bounds: { left: 40, top: 40, width: 520, height: 420 } },
  };
  const combatPanel: WorkspacePanelSpec = {
    id: "enemy",
    kind: "enemy",
    title: "Enemy",
    state: {},
    placement: { kind: "grid", direction: "right", referencePanelId: terminal.id },
  };

  // Legacy "classic hybrid" default: terminal center, two ordered rails. Each
  // rail is its own Scrollview root, so cards size to their content under one
  // scrollbar instead of competing for a fixed grid extent.
  // Cyberware and Connection health stay launcher-only (available, not default).
  const leftRailOrder: readonly InformationPanelId[] = [
    "avatar",
    "status",
    "vitals",
    "guildVitals",
    "sky",
    "omens",
    "buffs",
    "worth",
    "xpmon",
    "stats",
  ];
  const rightRailOrder: readonly InformationPanelId[] = [
    "group",
    "inventory",
    "quests",
    "achievements",
  ];

  function railPanelSpec(id: InformationPanelId): WorkspacePanelSpec {
    const title = informationPanelLabels.find(([panelId]) => panelId === id)?.[1] ?? id;
    return { id, kind: id, title, state: {} };
  }

  /**
   * Compact and mobile zones have no rails, so rail panels route to the Dockview
   * grid instead. Without this a panel opened from the mobile sheet lands in a
   * hidden rail: present in the DOM, but invisible and unclickable.
   */
  let railsEnabled = true;

  /** Which rail a panel belongs to by configuration, open or not. */
  function railHomeFor(id: string): Scrollview | undefined {
    if (!railsEnabled) return undefined;
    if (leftRailOrder.includes(id as InformationPanelId)) return leftRail;
    if (rightRailOrder.includes(id as InformationPanelId)) return rightRail;
    return undefined;
  }

  /** Which rail currently holds a panel. A floated-out card has no rail. */
  function railFor(id: string): Scrollview | undefined {
    if (!railsEnabled) return undefined;
    if (leftRail?.hasPanel(id)) return leftRail;
    if (rightRail?.hasPanel(id)) return rightRail;
    return undefined;
  }

  /**
   * Resolve a panel to whichever root owns it, so the launcher and the
   * visibility sync do not have to branch on rail membership. A panel that is
   * open somewhere resolves to that root; one that is closed resolves to the
   * root it would open into.
   */
  function ownerOf(
    id: string,
  ): Pick<Workspace, "addOrUpdatePanel" | "hasPanel" | "removePanel"> | undefined {
    return railFor(id) ?? (workspace?.hasPanel(id) ? workspace : (railHomeFor(id) ?? workspace));
  }

  /** Where a floated-out card came from, so docking can put it back exactly. */
  const railOrigins = new SvelteMap<string, { rail: Scrollview; index: number }>();
  const RAIL_FLOAT_BOUNDS = { left: 40, top: 40, width: 320, height: 240 };
  /** Reclaiming moves panels, which fires the layout event that calls it again. */
  let reclaiming = false;

  /**
   * A rail panel may sit in the Dockview tree only while it is floating. The
   * moment it is docked it returns to its rail, because a content-height card
   * docked into the grid stretches to full height -- the very layout the rails
   * exist to escape. This also repairs a version 1 snapshot, which restores
   * every rail panel into the grid.
   */
  function reclaimDockedRailPanels(ws: Workspace & WorkspaceInspector): void {
    if (reclaiming || !railsEnabled) return;
    reclaiming = true;
    for (const id of [...leftRailOrder, ...rightRailOrder]) {
      if (!ws.hasPanel(id) || ws.inspectPanel(id)?.floating) continue;
      const origin = railOrigins.get(id);
      railOrigins.delete(id);
      void ws.removePanel(id);
      const rail = origin?.rail ?? railHomeFor(id);
      rail?.addOrUpdatePanel(railPanelSpec(id as InformationPanelId), origin?.index);
      // Bring the returned card into view; without this a long rail scrolled
      // past the origin index makes the reclaim look like a disappearance.
      rail?.scrollCardIntoView(id);
    }
    reclaiming = false;
  }

  /** Lift a card out of its rail into a floating Dockview pane, remembering its slot. */
  function floatFromRail(ws: Workspace, id: string): void {
    const rail = railFor(id);
    if (!rail) return;
    railOrigins.set(id, { rail, index: rail.indexOf(id) });
    void rail.removePanel(id).then(() => {
      ws.addOrUpdatePanel({
        ...railPanelSpec(id as InformationPanelId),
        placement: { kind: "floating", bounds: RAIL_FLOAT_BOUNDS },
      });
      requestSave?.();
    });
  }

  /** The frozen rail membership, used for a fresh layout and for version 1 payloads. */
  function fillRailsWithDefaults(): void {
    for (const [order, rail] of [
      [leftRailOrder, leftRail],
      [rightRailOrder, rightRail],
    ] as const) {
      if (!rail) continue;
      for (const id of order) {
        if (!rail.hasPanel(id)) rail.addOrUpdatePanel(railPanelSpec(id));
      }
    }
  }

  /** Fresh classic-hybrid layout: terminal center plus the two frozen rails. */
  function applyDefaultLayout(ws: Workspace & WorkspaceInspector): void {
    ws.addOrUpdatePanel(terminal);
    reclaimDockedRailPanels(ws);
    fillRailsWithDefaults();
    ws.activatePanel(terminal.id);
  }

  let host: HTMLElement;
  let workspaceControlsEl: HTMLElement | undefined = $state();
  let workspaceStatusEl: HTMLElement | undefined = $state();
  let leftRailHost: HTMLElement;
  let rightRailHost: HTMLElement;
  let leftRail: Scrollview | undefined;
  let rightRail: Scrollview | undefined;
  let workspace: Workspace | undefined;
  /** Set once the save pipeline exists; rail edits are not Dockview layout events. */
  let requestSave: (() => void) | undefined;
  let terminalLineNavigator: ((lineId: number) => boolean) | undefined;
  let status = $state("Loading workspace...");
  let openInformationPanelIds = $state<string[]>([]);
  let openWorldPanelIds = $state<string[]>([]);
  let sheetOpen = $state(false);
  let sheetCloseButton: HTMLButtonElement | undefined;
  let sheetTrigger: HTMLButtonElement | undefined;
  let combatPanelOpen = $state(false);
  let launcherOpen = $state(false);

  function handleLauncherFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next)) {
      launcherOpen = false;
    }
  }

  function syncVisiblePanels(): void {
    const visible = informationPanels.filter((panel) => ownerOf(panel.id)?.hasPanel(panel.id));
    openInformationPanelIds = visible.map((panel) => panel.id);
    session.information.setVisiblePanels(visible.map((panel) => panel.id));
    const visibleWorldPanels = [...worldPanels, areaMap].filter((panel) =>
      workspace?.hasPanel(panel.id),
    );
    openWorldPanelIds = visibleWorldPanels.map((panel) => panel.id);
    session.world.setVisiblePanels(visibleWorldPanels.map((panel) => panel.id));
  }

  function informationPanelOpen(panel: WorkspacePanelSpec): boolean {
    return openInformationPanelIds.includes(panel.id);
  }

  async function toggleInformationPanel(panel: WorkspacePanelSpec, activate = true): Promise<void> {
    const owner = ownerOf(panel.id);
    if (!owner) return;
    if (owner.hasPanel(panel.id)) {
      await owner.removePanel(panel.id);
    } else {
      owner.addOrUpdatePanel(panel);
      // A rail card is always in view; only the Dockview grid has hidden tabs.
      if (activate && !railFor(panel.id)) workspace?.activatePanel(panel.id);
    }
    if (railHomeFor(panel.id)) requestSave?.();
    syncVisiblePanels();
  }

  function worldPanelOpen(panel: WorkspacePanelSpec): boolean {
    return openWorldPanelIds.includes(panel.id);
  }

  async function toggleWorldPanel(panel: WorkspacePanelSpec, activate = true): Promise<void> {
    if (!workspace) return;
    if (workspace.hasPanel(panel.id)) {
      await workspace.removePanel(panel.id);
    } else {
      workspace.addOrUpdatePanel(panel);
      if (activate) workspace.activatePanel(panel.id);
    }
    syncVisiblePanels();
  }

  function focusTerminal(): void {
    workspace?.activatePanel(terminal.id);
    focusTerminalIsland(terminal.id);
  }

  function registerTerminalLineNavigator(navigate: (lineId: number) => boolean): () => void {
    terminalLineNavigator = navigate;
    return () => {
      if (terminalLineNavigator === navigate) terminalLineNavigator = undefined;
    };
  }

  export function navigateTerminalLine(lineId: number): boolean {
    if (!workspace || !terminalLineNavigator) return false;
    workspace.activatePanel(terminal.id);
    if (!terminalLineNavigator(lineId)) return false;
    focusTerminalIsland(terminal.id);
    return true;
  }

  export function draftTerminalCommand(command: string): boolean {
    const input = host.querySelector<HTMLInputElement>('[data-tutorial-target="command-input"]');
    if (!input) return false;
    input.value = command;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    return true;
  }

  function openSheet(): void {
    sheetOpen = true;
    void tick().then(() => sheetCloseButton?.focus());
  }

  function closeSheet(returnFocus = true): void {
    if (!sheetOpen) return;
    sheetOpen = false;
    if (returnFocus) queueMicrotask(() => sheetTrigger?.focus());
  }

  /** Sheet panel selection reveals the workspace behind it rather than covering it. */
  function selectPanel(activate: () => void): void {
    closeSheet(false);
    activate();
  }

  function handleSheetBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) closeSheet();
  }

  function serverPanelPlacement(
    window: InteractionWindow,
  ): NonNullable<WorkspacePanelSpec["placement"]> {
    if (window.sourceId !== window.id) {
      try {
        const geometry = JSON.parse(
          localStorage.getItem(SHARED_VIDEO_GEOMETRY_KEY) ?? "null",
        ) as Record<string, unknown> | null;
        const x = Number(geometry?.x);
        const y = Number(geometry?.y);
        const width = Number(geometry?.w);
        const height = Number(geometry?.h);
        if ([x, y, width, height].every(Number.isFinite)) {
          return {
            kind: "floating",
            bounds: {
              left: Math.max(0, Math.min(x, Math.max(0, innerWidth - 80))),
              top: Math.max(0, Math.min(y, Math.max(0, innerHeight - 80))),
              width: Math.max(260, Math.min(width, Math.max(260, innerWidth - 24))),
              height: Math.max(180, Math.min(height, Math.max(180, innerHeight - 80))),
            },
          };
        }
      } catch {
        // Ignore missing or corrupt legacy geometry.
      }
    }
    if (window.dock === "float") {
      const width = window.defaultFloatW ?? 420;
      const height = window.defaultFloatH ?? 320;
      const rawLeft = window.defaultFloatX ?? 40;
      const rawTop = window.defaultFloatY ?? 40;
      return {
        kind: "floating",
        bounds: {
          left: rawLeft < 0 ? Math.max(0, innerWidth + rawLeft - width) : rawLeft,
          top: rawTop < 0 ? Math.max(0, innerHeight + rawTop - height) : rawTop,
          width,
          height,
        },
      };
    }
    return {
      kind: "grid",
      direction: window.dock === "left" ? "left" : window.dock === "bottom" ? "below" : "right",
      referencePanelId: terminal.id,
    };
  }

  $effect(() => {
    // Portal Panels button + status paragraph up to the App shell's toolbar
    // slot so they sit on the header row instead of in their own strip. The slot
    // is dedicated to these two nodes; replacing its children also removes stale
    // portal nodes left by a WorkspaceHost refresh.
    if (!workspaceToolbar || !workspaceControlsEl || !workspaceStatusEl) return;
    const toolbar = workspaceToolbar;
    const controls = workspaceControlsEl;
    const statusElement = workspaceStatusEl;
    toolbar.replaceChildren(controls, statusElement);
    return () => {
      if (controls.parentElement === toolbar) controls.remove();
      if (statusElement.parentElement === toolbar) statusElement.remove();
    };
  });

  onMount(() => {
    // Lifecycle-only correlation; never rendered directly.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const serverPanelIds = new Map<string, string>();
    let ideCloseGuard = (): boolean => true;
    const registerIdeCloseGuard = (guard: () => boolean): (() => void) => {
      ideCloseGuard = guard;
      return () => {
        if (ideCloseGuard === guard) ideCloseGuard = () => true;
      };
    };
    const canCloseServerPanel = (panelId: string): boolean => {
      const entry = [...serverPanelIds].find(([, currentPanelId]) => currentPanelId === panelId);
      const window = entry ? session.interactions.getSnapshot().windows[entry[0]] : undefined;
      return !!window && window.closable !== false && window.closable !== 0;
    };
    const rendererRegistry: WorkspaceRendererRegistry = {
      terminal: {
        component: TerminalPanel,
        componentProps: { registerLineNavigator: registerTerminalLineNavigator },
        floatable: true,
        preserveDomWhenHidden: true,
        session,
      },
      "server-window": {
        canClose: canCloseServerPanel,
        component: ServerWindowPanel,
        session,
        showCloseButton: canCloseServerPanel,
      },
      enemy: {
        canClose: () => {
          combatPanelOpen = false;
          session.combat.dismissEncounter();
          return true;
        },
        component: CombatPanel,
        session,
      },
      fishing: { component: FishingPanel, session },
      ide: {
        canClose: () => ideCloseGuard(),
        component: IdePanel,
        componentProps: {
          focusFallback: focusTerminal,
          registerCloseGuard: registerIdeCloseGuard,
        },
        preserveDomWhenHidden: true,
        session,
      },
      map: { collapsible: true, component: MapPanel, floatable: true, session },
      areaMap: { component: MapPanel, session },
      roomImage: { collapsible: true, component: RoomImagePanel, floatable: true, session },
      roomPlaylist: {
        collapsible: true,
        component: RoomPlaylistPanel,
        floatable: true,
        preserveDomWhenHidden: true,
        session,
      },
      ...Object.fromEntries(
        informationPanels.map((panel) => [
          panel.kind,
          {
            canClose: () => true,
            collapsible: true,
            component: panel.id === "connection-health" ? ConnectionHealthPanel : InformationPanel,
            floatable: true,
            session,
          },
        ]),
      ),
    };
    const registry = { ...rendererRegistry };
    const diagnostics = new LifecycleDiagnostics();
    const currentWorkspace = createWorkspace(host, registry, diagnostics);
    workspace = currentWorkspace;
    // Grid-host DnD: accept a rail card dropped anywhere in the Dockview host
    // and promote it to a floating pane. The rail's own drop handler covers
    // rail-to-rail moves; this covers rail-to-grid drags without relying on
    // `dragend`'s dropEffect (Dockview HTML5 targets set dropEffect="move"
    // even when they refuse the drop, so that signal is unreliable).
    const onRailDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes(RAIL_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    };
    const onRailDrop = (event: DragEvent) => {
      const id = event.dataTransfer?.getData(RAIL_DRAG_TYPE);
      if (!id || !railFor(id)) return;
      event.preventDefault();
      floatFromRail(currentWorkspace, id);
    };
    host.addEventListener("dragover", onRailDragOver);
    host.addEventListener("drop", onRailDrop);

    /**
     * Dockview uses PointerEvents for its drag (dndStrategy: "pointer"), so
     * HTML5 dragover/drop never fire on the rails during a floating-panel
     * drag. Watch pointer input at document level: while a Dockview overlay is
     * being dragged and the pointer is inside a rail, show that rail's drop
     * indicator; on pointerup, dock the floated panel back into the rail at
     * the pointer-derived index.
     */
    const railAt = (x: number, y: number): Scrollview | undefined => {
      if (!railsEnabled) return undefined;
      const el = document.elementFromPoint(x, y);
      const railEl = el?.closest("[data-rail]") as HTMLElement | null;
      if (railEl?.dataset.rail === "left") return leftRail;
      if (railEl?.dataset.rail === "right") return rightRail;
      return undefined;
    };
    const draggingFloatingPanelId = (): string | undefined => {
      const el = document.querySelector<HTMLElement>(
        ".dv-resize-container-dragging .dv-floating-titlebar[data-panel-id]",
      );
      return el?.dataset.panelId;
    };
    const onDocPointerMove = (event: PointerEvent) => {
      const id = draggingFloatingPanelId();
      if (!id || !railHomeFor(id)) return;
      const rail = railAt(event.clientX, event.clientY);
      for (const other of [leftRail, rightRail]) {
        if (other && other !== rail) other.clearDropIndicator();
      }
      rail?.markDropIndicatorAt(event.clientY);
    };
    const onDocPointerUp = (event: PointerEvent) => {
      const id = draggingFloatingPanelId();
      leftRail?.clearDropIndicator();
      rightRail?.clearDropIndicator();
      if (!id || !railHomeFor(id)) return;
      const rail = railAt(event.clientX, event.clientY);
      if (!rail) return;
      // Beat Dockview's own pointerup that finalises the floating position.
      const index = rail.dropIndexAt(event.clientY);
      railOrigins.delete(id);
      void currentWorkspace.removePanel(id).then(() => {
        rail.addOrUpdatePanel(railPanelSpec(id as InformationPanelId), index);
        rail.scrollCardIntoView(id);
        requestSave?.();
      });
    };
    document.addEventListener("pointermove", onDocPointerMove);
    document.addEventListener("pointerup", onDocPointerUp);
    // One diagnostics instance across all three roots keeps the exactly-once
    // disposal accounting whole.
    const railCallbacksFor = (self: () => Scrollview | undefined) => ({
      onAcceptForeign: (id: string, index: number) => {
        const receiver = self();
        const source = railFor(id);
        if (!receiver || !source || source === receiver) return;
        railOrigins.delete(id);
        void source.removePanel(id).then(() => {
          receiver.addOrUpdatePanel(railPanelSpec(id as InformationPanelId), index);
          requestSave?.();
        });
      },
      onChange: () => requestSave?.(),
      onFloat: (id: string) => floatFromRail(currentWorkspace, id),
      requestClose: (id: string) => currentWorkspace.requestClosePanel(id),
    });
    leftRail = new Scrollview(
      leftRailHost,
      registry,
      diagnostics,
      railCallbacksFor(() => leftRail),
    );
    rightRail = new Scrollview(
      rightRailHost,
      registry,
      diagnostics,
      railCallbacksFor(() => rightRail),
    );

    /** Dockview tree plus each rail's ordered ids. Rails are not Dockview panels. */
    const composeSnapshot = (): CompositeWorkspaceSnapshot => ({
      version: 2,
      layout: {
        collapsed: {
          left: leftRail?.collapsedIds() ?? [],
          right: rightRail?.collapsedIds() ?? [],
        },
        dockview: currentWorkspace.save().layout,
        scrollviews: { left: leftRail?.ids() ?? [], right: rightRail?.ids() ?? [] },
      },
    });

    /**
     * Apply a persisted snapshot. A version 1 payload predates the rails, so its
     * rail membership is whatever `fillRailsWithDefaults` rebuilds.
     */
    const restoreSnapshot = (next: PersistedWorkspaceSnapshot): boolean => {
      const panels = [terminal, ...informationPanels, ...worldPanels];
      if (next.version === 1) {
        if (!currentWorkspace.restore(next, panels)) return false;
        reclaimDockedRailPanels(currentWorkspace);
        fillRailsWithDefaults();
        return true;
      }
      if (
        !["left", "right"].every(
          (side) =>
            Array.isArray(next.layout.scrollviews[side]) &&
            Array.isArray(next.layout.collapsed[side]),
        )
      ) {
        return false;
      }
      if (!currentWorkspace.restore({ version: 1, layout: next.layout.dockview }, panels)) {
        return false;
      }
      reclaimDockedRailPanels(currentWorkspace);
      for (const [side, rail] of [
        ["left", leftRail],
        ["right", rightRail],
      ] as const) {
        const order = next.layout.scrollviews[side];
        const collapsed = next.layout.collapsed[side];
        if (!rail || !order || !collapsed) continue;
        for (const id of order) {
          if (informationPanels.some((panel) => panel.id === id)) {
            rail.addOrUpdatePanel(railPanelSpec(id as InformationPanelId));
          }
        }
        // Anything absent from the saved order was closed or floated out.
        for (const id of rail.ids()) {
          if (!order.includes(id)) void rail.removePanel(id);
        }
        for (const id of order) rail.setCollapsed(id, collapsed.includes(id));
      }
      return true;
    };

    const loaded = loadCharacterWorkspace(localStorage, characterProfileId);
    const snapshot = loaded.success ? loaded.snapshot : null;
    const loadMessage = !loaded.success
      ? loaded.message
      : loaded.snapshot === null
        ? loaded.message
        : "";
    const restored = snapshot !== null && restoreSnapshot(snapshot);
    if (!restored) {
      applyDefaultLayout(currentWorkspace);
      status =
        snapshot === null
          ? loadMessage
          : "Saved workspace could not be restored; using the default layout.";
    } else if (currentWorkspace.hasPanel(terminal.id)) {
      status = "Workspace restored";
    } else {
      // A restored layout without the terminal island is repaired in place; the
      // rest of the user's saved arrangement stays usable.
      currentWorkspace.addOrUpdatePanel(terminal);
      status = "Restored workspace was missing the terminal; it has been re-added.";
    }
    reclaimDockedRailPanels(currentWorkspace);
    syncVisiblePanels();

    let pending: CompositeWorkspaceSnapshot | undefined;
    let timer: number | undefined;
    // Responsive presentation: below 940px the fixed 260px rails cannot coexist
    // with a >=420px terminal, so leaving the desktop zone captures the desktop
    // layout, suppresses writes, and presents a terminal-centric view. Returning
    // restores the captured layout. Reload in a narrow zone loads the last
    // persisted desktop layout. Rigorous stored-byte isolation lands in PR4.
    let responsiveZone: "desktop" | "compact" | "mobile" = "desktop";
    let capturedDesktop: CompositeWorkspaceSnapshot | undefined;
    let suppressPersistence = false;
    let fishingPanelOpen = false;
    let areaMapPanelOpen = false;
    let interactionSnapshot = session.interactions.getSnapshot();
    let ideSnapshot = session.ide.getSnapshot();
    let worldSnapshot = session.world.getSnapshot();
    let combatSnapshot = session.combat.getSnapshot();
    let seenCombatEncounter = "";
    let seenBrowseOpenVersion = 0;
    let seenPlaylistOpenVersion = 0;
    let dismissedFishingEnd: typeof interactionSnapshot.fishing.end = null;
    let idePanelOpen = false;
    let seenIdeOpenVersion = 0;
    const hasTransientPanels = () =>
      serverPanelIds.size > 0 ||
      fishingPanelOpen ||
      areaMapPanelOpen ||
      idePanelOpen ||
      combatPanelOpen;
    const flush = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      if (!pending) return;
      const result = saveCharacterWorkspace(localStorage, characterProfileId, pending);
      pending = undefined;
      status = result.success ? "Workspace saved" : result.message;
    };
    const scheduleSave = (next: CompositeWorkspaceSnapshot) => {
      pending = next;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 75);
    };
    const cancelPendingSave = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    };
    requestSave = () => {
      if (suppressPersistence || hasTransientPanels()) {
        cancelPendingSave();
        return;
      }
      scheduleSave(composeSnapshot());
    };
    const resetWorkspace = async (): Promise<void> => {
      if (idePanelOpen && !(await currentWorkspace.requestClosePanel("ide"))) return;
      if (ideSnapshot.document) session.ide.close();
      idePanelOpen = false;
      cancelPendingSave();
      const transientPanelIds = [...serverPanelIds.values()];
      const hadFishingPanel = fishingPanelOpen;
      const hadAreaMapPanel = areaMapPanelOpen;
      const hadCombatPanel = combatPanelOpen;
      if (hadCombatPanel) {
        combatPanelOpen = false;
        session.combat.dismissEncounter();
      }
      for (const windowId of serverPanelIds.keys()) session.interactions.closeWindow(windowId);
      if (interactionSnapshot.fishing.open) {
        session.interactions.cancelFishing(interactionSnapshot.fishing.open.session);
      }
      await Promise.all([
        ...transientPanelIds.map((panelId) => currentWorkspace.removePanel(panelId)),
        ...(hadFishingPanel ? [currentWorkspace.removePanel("fishing")] : []),
        ...(hadAreaMapPanel ? [currentWorkspace.removePanel(areaMap.id)] : []),
        ...(hadCombatPanel ? [currentWorkspace.removePanel(combatPanel.id)] : []),
      ]);
      serverPanelIds.clear();
      fishingPanelOpen = false;
      areaMapPanelOpen = false;
      await Promise.all(
        [leftRail, rightRail].flatMap((rail) =>
          (rail?.ids() ?? []).map((panelId) => rail!.removePanel(panelId)),
        ),
      );
      railOrigins.clear();
      await currentWorkspace.removePanel(terminal.id);
      await Promise.all(informationPanels.map((panel) => currentWorkspace.removePanel(panel.id)));
      await Promise.all(worldPanels.map((panel) => currentWorkspace.removePanel(panel.id)));
      applyDefaultLayout(currentWorkspace);
      syncVisiblePanels();
      const resetSnapshot = composeSnapshot();
      if (!railsEnabled) {
        capturedDesktop = resetSnapshot;
        presentTerminalCentric();
        syncVisiblePanels();
      }
      const result = saveCharacterWorkspace(localStorage, characterProfileId, resetSnapshot);
      status = result.success ? "Workspace reset" : result.message;
      focusTerminal();
    };
    const syncInteractionPanels = (next: typeof interactionSnapshot) => {
      interactionSnapshot = next;
      const desiredWindows = Object.values(next.windows).filter(
        (window) => window.type === "panel",
      );
      const desiredIds = new Set(desiredWindows.map(({ id }) => id));

      for (const [windowId, panelId] of [...serverPanelIds]) {
        if (desiredIds.has(windowId)) continue;
        serverPanelIds.delete(windowId);
        void currentWorkspace.removePanel(panelId);
      }
      for (const window of desiredWindows) {
        const panelId = serverPanelIds.get(window.id) ?? `server-window-${window.id}`;
        const exists = currentWorkspace.hasPanel(panelId);
        serverPanelIds.set(window.id, panelId);
        currentWorkspace.addOrUpdatePanel({
          id: panelId,
          kind: "server-window",
          title: window.title || window.sourceId,
          state: { windowId: window.id },
          ...(!exists ? { placement: serverPanelPlacement(window) } : {}),
        });
      }

      if (next.fishing.open || !next.fishing.end) dismissedFishingEnd = null;
      const shouldShowFishing = Boolean(
        next.fishing.open || (next.fishing.end && next.fishing.end !== dismissedFishingEnd),
      );
      if (shouldShowFishing) {
        const exists = currentWorkspace.hasPanel("fishing");
        fishingPanelOpen = true;
        currentWorkspace.addOrUpdatePanel({
          id: "fishing",
          kind: "fishing",
          title: "Fishing",
          state: {},
          ...(!exists
            ? {
                placement: {
                  kind: "floating" as const,
                  bounds: { left: 40, top: 40, width: 420, height: 500 },
                },
              }
            : {}),
        });
      } else if (fishingPanelOpen) {
        fishingPanelOpen = false;
        void currentWorkspace.removePanel("fishing");
      }

      if (hasTransientPanels()) cancelPendingSave();
    };
    const syncWorldPanels = (next: typeof worldSnapshot) => {
      worldSnapshot = next;
      let visibilityChanged = false;
      if (next.browseOpenVersion > seenBrowseOpenVersion) {
        seenBrowseOpenVersion = next.browseOpenVersion;
        const exists = currentWorkspace.hasPanel(areaMap.id);
        visibilityChanged = !exists;
        areaMapPanelOpen = true;
        if (!exists) currentWorkspace.addOrUpdatePanel(areaMap);
        currentWorkspace.activatePanel(areaMap.id);
      } else if (areaMapPanelOpen && !next.browseSource.isActive()) {
        areaMapPanelOpen = false;
        visibilityChanged = true;
        void currentWorkspace.removePanel(areaMap.id);
      }
      if (next.playlistOpenVersion > seenPlaylistOpenVersion) {
        seenPlaylistOpenVersion = next.playlistOpenVersion;
        const playlistPanel = worldPanels.find((panel) => panel.id === "roomPlaylist");
        if (playlistPanel) {
          const exists = currentWorkspace.hasPanel(playlistPanel.id);
          visibilityChanged ||= !exists;
          if (!exists) currentWorkspace.addOrUpdatePanel(playlistPanel);
          currentWorkspace.activatePanel(playlistPanel.id);
        }
      }
      if (hasTransientPanels()) cancelPendingSave();
      if (visibilityChanged) syncVisiblePanels();
    };
    const syncIdePanel = (next: typeof ideSnapshot) => {
      ideSnapshot = next;
      if (next.document) {
        const exists = currentWorkspace.hasPanel("ide");
        idePanelOpen = true;
        currentWorkspace.addOrUpdatePanel({
          id: "ide",
          kind: "ide",
          title: next.document.title || next.document.path || "IDE",
          state: {},
          ...(!exists
            ? {
                placement: {
                  kind: "floating" as const,
                  bounds: {
                    left: Math.max(20, (innerWidth - Math.min(900, innerWidth - 40)) / 2),
                    top: Math.max(12, (innerHeight - Math.min(620, innerHeight - 80)) / 2),
                    width: Math.min(900, innerWidth - 40),
                    height: Math.min(620, innerHeight - 80),
                  },
                },
              }
            : {}),
        });
        if (next.openVersion > seenIdeOpenVersion) {
          seenIdeOpenVersion = next.openVersion;
          currentWorkspace.activatePanel("ide");
        }
      } else if (idePanelOpen) {
        idePanelOpen = false;
        void currentWorkspace.removePanel("ide");
      }
      if (hasTransientPanels()) cancelPendingSave();
    };
    const syncCombatPanel = (next: typeof combatSnapshot) => {
      combatSnapshot = next;
      if (presentationAllowed && next.shouldPresent) {
        const exists = currentWorkspace.hasPanel(combatPanel.id);
        const encounter = `${next.model.epoch}\u0000${next.model.encounterId}`;
        const reveal = encounter !== seenCombatEncounter;
        seenCombatEncounter = encounter;
        if (reveal) {
          const focused = document.activeElement;
          if (exists) currentWorkspace.activatePanel(combatPanel.id);
          else currentWorkspace.addOrUpdatePanel(combatPanel);
          const restoreFocus = () => {
            if (focused instanceof HTMLElement && focused.isConnected) {
              focused.focus({ preventScroll: true });
            }
          };
          restoreFocus();
          queueMicrotask(restoreFocus);
          requestAnimationFrame(restoreFocus);
        }
        combatPanelOpen = true;
      } else if (combatPanelOpen) {
        combatPanelOpen = false;
        void currentWorkspace.removePanel(combatPanel.id);
      }
      if (!next.model.active || !next.model.visualEnabled) seenCombatEncounter = "";
      if (hasTransientPanels()) cancelPendingSave();
    };
    const unsubscribe = currentWorkspace.subscribeLayout((next) => {
      window.dispatchEvent(new Event("darkflow:workspace-layout-changed"));
      for (const [windowId, panelId] of serverPanelIds) {
        if (!currentWorkspace.hasPanel(panelId) && interactionSnapshot.windows[windowId]) {
          session.interactions.closeWindow(windowId);
        }
      }
      if (fishingPanelOpen && !currentWorkspace.hasPanel("fishing")) {
        fishingPanelOpen = false;
        if (!interactionSnapshot.fishing.open) {
          dismissedFishingEnd = interactionSnapshot.fishing.end;
        }
      }
      if (areaMapPanelOpen && !currentWorkspace.hasPanel(areaMap.id)) {
        areaMapPanelOpen = false;
      }
      if (idePanelOpen && !currentWorkspace.hasPanel("ide")) {
        idePanelOpen = false;
        session.ide.close();
      }
      reclaimDockedRailPanels(currentWorkspace);
      if (suppressPersistence || hasTransientPanels()) cancelPendingSave();
      else scheduleSave(composeSnapshot());
      syncVisiblePanels();
    });
    const unsubscribeInteractions = session.interactions.subscribe(syncInteractionPanels);
    const unsubscribeIde = session.ide.subscribe(syncIdePanel);
    const unsubscribeWorld = session.world.subscribe(syncWorldPanels);
    const unsubscribeCombat = session.combat.subscribe(syncCombatPanel);
    const saveMapPanelState = (event: Event) => {
      const detail = (event as CustomEvent<{ mapZoom?: unknown; panelId?: unknown }>).detail;
      const panel = [...worldPanels, areaMap].find(({ id }) => id === detail?.panelId);
      if (!panel) return;
      currentWorkspace.addOrUpdatePanel({
        id: panel.id,
        kind: panel.kind,
        title: panel.title,
        state: { ...panel.state, mapZoom: detail.mapZoom },
      });
      if (panel.id === "map") requestSave?.();
    };
    const zoneForWidth = (width: number): typeof responsiveZone =>
      width <= 700 ? "mobile" : width < 940 ? "compact" : "desktop";
    const presentTerminalCentric = (): void => {
      // Empty the rails so the terminal reclaims the width, then make the roots
      // inert so they cannot intercept touch input. Emptying matters as much as
      // hiding: a card left mounted in a hidden rail would double-mount its
      // panel when the sheet opens the same id into the grid.
      railsEnabled = false;
      for (const rail of [leftRail, rightRail]) {
        for (const id of rail?.ids() ?? []) void rail?.removePanel(id);
        rail?.setInert(true);
      }
    };
    const applyResponsiveZone = (): void => {
      const next = zoneForWidth(window.innerWidth);
      if (next === responsiveZone) return;
      const leavingDesktop = responsiveZone === "desktop" && next !== "desktop";
      const enteringDesktop = responsiveZone !== "desktop" && next === "desktop";
      responsiveZone = next;
      if (leavingDesktop) {
        capturedDesktop = composeSnapshot();
        suppressPersistence = true;
        cancelPendingSave();
        presentTerminalCentric();
        syncVisiblePanels();
      } else if (enteringDesktop) {
        railsEnabled = true;
        leftRail?.setInert(false);
        rightRail?.setInert(false);
        if (capturedDesktop) {
          restoreSnapshot(capturedDesktop);
          capturedDesktop = undefined;
        }
        suppressPersistence = false;
        syncVisiblePanels();
      }
      // compact <-> mobile keeps the same terminal-centric presentation.
    };
    const onResize = () => applyResponsiveZone();
    const flushOnLeave = () => flush();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", flushOnLeave);
    window.addEventListener("pagehide", flushOnLeave);
    window.addEventListener("darkflow:reset-workspace", resetWorkspace);
    host.addEventListener("darkflow:map-panel-state", saveMapPanelState);
    applyResponsiveZone();

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", flushOnLeave);
      window.removeEventListener("pagehide", flushOnLeave);
      window.removeEventListener("darkflow:reset-workspace", resetWorkspace);
      host.removeEventListener("darkflow:map-panel-state", saveMapPanelState);
      unsubscribeWorld();
      unsubscribeCombat();
      unsubscribeIde();
      unsubscribeInteractions();
      unsubscribe();
      session.information.setVisiblePanels([]);
      session.world.setVisiblePanels([]);
      flush();
      host.removeEventListener("dragover", onRailDragOver);
      host.removeEventListener("drop", onRailDrop);
      document.removeEventListener("pointermove", onDocPointerMove);
      document.removeEventListener("pointerup", onDocPointerUp);
      workspace = undefined;
      const rails = [leftRail, rightRail];
      leftRail = undefined;
      rightRail = undefined;
      for (const rail of rails) void rail?.dispose();
      void currentWorkspace.dispose();
    };
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key !== "Escape") return;
    if (sheetOpen) closeSheet();
    if (launcherOpen) launcherOpen = false;
  }}
/>

<section class="workspace-shell" aria-label="Workspace" data-testid="phase2-workspace">
  <div
    bind:this={workspaceControlsEl}
    class="workspace-controls"
    aria-label="Panels"
    data-tutorial-target="panels-menu"
  >
    <div class="df-panels-menu" onfocusout={handleLauncherFocusOut}>
      <button
        type="button"
        class="df-panels-menu-trigger"
        aria-haspopup="true"
        aria-expanded={launcherOpen}
        onclick={() => (launcherOpen = !launcherOpen)}>Panels</button
      >
      {#if launcherOpen}
        <div class="df-panels-menu-list" aria-label="Panels">
          {#each informationPanels as panel (panel.id)}
            <label>
              <input
                type="checkbox"
                checked={informationPanelOpen(panel)}
                onchange={() => void toggleInformationPanel(panel, false)}
              />
              {panel.title}
            </label>
          {/each}
          {#each worldPanels as panel (panel.id)}
            <label>
              <input
                type="checkbox"
                checked={worldPanelOpen(panel)}
                onchange={() => void toggleWorldPanel(panel, false)}
              />
              {panel.title}
            </label>
          {/each}
        </div>
      {/if}
    </div>
    {#if combatPanelOpen}
      <button type="button" onclick={() => workspace?.activatePanel(combatPanel.id)}>Enemy</button>
    {/if}
  </div>
  <button
    bind:this={sheetTrigger}
    class="mobile-panels-trigger"
    data-tutorial-target="panels-menu"
    type="button"
    aria-controls="phase2-workspace-host"
    aria-expanded={sheetOpen}
    aria-haspopup="dialog"
    onclick={openSheet}>Panels</button
  >
  <p bind:this={workspaceStatusEl} class="workspace-status" data-testid="workspace-status">
    {status}
  </p>
  <div class="workspace-rails">
    <div bind:this={leftRailHost} class="workspace-rail" data-rail="left"></div>
    <div
      bind:this={host}
      id="phase2-workspace-host"
      class="workspace-host df-workspace"
      data-testid="workspace-host"
    ></div>
    <div bind:this={rightRailHost} class="workspace-rail" data-rail="right"></div>
  </div>
</section>

<div
  class:open={sheetOpen}
  class="mobile-sheet-overlay"
  role="presentation"
  inert={!sheetOpen}
  onclick={handleSheetBackdrop}
>
  <div class="mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title">
    <div class="mobile-sheet-header">
      <h2 id="mobile-sheet-title">Panels</h2>
      <button bind:this={sheetCloseButton} type="button" onclick={() => closeSheet()}
        >Close panels</button
      >
    </div>
    <div class="mobile-panel-tabs" aria-label="Open panels">
      <button type="button" onclick={() => selectPanel(focusTerminal)}>Terminal</button>
      {#each informationPanels as panel (panel.id)}
        <button
          type="button"
          aria-pressed={informationPanelOpen(panel)}
          onclick={() => selectPanel(() => void toggleInformationPanel(panel))}
        >
          {informationPanelOpen(panel) ? `Close ${panel.title}` : `Open ${panel.title}`}
        </button>
      {/each}
      {#each worldPanels as panel (panel.id)}
        <button
          type="button"
          aria-pressed={worldPanelOpen(panel)}
          onclick={() => selectPanel(() => void toggleWorldPanel(panel))}
        >
          {worldPanelOpen(panel) ? `Close ${panel.title}` : `Open ${panel.title}`}
        </button>
      {/each}
      {#if combatPanelOpen}
        <button
          type="button"
          onclick={() => selectPanel(() => workspace?.activatePanel(combatPanel.id))}>Enemy</button
        >
        <button
          type="button"
          onclick={() => selectPanel(() => void workspace?.requestClosePanel(combatPanel.id))}
          >Close Enemy</button
        >
      {/if}
    </div>
  </div>
</div>

<style>
  .workspace-shell {
    /*
     * `.workspace-controls` and `.workspace-status` used to sit above the rails
     * in a 3-row grid; they are portalled up to the App header now, so a flex
     * column with `.workspace-rails { flex: 1 }` keeps the rails filling
     * remaining height regardless of how many portal-eligible siblings exist
     * (only the mobile-only launcher trigger remains).
     */
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
    margin-top: 0.75rem;
  }
  .workspace-shell .workspace-rails {
    flex: 1;
  }

  .workspace-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  /* Compact launcher: a single "Panels" button that opens a checklist menu,
     instead of a wall of per-panel toggles. */
  .df-panels-menu {
    position: relative;
  }

  .df-panels-menu-list {
    position: absolute;
    /*
     * Higher than `.rfc2549-debug-panel` (z-index 9200 in legacy main.css) so
     * the launcher menu can be interacted with even when RFC 2549 debug is on
     * -- portalling Panels into the header put the dropdown over the same
     * bottom-right region the debug panel occupies.
     */
    z-index: 9500;
    top: calc(100% + 0.25rem);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    align-items: stretch;
    width: max-content;
    max-height: min(60vh, 30rem);
    padding: 0.375rem;
    overflow-y: auto;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.5rem;
    background: var(--df-panel, #161b22);
    box-shadow: 0 12px 30px rgb(0 0 0 / 45%);
  }

  .df-panels-menu-list label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.25rem 0.5rem;
    white-space: nowrap;
    border-radius: 4px;
    cursor: pointer;
  }

  .df-panels-menu-list label:hover {
    background: var(--df-btn-secondary, rgb(255 255 255 / 6%));
  }

  .workspace-status {
    color: var(--df-muted, #8b949e);
  }

  .workspace-rails {
    display: flex;
    gap: 0.75rem;
    min-height: 0;
  }

  .workspace-rail {
    flex: 0 0 260px;
    min-height: 0;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.5rem;
  }

  .workspace-host {
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.5rem;
  }

  .mobile-panels-trigger,
  .mobile-sheet-overlay {
    display: none;
  }

  @media (max-width: 700px) {
    .workspace-controls {
      display: none;
    }

    .mobile-panels-trigger {
      display: inline-flex;
      width: fit-content;
      align-items: center;
    }

    .mobile-sheet-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: end;
      background: rgb(0 0 0 / 55%);
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease;
      visibility: hidden;
    }

    .mobile-sheet-overlay.open {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }

    .mobile-sheet {
      display: grid;
      width: 100%;
      max-height: 78dvh;
      padding-bottom: env(safe-area-inset-bottom);
      overflow-y: auto;
      overscroll-behavior: contain;
      border-top: 1px solid var(--border-color, #30363d);
      background: var(--df-bg, #0d1117);
      box-shadow: 0 -12px 30px rgb(0 0 0 / 45%);
      transform: translateY(100%);
      transition: transform 160ms ease;
    }

    .mobile-sheet-overlay.open .mobile-sheet {
      transform: translateY(0);
    }

    .mobile-sheet-header,
    .mobile-panel-tabs {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 0.75rem 1rem;
    }

    .mobile-sheet-header {
      justify-content: space-between;
      border-bottom: 1px solid var(--border-color, #30363d);
    }

    .mobile-sheet-header h2 {
      margin: 0;
      font-size: 1rem;
    }

    .mobile-panel-tabs {
      overflow-x: auto;
      border-bottom: 1px solid var(--border-color, #30363d);
    }

    .mobile-panel-tabs button {
      flex: 0 0 auto;
    }
  }

  :is(button):focus-visible {
    outline: 2px solid var(--df-accent-blue, #58a6ff);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-sheet-overlay,
    .mobile-sheet {
      transition: none;
    }
  }
</style>
