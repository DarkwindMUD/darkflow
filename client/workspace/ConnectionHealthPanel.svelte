<script lang="ts">
  import { untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type { ConnectionHealthSnapshot } from "../runtime/connection-health.ts";
  import type { Session } from "../runtime/session.ts";
  import type { PanelState } from "./workspace.ts";
  // @ts-expect-error Pure legacy-compatible diagnostics core has no declaration file.
  import { sparklinePoints } from "../../public/js/lag-core.mjs";

  let { panelId, session }: { panelId: string; state: Readable<PanelState>; session?: Session } =
    $props();

  const activeSession = untrack(() => session);
  if (!activeSession) throw new Error("Connection Health requires a session");

  let snapshot = $state<ConnectionHealthSnapshot>(activeSession.connectionHealth.getSnapshot());
  const mudLine = $derived(
    sparklinePoints(snapshot.mudSamples, snapshot.t, { width: 280, height: 46 }),
  );
  const httpLine = $derived(
    sparklinePoints(snapshot.httpSamples, snapshot.t, {
      width: 280,
      height: 46,
      floorMax: mudLine.maxRtt,
    }),
  );

  $effect(() => activeSession.connectionHealth.subscribe((next) => (snapshot = next)));

  function axes(): Array<{
    label: string;
    status: string;
    reasons: readonly string[];
    stat: string;
  }> {
    return [
      { label: "Network", ...snapshot.diagnosis.network, stat: networkStat() },
      { label: "Game server", ...snapshot.diagnosis.server, stat: serverStat() },
      { label: "Your device", ...snapshot.diagnosis.local, stat: localStat() },
    ];
  }

  function points(segment: readonly { x: number; y: number }[]): string {
    return segment.map(({ x, y }) => `${x},${y}`).join(" ");
  }

  function networkStat(): string {
    const { mud, http } = snapshot.inputs;
    if (!mud) return "collecting...";
    return `${mud.median}ms game / ${http ? `${http.median}ms web` : "-- web"}${
      mud.lossPct ? ` / ${mud.lossPct}% loss` : ""
    }`;
  }

  function serverStat(): string {
    const server = snapshot.inputs.server;
    if (server && server.window_s > 0)
      return `drift ${server.hb_drift_avg_ms}ms avg, ${server.hb_drift_max_ms}ms max`;
    return snapshot.inputs.serverSupported ? "collecting..." : "not reported";
  }

  function localStat(): string {
    const local = snapshot.inputs.local;
    return local
      ? `tab drift ${local.driftP90}ms${
          snapshot.inputs.reconnectsRecent
            ? ` / ${snapshot.inputs.reconnectsRecent} reconnect(s)`
            : ""
        }`
      : "collecting...";
  }
</script>

<section class="connection-health-panel" data-panel-id={panelId} data-workspace-owned="true">
  {#if !snapshot.enabled}
    <p>Connection health monitoring is disabled in Settings.</p>
  {:else}
    <p class={`lag-verdict lag-verdict-${snapshot.diagnosis.verdict}`}>
      {snapshot.diagnosis.headline}
    </p>
    {#each axes() as axis (axis.label)}
      <div class="lag-axis">
        <span class={`lag-dot lag-dot-${axis.status}`}></span>
        <strong>{axis.label}</strong>
        <span class="lag-axis-stat">{axis.stat}</span>
        {#if axis.reasons[0]}<span class="lag-axis-reason">{axis.reasons[0]}</span>{/if}
      </div>
    {/each}
    <div class="lag-spark-wrap">
      <svg
        class="lag-spark"
        viewBox="0 0 280 46"
        preserveAspectRatio="none"
        aria-label="Game and web latency over the last minute"
      >
        {#each httpLine.segments.filter((segment: unknown[]) => segment.length > 1) as segment (segment)}
          <polyline class="lag-spark-http" points={points(segment)}></polyline>
        {/each}
        {#each mudLine.segments.filter((segment: unknown[]) => segment.length > 1) as segment (segment)}
          <polyline class="lag-spark-mud" points={points(segment)}></polyline>
        {/each}
      </svg>
      <div class="lag-spark-legend">
        <span><i class="lag-leg-mud"></i>game</span>
        <span><i class="lag-leg-http"></i>web</span>
        <span class="lag-spark-max">max {Math.round(mudLine.maxRtt)}ms</span>
      </div>
    </div>
    <div class="lag-check-row">
      <button
        type="button"
        disabled={snapshot.fullCheck?.running}
        onclick={() => activeSession.connectionHealth.runFullCheck()}
        >{snapshot.fullCheck?.running ? "Checking..." : "Run full check"}</button
      >
      {#if snapshot.fullCheck && !snapshot.fullCheck.running}
        {#if snapshot.fullCheck.internetRtt !== null}
          <span>internet {snapshot.fullCheck.internetRtt}ms</span>
        {:else if snapshot.fullCheck.internetError}
          <span>internet check failed</span>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .connection-health-panel {
    box-sizing: border-box;
    min-height: 100%;
    padding: 0.75rem;
    overflow: auto;
  }
</style>
