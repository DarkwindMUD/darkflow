<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { InteractionWindow } from "../gmcp/contracts/interactions.ts";
  import type { CharacterProfileId } from "../model/ids";
  import type { InformationPanelId } from "../runtime/information.ts";
  import type { Session } from "../runtime/session.ts";
  import type { WorldPanelId } from "../runtime/world.ts";
  import { createWorkspace } from "./dockview-workspace";
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
    Workspace,
    WorkspacePanelSpec,
    WorkspaceRendererRegistry,
    WorkspaceSnapshot,
  } from "./workspace";

  const SHARED_VIDEO_GEOMETRY_KEY = "darkwind-shared-video-window-geometry";

  let {
    characterProfileId,
    presentationAllowed,
    session,
  }: {
    characterProfileId: CharacterProfileId;
    presentationAllowed: boolean;
    session: Session;
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

  // Legacy "classic hybrid" default: terminal center, two ordered 260px rails.
  // Cyberware and Connection health stay launcher-only (available, not default).
  const RAIL_WIDTH = 260;
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

  function railPanelSpec(
    id: InformationPanelId,
    side: "left" | "right",
    previousId: string | null,
  ): WorkspacePanelSpec {
    const title = informationPanelLabels.find(([panelId]) => panelId === id)?.[1] ?? id;
    return {
      id,
      kind: id,
      title,
      state: {},
      size: { width: RAIL_WIDTH },
      placement: previousId
        ? { kind: "grid", direction: "below", referencePanelId: previousId }
        : { kind: "grid", direction: side, referencePanelId: terminal.id },
    };
  }

  /** Build one rail: stack panels top-to-bottom; each carries the 260px width. */
  function buildRail(
    ws: Workspace,
    order: readonly InformationPanelId[],
    side: "left" | "right",
  ): void {
    let previous: string | null = null;
    for (const id of order) {
      ws.addOrUpdatePanel(railPanelSpec(id, side, previous));
      previous = id;
    }
  }

  /** Fresh classic-hybrid layout: terminal center plus the two frozen rails. */
  function applyDefaultLayout(ws: Workspace): void {
    ws.addOrUpdatePanel(terminal);
    buildRail(ws, leftRailOrder, "left");
    buildRail(ws, rightRailOrder, "right");
    ws.activatePanel(terminal.id);
  }

  let host: HTMLElement;
  let workspace: Workspace | undefined;
  let terminalLineNavigator: ((lineId: number) => boolean) | undefined;
  let status = $state("Loading workspace...");
  let openInformationPanelIds = $state<string[]>([]);
  let openWorldPanelIds = $state<string[]>([]);
  let sheetOpen = $state(false);
  let sheetCloseButton: HTMLButtonElement | undefined;
  let sheetTrigger: HTMLButtonElement | undefined;
  let combatPanelOpen = $state(false);

  function syncVisiblePanels(): void {
    const visible = informationPanels.filter((panel) => workspace?.hasPanel(panel.id));
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

  async function toggleInformationPanel(panel: WorkspacePanelSpec): Promise<void> {
    if (!workspace) return;
    if (workspace.hasPanel(panel.id)) {
      await workspace.removePanel(panel.id);
    } else {
      workspace.addOrUpdatePanel(panel);
      workspace.activatePanel(panel.id);
    }
    syncVisiblePanels();
  }

  function worldPanelOpen(panel: WorkspacePanelSpec): boolean {
    return openWorldPanelIds.includes(panel.id);
  }

  async function toggleWorldPanel(panel: WorkspacePanelSpec): Promise<void> {
    if (!workspace) return;
    if (workspace.hasPanel(panel.id)) {
      await workspace.removePanel(panel.id);
    } else {
      workspace.addOrUpdatePanel(panel);
      workspace.activatePanel(panel.id);
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
            collapsible: true,
            component: panel.id === "connection-health" ? ConnectionHealthPanel : InformationPanel,
            floatable: true,
            session,
          },
        ]),
      ),
    };
    const currentWorkspace = createWorkspace(host, {
      ...rendererRegistry,
    });
    workspace = currentWorkspace;

    const loaded = loadCharacterWorkspace(localStorage, characterProfileId);
    const snapshot = loaded.success ? loaded.snapshot : null;
    const loadMessage = !loaded.success
      ? loaded.message
      : loaded.snapshot === null
        ? loaded.message
        : "";
    const restored =
      snapshot !== null &&
      currentWorkspace.restore(snapshot, [terminal, ...informationPanels, ...worldPanels]);
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
    syncVisiblePanels();

    let pending: WorkspaceSnapshot | undefined;
    let timer: number | undefined;
    // Responsive presentation: below 940px the fixed 260px rails cannot coexist
    // with a >=420px terminal, so leaving the desktop zone captures the desktop
    // layout, suppresses writes, and presents a terminal-centric view. Returning
    // restores the captured layout. Reload in a narrow zone loads the last
    // persisted desktop layout. Rigorous stored-byte isolation lands in PR4.
    let responsiveZone: "desktop" | "compact" | "mobile" = "desktop";
    let capturedDesktop: WorkspaceSnapshot | undefined;
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
    const scheduleSave = (next: WorkspaceSnapshot) => {
      pending = next;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 75);
    };
    const cancelPendingSave = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      pending = undefined;
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
      await currentWorkspace.removePanel(terminal.id);
      await Promise.all(informationPanels.map((panel) => currentWorkspace.removePanel(panel.id)));
      await Promise.all(worldPanels.map((panel) => currentWorkspace.removePanel(panel.id)));
      applyDefaultLayout(currentWorkspace);
      syncVisiblePanels();
      const result = saveCharacterWorkspace(
        localStorage,
        characterProfileId,
        currentWorkspace.save(),
      );
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
      if (suppressPersistence || hasTransientPanels()) cancelPendingSave();
      else scheduleSave(next);
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
      if (panel.id === "map" && !suppressPersistence) scheduleSave(currentWorkspace.save());
    };
    const zoneForWidth = (width: number): typeof responsiveZone =>
      width <= 700 ? "mobile" : width < 940 ? "compact" : "desktop";
    const presentTerminalCentric = (): void => {
      // Drop the fixed-width rail panels so the terminal reclaims the width.
      for (const id of [...leftRailOrder, ...rightRailOrder]) {
        if (currentWorkspace.hasPanel(id)) void currentWorkspace.removePanel(id);
      }
    };
    const applyResponsiveZone = (): void => {
      const next = zoneForWidth(window.innerWidth);
      if (next === responsiveZone) return;
      const leavingDesktop = responsiveZone === "desktop" && next !== "desktop";
      const enteringDesktop = responsiveZone !== "desktop" && next === "desktop";
      responsiveZone = next;
      if (leavingDesktop) {
        capturedDesktop = currentWorkspace.save();
        suppressPersistence = true;
        cancelPendingSave();
        presentTerminalCentric();
        syncVisiblePanels();
      } else if (enteringDesktop) {
        if (capturedDesktop) {
          currentWorkspace.restore(capturedDesktop, [
            terminal,
            ...informationPanels,
            ...worldPanels,
          ]);
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
      workspace = undefined;
      void currentWorkspace.dispose();
    };
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (sheetOpen && event.key === "Escape") closeSheet();
  }}
/>

<section class="workspace-shell" aria-label="Workspace" data-testid="phase2-workspace">
  <div class="workspace-controls" aria-label="Panels" data-tutorial-target="panels-menu">
    <button type="button" onclick={focusTerminal}>Focus terminal</button>
    <div class="panel-launcher" aria-label="Open panels">
      {#each informationPanels as panel (panel.id)}
        <button
          type="button"
          aria-pressed={informationPanelOpen(panel)}
          onclick={() => toggleInformationPanel(panel)}
        >
          {informationPanelOpen(panel) ? `Close ${panel.title}` : `Open ${panel.title}`}
        </button>
      {/each}
      {#each worldPanels as panel (panel.id)}
        <button
          type="button"
          aria-pressed={worldPanelOpen(panel)}
          onclick={() => toggleWorldPanel(panel)}
        >
          {worldPanelOpen(panel) ? `Close ${panel.title}` : `Open ${panel.title}`}
        </button>
      {/each}
      {#if combatPanelOpen}
        <button type="button" onclick={() => workspace?.activatePanel(combatPanel.id)}>Enemy</button
        >
      {/if}
    </div>
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
  <p class="workspace-status" data-testid="workspace-status">{status}</p>
  <div
    bind:this={host}
    id="phase2-workspace-host"
    class="workspace-host df-workspace"
    data-testid="workspace-host"
  ></div>
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
    <div class="mobile-sheet-controls">
      <button type="button" onclick={focusTerminal}>Focus terminal</button>
    </div>
  </div>
</div>

<style>
  .workspace-shell {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
    margin-top: 0.75rem;
  }

  .workspace-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  /* Compact single-row launcher: it scrolls horizontally instead of wrapping
     into a tall button rack, so it stays a thin strip in the full-height shell. */
  .panel-launcher {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.375rem;
    align-items: center;
    min-width: 0;
    padding-bottom: 0.25rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }

  .panel-launcher button {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .workspace-status {
    color: var(--df-muted, #8b949e);
  }

  .workspace-host {
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
    .mobile-panel-tabs,
    .mobile-sheet-controls {
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
