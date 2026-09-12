<script lang="ts">
  import type { Game } from "../gmcp/contracts/information.ts";
  import type { ConnectionHealthSnapshot } from "../runtime/connection-health.ts";
  import type { SessionConnectionSnapshot } from "../runtime/session.ts";

  let {
    clientVersion,
    game,
    health,
    now,
    onopenhealth,
    snapshot,
  }: {
    clientVersion: string | null;
    game: Game | null;
    health: ConnectionHealthSnapshot;
    now: number;
    onopenhealth: () => void;
    snapshot: SessionConnectionSnapshot;
  } = $props();

  const connectionLabel = $derived.by(() => {
    if (snapshot.state === "connecting") return "Connecting";
    if (snapshot.state !== "connected") return "Not connected";
    const connectedAt = health.transport.connectTime;
    const transport = snapshot.reconnect?.transport ?? snapshot.endpoint.protocol;
    return `Connected [${transport}]: ${formatDuration(connectedAt ? now - connectedAt : 0)}`;
  });
  const connectionTitle = $derived(
    snapshot.state === "connected"
      ? `Sent: ${formatBytes(health.transport.bytesSent)} / Recv: ${formatBytes(health.transport.bytesReceived)}`
      : "",
  );
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1_000) % 60;
    const minutes = Math.floor(ms / 60_000) % 60;
    const hours = Math.floor(ms / 3_600_000);
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function formatUptime(totalSeconds: number): string {
    let seconds = Math.floor(totalSeconds);
    const days = Math.floor(seconds / 86_400);
    seconds %= 86_400;
    const hours = Math.floor(seconds / 3_600);
    seconds %= 3_600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return [
      days ? `${days}d` : "",
      hours ? `${hours}h` : "",
      minutes ? `${minutes}m` : "",
      `${seconds}s`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function formatBytes(value: number): string {
    if (value < 1_024) return `${value} B`;
    if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
    return `${(value / 1_048_576).toFixed(1)} MB`;
  }
</script>

<footer id="status-bar" data-testid="status-footer">
  <span id="status-connection" title={connectionTitle}>{connectionLabel}</span>
  <button
    id="status-latency"
    class={`status-latency lag-${health.chip}`}
    class:status-slot-hidden={!health.enabled || health.chip === "off"}
    type="button"
    title={`${health.diagnosis.headline} (click for details)`}
    onclick={onopenhealth}
  >
    {health.latestRtt !== null ? `${health.latestRtt} ms` : "--"}
  </button>
  <span id="status-uptime"
    >Uptime: {game?.game_uptime === undefined ? "--" : formatUptime(game.game_uptime)}</span
  >
  <span id="status-versions">
    <span>Client v{clientVersion ?? "--"}</span>
    <span aria-hidden="true"> | </span>
    <span id="status-server-version">Server v{game?.game_version ?? "--"}</span>
  </span>
</footer>

<style>
  #status-bar {
    color: var(--df-muted, #8b949e);
  }

  #status-connection {
    box-sizing: border-box;
    flex: 0 0 190px;
    width: 190px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  #status-latency {
    box-sizing: border-box;
    flex: 0 0 64px;
    width: 64px;
    min-height: 0;
    background: transparent;
    font: inherit;
  }

  #status-uptime {
    box-sizing: border-box;
    flex: 0 0 152px;
    width: 152px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .status-slot-hidden {
    visibility: hidden;
  }
</style>
