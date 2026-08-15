<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { Session } from "../runtime/session.ts";
  import type { DarkwindSnoopAppend } from "../gmcp/contracts/interactions.ts";
  // @ts-expect-error Legacy-safe ANSI renderer has no declaration file.
  import { parseAnsiText, styleToElement } from "../../public/js/ansi.js";

  let { session }: { session: Session } = $props();

  let snapshot = $state(untrack(() => session.interactions.getSnapshot()));
  let dialog = $state<HTMLElement>();
  let stream = $state<HTMLElement>();
  let targetInput = $state<HTMLInputElement>();
  let selfInput = $state<HTMLInputElement>();

  const snoop = $derived(snapshot.snoop);

  $effect(() => session.interactions.subscribe((next) => (snapshot = next)));

  $effect(() => {
    const openKey = snoop ? `${snoop.id}:${snoop.startedAt}` : "";
    if (openKey) queueMicrotask(() => targetInput?.focus());
  });

  $effect.pre(() => {
    const entries = snoop?.entries;
    const node = stream;
    if (!entries || !node) return;
    const lastEntry = entries.at(-1);
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
    void lastEntry;
    void tick().then(() => {
      if (atBottom && node === stream) node.scrollTop = node.scrollHeight;
    });
  });

  function renderAnsi(node: HTMLElement, text: string) {
    const render = (value: string): void => {
      node.replaceChildren();
      for (const fragment of parseAnsiText(value)) {
        const child = styleToElement(fragment.text, fragment.style);
        if (child) node.appendChild(child);
      }
    };
    render(text);
    return { update: render };
  }

  function submitCommand(
    event: SubmitEvent,
    mode: "target" | "self",
    input: HTMLInputElement | undefined,
  ): void {
    event.preventDefault();
    if (!snoop || !input || !session.interactions.sendSnoopCommand(snoop.id, mode, input.value))
      return;
    input.value = "";
  }

  function close(): void {
    if (snoop) session.interactions.closeSnoop(snoop.id);
  }

  function prefix(entry: DarkwindSnoopAppend): string {
    if (entry.type === "input") return "> ";
    if (entry.type === "command") return "$ ";
    return "";
  }
</script>

<svelte:window
  onkeydown={(event) => {
    const targetInside = event.target instanceof Node && dialog?.contains(event.target);
    const focusInside = dialog?.contains(document.activeElement);
    if (snoop && event.key === "Escape" && (targetInside || focusInside)) {
      event.preventDefault();
      close();
    }
  }}
/>

{#if snoop}
  <div
    class="dw-modal-overlay dw-snoop-overlay"
    role="presentation"
    onpointerdown={(event) => event.target === event.currentTarget && close()}
  >
    <div
      bind:this={dialog}
      class="dw-modal dw-snoop-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="snoop-title"
    >
      <header class="dw-snoop-header">
        <div class="dw-snoop-heading">
          <div id="snoop-title" class="dw-snoop-title">Snooping: {snoop.target}</div>
          <div class="dw-snoop-subtitle">Observing player activity</div>
        </div>
        <button
          class="dw-snoop-icon-button"
          type="button"
          aria-label="Close snoop window"
          title="Close snoop window"
          onclick={close}>×</button
        >
      </header>

      <div bind:this={stream} class="dw-snoop-stream" aria-live="polite" aria-label="Snoop output">
        <div class="dw-snoop-line dw-snoop-line-status">Connected to {snoop.target}.</div>
        {#each snoop.entries as entry (entry)}
          {#if entry.type === "output"}
            <span use:renderAnsi={entry.text}></span>
          {:else}
            <div class={`dw-snoop-line dw-snoop-line-${entry.type}`}>
              {#if prefix(entry)}<span class="dw-snoop-prefix">{prefix(entry)}</span
                >{/if}{entry.text}
            </div>
          {/if}
        {/each}
      </div>

      <div class="dw-snoop-controls">
        <form
          class="dw-snoop-command-row"
          onsubmit={(event) => submitCommand(event, "target", targetInput)}
        >
          <input
            bind:this={targetInput}
            class="dw-snoop-command-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            aria-label={`Execute command as ${snoop.target}`}
            placeholder={`Execute command as ${snoop.target}...`}
          />
          <button class="dw-snoop-command-button" type="submit">Execute</button>
        </form>

        <form
          class="dw-snoop-command-row"
          onsubmit={(event) => submitCommand(event, "self", selfInput)}
        >
          <input
            bind:this={selfInput}
            class="dw-snoop-command-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            aria-label="Execute command as yourself"
            placeholder="Execute command as yourself..."
          />
          <button class="dw-snoop-command-button" type="submit">Execute</button>
        </form>
      </div>

      <footer class="dw-snoop-footer">
        <button
          class="dw-snoop-stop"
          type="button"
          onclick={() => session.interactions.stopSnoop(snoop.id)}>Stop Snooping</button
        >
      </footer>
    </div>
  </div>
{/if}
