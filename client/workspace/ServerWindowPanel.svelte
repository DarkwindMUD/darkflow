<script lang="ts">
  import { untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type {
    InteractionWindow,
    SessionInteractionSnapshot,
  } from "../gmcp/contracts/interactions.ts";
  import type { Session, SessionConnectionSnapshot } from "../runtime/session.ts";
  import type { PanelState } from "./workspace.ts";
  // @ts-expect-error The shared server-window DOM renderer is legacy JavaScript.
  import * as windowRenderer from "../../public/js/window-renderer.js";
  // @ts-expect-error The retained dashboard renderer is legacy JavaScript.
  import * as streetSamuraiRenderer from "../../public/js/street-samurai-dashboard.js";

  const { collectFormData, renderLayout, updateElements } = windowRenderer;

  const AUTH_WINDOW_IDS = new Set(["login", "newchar", "charselect"]);
  const SHARED_VIDEO_GEOMETRY_KEY = "darkwind-shared-video-window-geometry";

  let {
    panelId,
    state: panelState,
    session,
    windowId: directWindowId,
  }: {
    panelId: string;
    state?: Readable<PanelState>;
    session?: Session;
    windowId?: string;
  } = $props();

  const resolvedSession = untrack(() => session);
  if (!resolvedSession) throw new Error("Server windows require a session");
  const activeSession: Session = resolvedSession;

  let stateWindowId = $state<string>();
  let snapshot = $state<SessionInteractionSnapshot>(activeSession.interactions.getSnapshot());
  let connection = $state<SessionConnectionSnapshot>(activeSession.getConnectionSnapshot());
  let contentHost = $state<HTMLElement>();
  const windowId = $derived(directWindowId ?? stateWindowId);
  const serverWindow = $derived(windowId ? snapshot.windows[windowId] : undefined);

  $effect(() => activeSession.interactions.subscribe((next) => (snapshot = next)));
  $effect(() => activeSession.subscribeConnection((next) => (connection = next)));
  $effect(() => {
    connection.state;
    const current = untrack(() => serverWindow);
    if (contentHost && current) syncOutboundButtons(contentHost, current);
  });
  $effect(() => {
    if (!panelState) return;
    return panelState.subscribe((next) => {
      stateWindowId = typeof next.windowId === "string" ? next.windowId : undefined;
    });
  });

  function isAuthWindow(window: InteractionWindow): boolean {
    return AUTH_WINDOW_IDS.has(window.sourceId);
  }

  function restoreFormValues(host: HTMLElement, values: Record<string, unknown>): void {
    for (const [id, value] of Object.entries(values)) {
      if (value === "" || value === null || value === undefined) continue;
      const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[data-dw-input="${CSS.escape(id)}"]`,
      );
      if (!input) continue;
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = Boolean(value);
      } else {
        input.value = String(value);
      }
    }
  }

  function syncOutboundButtons(host: HTMLElement, window: InteractionWindow): void {
    if (!isAuthWindow(window)) return;
    const disabled = connection.state !== "connected";
    for (const button of host.querySelectorAll<HTMLButtonElement>("button")) {
      button.disabled = disabled;
    }
  }

  function renderServerWindow(host: HTMLElement, initial: InteractionWindow) {
    let current = initial;
    let appliedUpdates = 0;
    let streetRoot: HTMLElement | null = null;

    const handleButton = (buttonId: string | undefined, action: string): void => {
      if (!buttonId) return;
      if (action === "close") activeSession.interactions.closeWindow(current.id);
      else if (action === "submit") {
        activeSession.interactions.submitWindow(current.id, buttonId, collectFormData(host));
      } else activeSession.interactions.sendWindowAction(current.id, buttonId);
    };

    const render = (next: InteractionWindow, preserveForm: boolean): void => {
      const saved = preserveForm && isAuthWindow(current) ? collectFormData(host) : null;
      current = next;
      if (streetRoot) streetSamuraiRenderer.disposeStreetSamuraiDashboard(streetRoot);
      host.replaceChildren(
        renderLayout(next.layout, handleButton, {
          windowId: next.id,
          instanceOwnedStreetSamurai: true,
        }),
      );
      streetRoot = host.querySelector<HTMLElement>(".ss-dashboard");
      if (streetRoot && next.streetSamurai && next.streetSamuraiRevision) {
        streetSamuraiRenderer.updateStreetSamuraiDashboard(streetRoot, next.streetSamurai);
      }
      updateElements(host, next.updates);
      appliedUpdates = next.updates.length;
      if (saved) restoreFormValues(host, saved);
      syncOutboundButtons(host, next);
      if (isAuthWindow(next)) {
        queueMicrotask(() => host.querySelector<HTMLInputElement>(".dw-input")?.focus());
      }
    };

    render(initial, false);
    return {
      update(next: InteractionWindow) {
        if (next.layout !== current.layout || next.updates.length < appliedUpdates) {
          render(next, true);
          return;
        }
        updateElements(host, next.updates.slice(appliedUpdates));
        appliedUpdates = next.updates.length;
        if (
          streetRoot &&
          next.streetSamurai &&
          next.streetSamuraiRevision !== current.streetSamuraiRevision
        ) {
          streetSamuraiRenderer.updateStreetSamuraiDashboard(streetRoot, next.streetSamurai);
        }
        current = next;
      },
      destroy() {
        if (
          current.type === "panel" &&
          current.sourceId !== current.id &&
          host.querySelector(".dw-youtube-embed")
        ) {
          const rect = (
            host.closest<HTMLElement>(".dv-resize-container") ?? host
          ).getBoundingClientRect();
          try {
            localStorage.setItem(
              SHARED_VIDEO_GEOMETRY_KEY,
              JSON.stringify({
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
              }),
            );
          } catch {
            // Video windows still close when storage is unavailable.
          }
        }
        if (streetRoot) streetSamuraiRenderer.disposeStreetSamuraiDashboard(streetRoot);
        streetRoot = null;
        host.replaceChildren();
      },
    };
  }
</script>

<section
  class:embedded={directWindowId !== undefined}
  class="server-window-panel"
  data-panel-id={panelId}
  data-workspace-owned={directWindowId === undefined ? "true" : undefined}
>
  {#if serverWindow}
    <div
      bind:this={contentHost}
      class="server-window-content"
      use:renderServerWindow={serverWindow}
    ></div>
  {/if}
</section>

<style>
  .server-window-panel {
    box-sizing: border-box;
    height: 100%;
    overflow: auto;
    padding: 0.75rem;
  }

  .server-window-panel.embedded {
    height: auto;
    overflow: visible;
    padding: 0;
  }
</style>
