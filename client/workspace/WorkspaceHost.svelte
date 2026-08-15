<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { InteractionWindow } from "../gmcp/contracts/interactions.ts";
  import type { CharacterProfileId } from "../model/ids";
  import type { InformationPanelId } from "../runtime/information.ts";
  import type { Session } from "../runtime/session.ts";
  import { createWorkspace } from "./dockview-workspace";
  import InformationPanel from "./InformationPanel.svelte";
  import ConnectionHealthPanel from "./ConnectionHealthPanel.svelte";
  import FishingPanel from "./FishingPanel.svelte";
  import PlaceholderPanel from "./PlaceholderPanel.svelte";
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
    session,
  }: { characterProfileId: CharacterProfileId; session: Session } = $props();

  const terminal: WorkspacePanelSpec = {
    id: "terminal",
    kind: "terminal",
    title: "Terminal",
    state: {},
  };
  const placeholder: WorkspacePanelSpec = {
    id: "panel-placeholder",
    kind: "placeholder",
    title: "Panels",
    state: {},
    placement: { kind: "grid", direction: "right", referencePanelId: terminal.id },
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
      placement: { kind: "grid", direction: "right", referencePanelId: terminal.id },
    }));

  let host: HTMLElement;
  let workspace: Workspace | undefined;
  let status = $state("Loading workspace...");
  let placeholderOpen = $state(true);
  let openInformationPanelIds = $state<string[]>([]);
  let sheetOpen = $state(false);
  let sheetCloseButton: HTMLButtonElement | undefined;
  let sheetTrigger: HTMLButtonElement | undefined;

  function openPlaceholder(): void {
    workspace?.addOrUpdatePanel(placeholder);
    workspace?.activatePanel(placeholder.id);
    placeholderOpen = true;
  }

  function syncVisiblePanels(): void {
    const visible = informationPanels.filter((panel) => workspace?.hasPanel(panel.id));
    openInformationPanelIds = visible.map((panel) => panel.id);
    session.information.setVisiblePanels(visible.map((panel) => panel.id));
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

  function focusTerminal(): void {
    workspace?.activatePanel(terminal.id);
    focusTerminalIsland(terminal.id);
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

  function closePlaceholder(): void {
    if (!workspace) return;
    void workspace.removePanel(placeholder.id).then(() => {
      placeholderOpen = false;
    });
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
    const rendererRegistry: WorkspaceRendererRegistry = {
      placeholder: { component: PlaceholderPanel },
      terminal: { component: TerminalPanel, preserveDomWhenHidden: true, session },
      "server-window": { component: ServerWindowPanel, session },
      fishing: { component: FishingPanel, session },
      ...Object.fromEntries(
        informationPanels.map((panel) => [
          panel.kind,
          {
            component: panel.id === "connection-health" ? ConnectionHealthPanel : InformationPanel,
            session,
          },
        ]),
      ),
    };
    const currentWorkspace = createWorkspace(host, {
      ...rendererRegistry,
    });
    workspace = currentWorkspace;
    currentWorkspace.addOrUpdatePanel(terminal);
    currentWorkspace.addOrUpdatePanel(placeholder);

    const loaded = loadCharacterWorkspace(localStorage, characterProfileId);
    const snapshot = loaded.success ? loaded.snapshot : null;
    const loadMessage = !loaded.success
      ? loaded.message
      : loaded.snapshot === null
        ? loaded.message
        : "";
    const restored =
      snapshot !== null &&
      currentWorkspace.restore(snapshot, [terminal, placeholder, ...informationPanels]);
    if (!restored) {
      currentWorkspace.addOrUpdatePanel(terminal);
      currentWorkspace.addOrUpdatePanel(placeholder);
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
    placeholderOpen = currentWorkspace.hasPanel(placeholder.id);
    syncVisiblePanels();

    let pending: WorkspaceSnapshot | undefined;
    let timer: number | undefined;
    // This lifecycle-only lookup is never rendered, so it needs no reactive wrapper.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const serverPanelIds = new Map<string, string>();
    let fishingPanelOpen = false;
    let interactionSnapshot = session.interactions.getSnapshot();
    let dismissedFishingEnd: typeof interactionSnapshot.fishing.end = null;
    const hasTransientPanels = () => serverPanelIds.size > 0 || fishingPanelOpen;
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
      cancelPendingSave();
      const transientPanelIds = [...serverPanelIds.values()];
      const hadFishingPanel = fishingPanelOpen;
      for (const windowId of serverPanelIds.keys()) session.interactions.closeWindow(windowId);
      if (interactionSnapshot.fishing.open) {
        session.interactions.cancelFishing(interactionSnapshot.fishing.open.session);
      }
      await Promise.all([
        ...transientPanelIds.map((panelId) => currentWorkspace.removePanel(panelId)),
        ...(hadFishingPanel ? [currentWorkspace.removePanel("fishing")] : []),
      ]);
      serverPanelIds.clear();
      fishingPanelOpen = false;
      await currentWorkspace.removePanel(placeholder.id);
      await currentWorkspace.removePanel(terminal.id);
      await Promise.all(informationPanels.map((panel) => currentWorkspace.removePanel(panel.id)));
      currentWorkspace.addOrUpdatePanel(terminal);
      currentWorkspace.addOrUpdatePanel(placeholder);
      placeholderOpen = true;
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
    const unsubscribe = currentWorkspace.subscribeLayout((next) => {
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
      if (hasTransientPanels()) cancelPendingSave();
      else scheduleSave(next);
      syncVisiblePanels();
    });
    const unsubscribeInteractions = session.interactions.subscribe(syncInteractionPanels);
    const flushOnLeave = () => flush();
    document.addEventListener("visibilitychange", flushOnLeave);
    window.addEventListener("pagehide", flushOnLeave);
    window.addEventListener("darkflow:reset-workspace", resetWorkspace);

    return () => {
      document.removeEventListener("visibilitychange", flushOnLeave);
      window.removeEventListener("pagehide", flushOnLeave);
      window.removeEventListener("darkflow:reset-workspace", resetWorkspace);
      unsubscribeInteractions();
      unsubscribe();
      session.information.setVisiblePanels([]);
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
  <div class="workspace-controls" aria-label="Panels">
    <strong>Panels</strong>
    <button type="button" onclick={focusTerminal}>Focus terminal</button>
    {#if placeholderOpen}
      <button type="button" onclick={closePlaceholder}>Close panel</button>
    {:else}
      <button type="button" onclick={openPlaceholder}>Open panel</button>
    {/if}
    {#each informationPanels as panel (panel.id)}
      <button
        type="button"
        aria-pressed={informationPanelOpen(panel)}
        onclick={() => toggleInformationPanel(panel)}
      >
        {informationPanelOpen(panel) ? `Close ${panel.title}` : `Open ${panel.title}`}
      </button>
    {/each}
  </div>
  <button
    bind:this={sheetTrigger}
    class="mobile-panels-trigger"
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
    class="workspace-host"
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
      <button type="button" onclick={() => selectPanel(openPlaceholder)}>Panel placeholder</button>
      {#each informationPanels as panel (panel.id)}
        <button
          type="button"
          aria-pressed={informationPanelOpen(panel)}
          onclick={() => selectPanel(() => void toggleInformationPanel(panel))}
        >
          {informationPanelOpen(panel) ? `Close ${panel.title}` : `Open ${panel.title}`}
        </button>
      {/each}
    </div>
    <div class="mobile-sheet-controls">
      <button type="button" onclick={focusTerminal}>Focus terminal</button>
      {#if placeholderOpen}
        <button type="button" onclick={closePlaceholder}>Close panel</button>
      {:else}
        <button type="button" onclick={openPlaceholder}>Open panel</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .workspace-shell {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.75rem;
    height: min(60vh, 48rem);
    min-height: 25rem;
    margin-top: 1.5rem;
  }

  .workspace-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
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
