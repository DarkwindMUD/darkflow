<script lang="ts">
  import { onMount } from "svelte";
  import type { Readable } from "svelte/store";
  import type { Session } from "../runtime/session.ts";
  // @ts-expect-error The reusable imperative terminal core is legacy JavaScript.
  import { createTerminalOutputCore } from "../../public/js/terminal-output-core.mjs";
  import {
    createTerminalIsland,
    registerTerminalIsland,
    type TerminalIsland,
  } from "./terminal-island";
  import type { PanelState } from "./workspace";

  let {
    panelId,
    state: panelState,
    session,
  }: { panelId: string; state: Readable<PanelState>; session?: Session } = $props();
  let host = $state<HTMLElement>();
  let output = $state<HTMLElement>();
  let island: TerminalIsland | undefined;

  onMount(() => {
    if (!host) return;
    if (!session) {
      island = createTerminalIsland(host, panelId);
      let previousBuffer: string | undefined;
      let previousAppend: unknown;
      return panelState.subscribe((value) => {
        const candidate = value.buffer ?? value.output ?? value.text;
        const buffer = Array.isArray(candidate) ? candidate.join("\n") : candidate;
        if (typeof buffer === "string" && buffer !== previousBuffer) {
          island?.replace?.(buffer);
          previousBuffer = buffer;
        }
        if (typeof value.append === "string" && value.append !== previousAppend) {
          island?.append?.(value.append);
          previousAppend = value.append;
        }
      });
    }
    if (!output) return;
    island = registerTerminalIsland(output, panelId);
    const terminal = createTerminalOutputCore({
      shell: output.parentElement!,
      output,
      pauseButton: output.parentElement!.querySelector<HTMLButtonElement>("[data-action=pause]")!,
      liveButton: output.parentElement!.querySelector<HTMLButtonElement>("[data-action=live]")!,
      clearButton: output.parentElement!.querySelector<HTMLButtonElement>("[data-action=clear]")!,
      announcer: output.parentElement!.querySelector<HTMLElement>(
        "[data-testid=terminal-announcer]",
      )!,
    });
    const unsubscribe = session.terminal.subscribeText(terminal.appendOutput);

    return () => {
      unsubscribe();
      terminal.dispose();
      island?.dispose();
      island = undefined;
    };
  });
</script>

<section
  bind:this={host}
  class="phase0-terminal-panel"
  data-panel-id={panelId}
  data-workspace-owned="true"
>
  {#if session}
    <div class="terminal-output-shell">
      <div class="terminal-controls">
        <button data-action="live" type="button" title="Return to live terminal">Live</button>
        <button data-action="pause" type="button" aria-pressed="false">Paused</button>
        <button data-action="clear" type="button">Clear</button>
      </div>
      <div
        bind:this={output}
        class="terminal-output"
        aria-label="Terminal output"
        tabindex="-1"
      ></div>
      <div
        data-testid="terminal-announcer"
        class="sr-only"
        aria-live="polite"
        aria-atomic="false"
      ></div>
    </div>
  {/if}
</section>

<style>
  .phase0-terminal-panel {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .terminal-output-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #000;
    overflow: hidden;
  }

  .terminal-output {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 12px;
    color: #c9d1d9;
    font-family: var(--df-font-mono, monospace);
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .terminal-controls {
    display: flex;
    gap: 0.5rem;
    flex: 0 0 auto;
    padding: 0.5rem;
    background: var(--df-panel, #161b22);
  }
</style>
