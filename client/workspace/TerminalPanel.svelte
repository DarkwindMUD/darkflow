<script lang="ts">
  import { onMount } from "svelte";
  import type { Readable } from "svelte/store";
  import type { Session } from "../runtime/session.ts";
  import { createTerminalAutomation, type TerminalOutputFragment } from "../terminal/automation.ts";
  import { createTerminalInputController } from "../terminal/input-controller.ts";
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
    registerLineNavigator,
  }: {
    panelId: string;
    state: Readable<PanelState>;
    session?: Session;
    registerLineNavigator?: (navigate: (lineId: number) => boolean) => (() => void) | void;
  } = $props();
  let host = $state<HTMLElement>();
  let output = $state<HTMLElement>();
  let commandInput = $state<HTMLInputElement>();
  let sendButton = $state<HTMLButtonElement>();
  let batchDialog = $state<HTMLDialogElement>();
  let batchInput = $state<HTMLTextAreaElement>();
  let batchForm = $state<HTMLFormElement>();
  let island: TerminalIsland | undefined;

  onMount(() => {
    if (!host) return;
    if (!session) {
      island = createTerminalIsland(host, panelId);
      let previousBuffer: string | undefined;
      let previousAppend: unknown;
      const unsubscribe = panelState.subscribe((value) => {
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
      return () => {
        unsubscribe();
        island?.dispose();
        island = undefined;
      };
    }
    if (!output || !commandInput || !sendButton || !batchDialog || !batchInput || !batchForm)
      return;
    island = registerTerminalIsland(output, panelId);
    let automation: ReturnType<typeof createTerminalAutomation> | undefined;
    const terminal = createTerminalOutputCore({
      shell: output.parentElement!,
      output,
      pauseButton: output.parentElement!.querySelector<HTMLButtonElement>("[data-action=pause]")!,
      liveButton: output.parentElement!.querySelector<HTMLButtonElement>("[data-action=live]")!,
      clearButton: output.parentElement!.querySelector<HTMLButtonElement>("[data-action=clear]")!,
      announcer: output.parentElement!.querySelector<HTMLElement>(
        "[data-testid=terminal-announcer]",
      )!,
      processLine: (text: string, fragments: TerminalOutputFragment[]) =>
        automation?.processLine(text, fragments) ?? { fragments, gag: false },
      onOutputLine: session.notifications.recordOutputLine,
      onClear: session.notifications.resetOutputLines,
    });
    const unregisterLineNavigator = registerLineNavigator?.(terminal.navigateToLine);
    automation = createTerminalAutomation({
      session,
      appendOutput: terminal.appendOutput,
      appendSystemMessage: terminal.appendSystemMessage,
    });
    const unsubscribe = session.terminal.subscribeText(automation.receiveText);
    const input = createTerminalInputController({
      session,
      input: commandInput,
      sendButton,
      output,
      batchDialog,
      batchInput,
      batchForm,
      appendEcho: (text) => terminal.appendOutput(`> ${text}\n`, "echo-line"),
      appendSystemMessage: terminal.appendSystemMessage,
      executeCommand: automation.sendCommand,
      getMappedCommand: automation.getMappedCommand,
      returnOutputToLive: terminal.returnToLive,
    });

    return () => {
      unregisterLineNavigator?.();
      input.dispose();
      unsubscribe();
      automation?.dispose();
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
      <div class="terminal-input-bar">
        <input
          bind:this={commandInput}
          aria-label="Command input"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          placeholder="Enter command..."
          spellcheck="false"
        />
        <button bind:this={sendButton} type="button">Send</button>
      </div>
      <dialog bind:this={batchDialog} aria-label="Multiline command input">
        <form bind:this={batchForm} method="dialog">
          <label>
            Command batch
            <textarea bind:this={batchInput} autocomplete="off" spellcheck="false"></textarea>
          </label>
          <div class="terminal-batch-actions">
            <button type="button" onclick={() => batchDialog?.close()}>Cancel</button>
            <button type="submit">Send batch</button>
          </div>
        </form>
      </dialog>
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

  .terminal-input-bar,
  .terminal-batch-actions {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .terminal-input-bar input,
  dialog textarea {
    flex: 1;
    min-width: 0;
  }

  dialog textarea {
    display: block;
    min-height: 8rem;
    width: 100%;
  }
</style>
