<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type { GmcpDiagnosticsSnapshot } from "../runtime/gmcp-diagnostics.ts";
  import type { Session } from "../runtime/session.ts";
  import type { PanelState } from "./workspace.ts";

  const CLEAR_CONFIRMATION =
    "Clear the authoritative map cache for this world? This affects other characters on the same world and cannot be undone locally. Map Export can preserve a diagnostic copy, but it cannot restore the cache.";

  let { panelId, session }: { panelId: string; state: Readable<PanelState>; session?: Session } =
    $props();

  const activeSession: Session = untrack(() => {
    if (!session) throw new Error("GMCP Debug requires a session");
    return session;
  });
  let output = $state<HTMLElement>();
  let snapshot = $state<GmcpDiagnosticsSnapshot>(activeSession.gmcpDiagnostics.getSnapshot());
  let clipboardStatus = $state("");

  $effect(() =>
    activeSession.gmcpDiagnostics.subscribe((next) => {
      const follow = output && output.scrollTop + output.clientHeight >= output.scrollHeight - 2;
      snapshot = next;
      if (follow) void tick().then(() => output && (output.scrollTop = output.scrollHeight));
    }),
  );

  function entriesText(): string {
    return snapshot.entries
      .map(({ timestamp, packageName, payload }) => `${timestamp} ${packageName}\n${payload}`)
      .join("\n\n");
  }

  async function copy(text: string, success: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      clipboardStatus = success;
    } catch {
      clipboardStatus = "Clipboard access failed.";
    }
  }

  function clearMap(): void {
    if (!window.confirm(CLEAR_CONFIRMATION)) return;
    clipboardStatus = activeSession.gmcpDiagnostics.clearMap()
      ? "Map cache cleared. Resync or relearn to recover."
      : "Map cache was not cleared.";
  }
</script>

<section class="gmcp-debug-panel" data-panel-id={panelId} data-workspace-owned="true">
  <div class="gmcp-debug-actions">
    <button type="button" onclick={() => void copy(entriesText(), "Copied all entries.")}
      >Copy All</button
    >
    <button type="button" onclick={() => activeSession.gmcpDiagnostics.appendMapSummary()}
      >Map Summary</button
    >
    <button
      type="button"
      onclick={() => {
        const exported = activeSession.gmcpDiagnostics.copyMapExport();
        if (exported !== null) void copy(exported, "Copied map export.");
      }}>Map Export</button
    >
    <button type="button" onclick={clearMap}>Clear Map</button>
  </div>
  <p class="gmcp-debug-status" role="status" aria-live="polite">{clipboardStatus}</p>
  <div bind:this={output} class="gmcp-debug-output" role="log" aria-label="GMCP messages">
    {#each snapshot.entries as entry (entry.id)}
      <article class="gmcp-debug-entry">
        <strong>{entry.timestamp} {entry.packageName}</strong>
        <pre>{entry.payload}</pre>
      </article>
    {/each}
  </div>
</section>

<style>
  .gmcp-debug-panel {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
    padding: 0.75rem;
  }
  .gmcp-debug-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .gmcp-debug-status {
    min-height: 1.25rem;
    margin: 0;
  }
  .gmcp-debug-output {
    min-height: 0;
    flex: 1;
    overflow: auto;
    border: 1px solid var(--border-color, #30363d);
    padding: 0.5rem;
  }
  .gmcp-debug-entry {
    margin-bottom: 0.75rem;
  }
  .gmcp-debug-entry pre {
    margin: 0.25rem 0 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
