<script lang="ts">
  import { untrack } from "svelte";
  import type { ShellBootstrap } from "./bootstrap-transaction.ts";
  import type { Session, SessionConnectionSnapshot } from "../runtime/session.ts";
  import type { ConnectionHealthSnapshot } from "../runtime/connection-health.ts";
  import type { TransportEndpoint, TransportName } from "../transport/types.ts";
  import WorkspaceHost from "../workspace/WorkspaceHost.svelte";
  import AudioControls from "./AudioControls.svelte";
  import AnnouncementsOverlay from "./AnnouncementsOverlay.svelte";
  import BroadcastOverlay from "./BroadcastOverlay.svelte";
  import GiphyOverlay from "./GiphyOverlay.svelte";
  import LinuxRescueOverlay from "./LinuxRescueOverlay.svelte";
  import NotificationsMenu from "./NotificationsMenu.svelte";
  import ServerWindowHost from "./ServerWindowHost.svelte";
  import SettingsDialog from "./SettingsDialog.svelte";
  import SnoopOverlay from "./SnoopOverlay.svelte";
  import TutorialOverlay from "./TutorialOverlay.svelte";
  import VisualEffectsLayer from "./VisualEffectsLayer.svelte";
  import { loadClientSettings } from "./client-settings.ts";
  // @ts-expect-error Legacy UI module has no declaration file.
  import { gameTitle } from "../../public/js/brand.js";
  // @ts-expect-error Legacy UI module has no declaration file.
  import { formatUpdateMessage } from "../../public/js/desktop-integration.js";
  // @ts-expect-error Legacy UI module has no declaration file.
  import { applyTheme, BUILTIN_THEMES, DEFAULT_THEME_KEY } from "../../public/js/theme-manager.js";

  type UpdateStatus = {
    state: string;
    version?: string;
    percent?: number;
    message?: string;
  };

  type DesktopApi = {
    getInfo(): Promise<{ updateStatus?: UpdateStatus }>;
    checkForUpdates(): Promise<unknown> | unknown;
    installUpdate(): Promise<unknown> | unknown;
    onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
  };

  let {
    endpoint,
    session,
    shell,
  }: { endpoint: TransportEndpoint; session: Session; shell: ShellBootstrap } = $props();

  let snapshot = $state<SessionConnectionSnapshot>(untrack(() => session.getConnectionSnapshot()));
  let host = $state(untrack(() => endpoint.host));
  let port = $state(untrack(() => endpoint.port));
  let protocol = $state<TransportName>(untrack(() => endpoint.protocol));
  let everConnected = $state(false);
  let now = $state(Date.now());
  let shellRoot = $state<HTMLElement>();
  let workspaceToolbar = $state<HTMLElement>();
  let workspaceHost = $state<{
    navigateTerminalLine(lineId: number): boolean;
    draftTerminalCommand(command: string): boolean;
  }>();
  let retryButton = $state<HTMLButtonElement>();
  let updateStatus = $state<UpdateStatus | null>(null);
  let clientVersion = $state<string | null>(null);
  let settingsOpen = $state(false);
  let settingsButton = $state<HTMLButtonElement>();
  let announcementsOpen = $state(false);
  let announcementsButton = $state<HTMLButtonElement>();
  let interactionSnapshot = $state(untrack(() => session.interactions.getSnapshot()));
  let visualSnapshot = $state(untrack(() => session.visualEffects.getSnapshot()));
  let themeKey = $state(untrack(() => session.configuration.getSnapshot().themeKey));
  let health = $state<ConnectionHealthSnapshot>(
    untrack(() => session.connectionHealth.getSnapshot()),
  );
  let rfc2549Enabled = $state(false);
  let rfc2549QosOverride = $state<string | null>(null);
  let manualRedMarks = $state<Array<{ ts: string; type: string; detail: unknown }>>([]);

  const redEventTypes = new Set([
    "force-reconnect",
    "send-error",
    "message-handler-error",
    "ws-send-error",
    "ws-gmcp-send-error",
  ]);
  const recentRfcEvents = $derived(health.transport.events.slice(-8));
  const rfcRedMarks = $derived(
    recentRfcEvents.filter(({ type }) => redEventTypes.has(type)).length + manualRedMarks.length,
  );
  const rfcQos = $derived.by(() => {
    if (rfc2549QosOverride) return rfc2549QosOverride;
    if (!health.inputs.connected || health.transport.stalledAt || rfcRedMarks > 0) return "Coach";
    if (health.transport.bufferedAmount > 65_536) return "Business";
    if (health.transport.recentCommandCount >= 3) return "First";
    return "Concorde";
  });
  const incomingVisualMotion = $derived(
    !shell.zorkOnly &&
      !visualSnapshot.reducedMotion &&
      visualSnapshot.enabled &&
      visualSnapshot.preferences.incomingDamage &&
      visualSnapshot.activeCues.some(({ slot }) => slot === "incoming"),
  );
  const outgoingVisualMotion = $derived(
    !shell.zorkOnly &&
      !visualSnapshot.reducedMotion &&
      visualSnapshot.enabled &&
      visualSnapshot.preferences.outgoingDamage &&
      visualSnapshot.activeCues.some(({ slot }) => slot === "outgoing"),
  );

  const reconnectVisible = $derived(
    everConnected &&
      snapshot.state !== "connected" &&
      snapshot.reconnect?.userDisconnected !== true &&
      ["connecting", "scheduled", "idle"].includes(snapshot.reconnect?.status ?? ""),
  );
  const secondsUntilRetry = $derived(
    snapshot.reconnect?.nextAttemptAt
      ? Math.max(0, Math.ceil((snapshot.reconnect.nextAttemptAt - now) / 1000))
      : 0,
  );
  const connectionStatus = $derived.by(() => {
    const transport = snapshot.reconnect?.transport ?? protocol;
    if (snapshot.state === "connecting") return `Connecting via ${transport}`;
    if (snapshot.state === "connected") return `Connected via ${transport}`;
    if (snapshot.reconnect?.status === "scheduled") return "Disconnected. Retry scheduled.";
    return "Disconnected";
  });

  $effect(() => {
    applyTheme(BUILTIN_THEMES[themeKey] ?? BUILTIN_THEMES[DEFAULT_THEME_KEY]);
    document.title = gameTitle(shell.gameName);
  });

  $effect(() => session.configuration.subscribe((next) => (themeKey = next.themeKey)));
  $effect(() => session.connectionHealth.subscribe((next) => (health = next)));
  $effect(() => session.interactions.subscribe((next) => (interactionSnapshot = next)));
  $effect(() => session.visualEffects.subscribe((next) => (visualSnapshot = next)));
  $effect(() => session.visualEffects.configure(loadClientSettings(localStorage).settings));

  $effect(() => {
    const truthy = (value: string | null): boolean =>
      value !== null && ["", "1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    const params = new URLSearchParams(location.search);
    try {
      rfc2549Enabled = params.has("rfc2549")
        ? truthy(params.get("rfc2549"))
        : truthy(localStorage.getItem("darkflow-rfc2549"));
    } catch {
      rfc2549Enabled = params.has("rfc2549") && truthy(params.get("rfc2549"));
    }

    const api = {
      enable: () => setRfc2549Enabled(true),
      disable: () => setRfc2549Enabled(false),
      toggle: () => setRfc2549Enabled(!rfc2549Enabled),
      snapshot: () => ({
        enabled: rfc2549Enabled,
        qos: rfcQos,
        route: rfcRoute(),
        bytes: {
          sent: health.transport.bytesSent,
          received: health.transport.bytesReceived,
          total: health.transport.bytesSent + health.transport.bytesReceived,
        },
        redMarks: rfcRedMarks,
        pulseRate: rfcPulse(),
        socket: health.transport,
      }),
      setQoS: (className: string) => {
        rfc2549QosOverride = className.trim() || null;
      },
      markRed: (reason?: string) => {
        manualRedMarks = [
          ...manualRedMarks,
          {
            ts: new Date().toISOString(),
            type: "manual-red",
            detail: { reason: reason || "manual mark" },
          },
        ].slice(-20);
      },
    };
    const target = window as typeof window & { rfc2549Debug?: typeof api };
    target.rfc2549Debug = api;
    return () => {
      if (target.rfc2549Debug === api) delete target.rfc2549Debug;
    };
  });

  $effect(() => {
    session.setConnectionEndpoint(endpoint);
    const unsubscribe = session.subscribeConnection((next) => {
      snapshot = next;
      if (next.state === "connected") everConnected = true;
    });
    if (shell.shouldAutoConnect) session.connect();
    return unsubscribe;
  });

  $effect(() => {
    if (!reconnectVisible || snapshot.reconnect?.status !== "scheduled") return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });

  $effect(() => {
    if (!reconnectVisible) return;
    const previousFocus = document.activeElement;
    queueMicrotask(() => retryButton?.focus());
    return () => {
      queueMicrotask(() => {
        const restoreTarget =
          previousFocus instanceof HTMLElement && previousFocus.isConnected
            ? previousFocus
            : shellRoot;
        restoreTarget?.focus();
      });
    };
  });

  $effect(() => {
    const desktop = (window as typeof window & { darkflowDesktop?: DesktopApi }).darkflowDesktop;
    if (desktop) {
      let disposed = false;
      const render = (status: UpdateStatus) => {
        if (!disposed) updateStatus = status;
      };
      const unsubscribe = desktop.onUpdateStatus(render);
      void desktop
        .getInfo()
        .then((info) => info.updateStatus && render(info.updateStatus))
        .catch(() => {});
      return () => {
        disposed = true;
        unsubscribe();
      };
    }

    let disposed = false;
    const fetchVersion = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const data = (await response.json()) as { version?: string };
        if (!disposed && data.version) {
          if (clientVersion && clientVersion !== data.version)
            updateStatus = { state: "browser-update" };
          clientVersion = data.version;
        }
      } catch {
        // Version checks are advisory in browser mode.
      }
    };
    void fetchVersion();
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void fetchVersion();
      },
      5 * 60 * 1000,
    );
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  });

  function connect(event: SubmitEvent): void {
    event.preventDefault();
    const next: TransportEndpoint = {
      host: host.trim() || "localhost",
      port: port.trim() || "4242",
      protocol,
    };
    host = next.host;
    port = next.port;
    session.setConnectionEndpoint(next);
    persistProtocol(protocol);
    if (snapshot.reconnect?.status === "scheduled") session.retryConnection();
    else session.connect();
  }

  function persistProtocol(value: TransportName): void {
    try {
      localStorage.setItem("darkflow-protocol", value);
    } catch {
      // Private browsing and quota failures leave the current selection usable.
    }
  }

  function reconnectDetail(): string {
    const parts: string[] = [];
    if (snapshot.reconnect?.status === "scheduled") {
      parts.push(`Next attempt in ${secondsUntilRetry}s`);
    }
    if (snapshot.reconnect?.attempt) parts.push(`attempt ${snapshot.reconnect.attempt}`);
    if (snapshot.reconnect?.transport) parts.push(`via ${snapshot.reconnect.transport}`);
    return parts.join("; ");
  }

  const updateDisplay = $derived(
    updateStatus?.state === "browser-update"
      ? { message: "A new client version is available.", action: "Refresh to update" }
      : updateStatus
        ? formatUpdateMessage(updateStatus)
        : null,
  );

  function runUpdateAction(): void {
    const desktop = (window as typeof window & { darkflowDesktop?: DesktopApi }).darkflowDesktop;
    const operation = desktop
      ? ["downloaded", "manual"].includes(updateStatus?.state ?? "")
        ? desktop.installUpdate()
        : desktop.checkForUpdates()
      : location.reload();
    Promise.resolve(operation).catch(() => {});
  }

  function setRfc2549Enabled(enabled: boolean): void {
    rfc2549Enabled = enabled;
    try {
      if (enabled) localStorage.setItem("darkflow-rfc2549", "1");
      else localStorage.removeItem("darkflow-rfc2549");
    } catch {
      // The URL opt-in remains usable when storage is unavailable.
    }
  }

  function formatBytes(value: number): string {
    if (value < 1_024) return `${value} B`;
    if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
    return `${(value / 1_048_576).toFixed(1)} MB`;
  }

  function rfcRoute(): string {
    const { protocol, host, port } = health.endpoint;
    return `${protocol}${protocol.startsWith("telnet") ? " bridge" : " direct"} to ${host}:${port}`;
  }

  function rfcPulse(): string {
    if (recentRfcEvents.length < 2) return "idle";
    const first = Date.parse(recentRfcEvents[0]?.ts ?? "");
    const last = Date.parse(recentRfcEvents.at(-1)?.ts ?? "");
    return Number.isFinite(first) && Number.isFinite(last) && last > first
      ? `${(recentRfcEvents.length / ((last - first) / 60_000)).toFixed(1)}/min`
      : `${recentRfcEvents.length} events`;
  }

  function activateNotification(id: number): boolean {
    const lineId = session.notifications.activate(id);
    if (lineId !== null && workspaceHost?.navigateTerminalLine(lineId)) return true;
    session.notifications.markExpired(id);
    return false;
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (rfc2549Enabled && event.key === "Escape") setRfc2549Enabled(false);
  }}
/>

<main
  bind:this={shellRoot}
  class:dw-visual-impact-shake={incomingVisualMotion}
  class:dw-visual-attack-lunge={outgoingVisualMotion}
  data-testid="phase2-shell"
  data-session-id={session.sessionId}
  tabindex="-1"
>
  <header class="app-chrome">
    <img src="/assets/brand/darkflow-icon-64.png" alt="" aria-hidden="true" />
    <h1>{gameTitle(shell.gameName)}</h1>

    <form class="connection-form" aria-label="Connection" onsubmit={connect}>
      {#if !shell.zorkOnly}
        <label>
          Host
          <input aria-label="Host" bind:value={host} autocomplete="url" />
        </label>
        <label>
          Port
          <input
            aria-label="Port"
            type="number"
            min="1"
            max="65535"
            value={port}
            oninput={(event) => (port = event.currentTarget.value)}
          />
        </label>
        <label>
          Protocol
          <select
            aria-label="Connection protocol"
            bind:value={protocol}
            onchange={(event) => persistProtocol(event.currentTarget.value as TransportName)}
          >
            <option value="ws">WebSocket</option>
            <option value="wss">Secure WebSocket</option>
            <option value="telnet">Telnet proxy</option>
            <option value="telnets">Secure telnet proxy</option>
          </select>
        </label>
      {:else}
        <p>Darkwind connection</p>
      {/if}

      {#if snapshot.state === "connected"}
        <button type="button" onclick={() => session.disconnect()}>Disconnect</button>
      {:else}
        <button type="submit" disabled={snapshot.state === "connecting"}>
          {snapshot.state === "connecting" ? "Connecting..." : "Connect"}
        </button>
      {/if}
    </form>

    <p data-testid="connection-status" role="status" aria-live="polite" class="app-chrome-status">
      {connectionStatus}
    </p>

    <div class="app-workspace-slot" bind:this={workspaceToolbar}></div>

    <div class="app-actions">
      <AudioControls {session} />
      <NotificationsMenu {session} onactivate={activateNotification} />
      <button
        bind:this={announcementsButton}
        type="button"
        onclick={() => (announcementsOpen = true)}
      >
        Announcements
        {#if interactionSnapshot.announcements.unreadCount > 0}
          <span class="toolbar-count-badge" aria-label="Unread announcements">
            {interactionSnapshot.announcements.unreadCount}
          </span>
        {/if}
      </button>
      <button bind:this={settingsButton} type="button" onclick={() => (settingsOpen = true)}>
        Settings
      </button>
    </div>
  </header>

  <WorkspaceHost
    bind:this={workspaceHost}
    characterProfileId={session.characterProfileId}
    presentationAllowed={!shell.zorkOnly}
    {session}
    {workspaceToolbar}
  />
</main>

<SettingsDialog
  open={settingsOpen}
  {session}
  onclose={() => {
    settingsOpen = false;
    queueMicrotask(() => settingsButton?.focus());
  }}
/>

<ServerWindowHost {session} />
<SnoopOverlay {session} />
<AnnouncementsOverlay
  open={announcementsOpen}
  {session}
  onclose={() => {
    announcementsOpen = false;
    queueMicrotask(() => announcementsButton?.focus());
  }}
/>
<GiphyOverlay {session} />
<BroadcastOverlay {session} />
<LinuxRescueOverlay {session} />
{#if !shell.zorkOnly}
  <TutorialOverlay
    tutorial={session.tutorial}
    onExampleCommand={(command) => workspaceHost?.draftTerminalCommand(command)}
  />
  <VisualEffectsLayer {session} />
{/if}

{#if rfc2549Enabled}
  <section
    class="rfc2549-debug-panel"
    aria-label="RFC 2549 debug panel"
    data-qos={rfcQos.toLowerCase()}
  >
    <div class="rfc2549-header">
      <div>
        <span class="rfc2549-kicker">RFC 2549</span>
        <h2>Avian QoS</h2>
      </div>
      <button
        type="button"
        class="rfc2549-close"
        title="Disable RFC 2549 debug"
        onclick={() => setRfc2549Enabled(false)}>×</button
      >
    </div>
    <div class="rfc2549-body">
      {#each [["QoS class", rfcQos], ["Route", rfcRoute()], ["Frequent flyer miles", formatBytes(health.transport.bytesSent + health.transport.bytesReceived)], ["Carrier queue", String(recentRfcEvents.length)], ["RED-marked packets", String(rfcRedMarks)], ["Pulse rate", rfcPulse()]] as [label, value] (label)}
        <div class="rfc2549-row"><span>{label}</span><strong>{value}</strong></div>
      {/each}
      <ol class="rfc2549-events">
        {#each recentRfcEvents as event (event)}
          <li><span>{new Date(event.ts).toLocaleTimeString()}</span>{event.type}</li>
        {:else}
          <li><span>--:--:--</span>carrier queue idle</li>
        {/each}
      </ol>
      <div class="rfc2549-footnote">RFC 2549 debug visualization only. Transport is unchanged.</div>
    </div>
  </section>
{/if}

{#if updateDisplay}
  <aside class="update-banner" data-testid="update-banner" aria-live="polite">
    <span>{updateDisplay.message}</span>
    {#if updateDisplay.action}
      <button type="button" onclick={runUpdateAction}>{updateDisplay.action}</button>
    {/if}
  </aside>
{/if}

{#if reconnectVisible}
  <div class="reconnect-overlay">
    <div
      class="reconnect-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reconnect-title"
      aria-describedby="reconnect-detail"
    >
      <h2 id="reconnect-title">
        {snapshot.reconnect?.status === "connecting" ? "Reconnecting..." : "Connection lost"}
      </h2>
      <p id="reconnect-detail">
        {snapshot.reconnect?.status === "idle" ? "Automatic reconnect is off." : reconnectDetail()}
      </p>
      <div class="reconnect-actions">
        <button
          bind:this={retryButton}
          type="button"
          disabled={snapshot.reconnect?.status === "connecting"}
          onclick={() => session.retryConnection()}>Retry now</button
        >
        <button type="button" onclick={() => session.disconnect()}>Stop trying</button>
      </div>
    </div>
  </div>
{/if}

<style>
  main {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 100dvh;
    padding: clamp(0.75rem, 2.5vw, 1.5rem);
    background: var(--df-bg, #0d1117);
    color: var(--df-text, #c9d1d9);
  }

  .app-chrome {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    /* Wide screens use one stable row; narrower screens move the intact
       connection form to a deliberate second row below. */
    flex-wrap: nowrap;
    min-width: 0;
    margin-bottom: 0.5rem;
  }

  .app-chrome img {
    width: 2rem;
    height: 2rem;
  }

  .app-chrome h1 {
    /* Compact title -- the toolbar is a working row, not a hero. */
    font-size: 1.25rem;
    margin-right: 0.5rem;
  }

  .app-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.5rem;
    margin-left: auto;
    align-items: center;
  }

  /*
   * The connection-status paragraph and the workspace toolbar (Panels button
   * plus workspace-status) sit on the header row. Compact them so a full row
   * still fits on desktop.
   */
  .app-chrome-status,
  .app-workspace-slot {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--df-muted, #8b949e);
  }
  .app-workspace-slot {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }
  /*
   * Cap the connection status width so a text change from `Disconnected` to
   * `Connected via ws` (and back) doesn't shift the header enough to flip
   * between one and two wrapped rows. When the row wraps or unwraps mid-test,
   * Dockview's tab drop targets sit at moving coordinates and drag helpers
   * hit the wrong element.
   */
  .app-chrome-status {
    flex: 0 0 auto;
    min-width: 12ch;
    max-width: 12ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /*
   * Svelte prunes CSS whose left-hand match doesn't appear in this component's
   * template; the portalled children arrive at runtime, so the whole rule must
   * be `:global` -- otherwise Svelte strips it and the paragraph inflates back
   * to full row width, pushing the actions block onto its own line.
   */
  :global(.app-workspace-slot > *) {
    margin: 0;
    flex: 0 0 auto;
    width: auto;
  }
  /*
   * Cap the workspace status width so long transient messages (`Saved
   * workspace is incompatible; using the default layout.`) don't inflate the
   * header. Both min- and max-width pinned so the width stays constant across
   * transitions.
   */
  :global(.app-workspace-slot .workspace-status) {
    min-width: 18ch;
    max-width: 18ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .app-actions button {
    position: relative;
  }

  h1,
  p {
    margin: 0;
  }

  .connection-form,
  .reconnect-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .connection-form {
    flex: 0 0 auto;
    flex-wrap: nowrap;
  }

  .reconnect-actions {
    flex-wrap: wrap;
  }

  /* Inline label + input pairs so host/port/protocol/connect fit on one row. */
  .connection-form label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--df-muted, #8b949e);
  }

  @media (max-width: 1200px) {
    .app-chrome {
      flex-wrap: wrap;
    }

    .app-chrome .connection-form {
      flex: 1 0 100%;
      order: 2;
    }
  }

  /*
   * At mobile widths the toolbar can't fit; stack the three sections instead.
   * `.app-actions` stays right-aligned so its overlay-anchored expanded panel
   * (audio widget) has room to open to the left inside the viewport.
   */
  @media (max-width: 700px) {
    /*
     * Mobile viewports cannot fit the desktop single-row toolbar; allow
     * wrapping and split into two rows: [logo + title + actions] on row 1,
     * connection form on row 2. Desktop stays `nowrap` so layout is stable
     * for Dockview.
     */
    .app-chrome {
      flex-wrap: wrap;
    }
    .app-chrome .connection-form {
      flex-wrap: wrap;
    }
    .app-actions {
      flex-shrink: 0;
    }
    /*
     * The audio widget expanded panel is anchored to `#audio-widget-root` and
     * opens leftward via `right: -36; width: 300`, so the widget needs enough
     * space to its left inside the viewport. Reorder it to the end of the
     * actions row so it sits against the right edge on mobile.
     */
    /*
     * Svelte scopes `.app-actions`; audio-widget-root and its expanded panel
     * live in AudioControls, a different scope. Use :global so the reorder
     * and expanded-panel alignment actually reach them.
     */
    .app-actions :global(#audio-widget-root) {
      order: 99;
    }
    /*
     * Legacy CSS anchors the expanded panel with `right: -36px`, tuned to a
     * layout where the widget sat further from the viewport's right edge.
     * On the reordered mobile row the widget is now against the right edge,
     * so anchor the panel to `right: 0` -- it opens fully leftward inside
     * the viewport without spilling off the right.
     */
    .app-actions :global(.sound-widget-expanded) {
      right: 0;
    }
  }

  input,
  select,
  button {
    min-height: 2.5rem;
  }

  :is(input, select, button):focus-visible {
    outline: 2px solid var(--df-accent-blue, #58a6ff);
    outline-offset: 2px;
  }

  .update-banner {
    position: fixed;
    top: 0.75rem;
    right: 0.75rem;
    z-index: 1001;
    display: flex;
    gap: 0.75rem;
    align-items: center;
    max-width: calc(100vw - 1.5rem);
    padding: 0.75rem 1rem;
    border: 1px solid var(--df-warn, #d9931f);
    border-radius: 0.5rem;
    background: var(--df-panel, #161b22);
  }

  .reconnect-overlay {
    position: fixed;
    inset: 0;
    z-index: 4000;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(0 0 0 / 65%);
  }

  .reconnect-dialog {
    box-sizing: border-box;
    width: min(28rem, 100%);
    padding: 1.25rem;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.5rem;
    background: var(--bg-secondary, #161b22);
  }

  @media (max-width: 420px) {
    .connection-form,
    .reconnect-actions {
      align-items: stretch;
      flex-direction: column;
    }

    label,
    input,
    select,
    button {
      width: 100%;
    }

    .update-banner {
      align-items: stretch;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
</style>
