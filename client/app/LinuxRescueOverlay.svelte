<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { DarkwindLinuxRescueOpen } from "../gmcp/contracts/interactions.ts";
  import type { Session } from "../runtime/session.ts";
  // @ts-expect-error Legacy rescue core has no declaration file.
  import * as linuxRescueCore from "../../public/js/linux-rescue-core.mjs";

  const {
    createLinuxRescueState,
    getLinuxRescuePrompt,
    runLinuxRescueCommand,
    shouldRequestLinuxRescueFullscreen,
  } = linuxRescueCore;

  let { session }: { session: Session } = $props();

  let payload = $state<DarkwindLinuxRescueOpen | null>(null);
  let open = $state(false);
  let rescueState = $state(createLinuxRescueState());
  let lines = $state<string[]>([]);
  let prompt = $state("");
  let command = $state("");
  let historyIndex = $state(0);
  let overlay = $state<HTMLElement>();
  let stream = $state<HTMLElement>();
  let input = $state<HTMLInputElement>();
  let previousFocus: HTMLElement | null = null;
  let fullscreenRequested = false;
  let openToken = 0;
  let lastPayload: DarkwindLinuxRescueOpen | null = null;

  async function scrollToEnd(): Promise<void> {
    await tick();
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function close(): void {
    openToken += 1;
    open = false;
    command = "";
    if (fullscreenRequested && document.fullscreenElement === overlay) {
      void document.exitFullscreen().catch(() => {});
    }
    fullscreenRequested = false;
    const target = previousFocus?.isConnected ? previousFocus : null;
    previousFocus = null;
    queueMicrotask(() => target?.focus());
  }

  async function requestFullscreen(token: number): Promise<void> {
    if (!overlay?.requestFullscreen) return;
    try {
      await overlay.requestFullscreen();
      if (token !== openToken || !open) {
        if (document.fullscreenElement === overlay) void document.exitFullscreen().catch(() => {});
        return;
      }
      fullscreenRequested = true;
    } catch {
      fullscreenRequested = false;
    }
  }

  async function show(next: DarkwindLinuxRescueOpen): Promise<void> {
    const token = ++openToken;
    const wantsFullscreen = shouldRequestLinuxRescueFullscreen(next);
    if (!open)
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rescueState = createLinuxRescueState();
    lines = [
      "Ubuntu 22.04.4 LTS workstation tty1",
      "Last login: Fri Jun 12 09:41:28 from vpn.internal",
      'Type "help" for available commands. Type "exit" to return.',
      "",
    ];
    prompt = getLinuxRescuePrompt(rescueState);
    command = "";
    historyIndex = 0;
    open = true;
    await tick();
    input?.focus();
    void scrollToEnd();
    if (document.fullscreenElement === overlay) {
      fullscreenRequested = wantsFullscreen;
      if (!wantsFullscreen) void document.exitFullscreen().catch(() => {});
    } else {
      fullscreenRequested = false;
      if (wantsFullscreen) void requestFullscreen(token);
    }
  }

  function submit(): void {
    const raw = command;
    lines.push(`${getLinuxRescuePrompt(rescueState)} ${raw}`);
    const result = runLinuxRescueCommand(rescueState, raw);
    if (result.clear) lines = [];
    if (Array.isArray(result.output)) lines.push(...result.output);
    command = "";
    historyIndex = rescueState.history.length;
    prompt = getLinuxRescuePrompt(rescueState);
    void scrollToEnd();
    if (result.exit) close();
  }

  function handleInputKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" || (event.ctrlKey && event.key.toLowerCase() === "d")) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!rescueState.history.length) return;
      historyIndex = Math.max(0, historyIndex - 1);
      command = rescueState.history[historyIndex] || "";
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!rescueState.history.length) return;
      historyIndex = Math.min(rescueState.history.length, historyIndex + 1);
      command = rescueState.history[historyIndex] || "";
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  function handleDocumentKeydown(event: KeyboardEvent): void {
    if (!open || event.target === input) return;
    if (event.key === "Escape" || (event.ctrlKey && event.key.toLowerCase() === "d")) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    input?.focus();
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      command += event.key;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  $effect(() => {
    const unsubscribe = session.interactions.subscribe((snapshot) => {
      untrack(() => {
        if (snapshot.linuxRescue === lastPayload) return;
        lastPayload = snapshot.linuxRescue;
        payload = snapshot.linuxRescue;
        if (payload) void show(payload);
        else if (open) close();
      });
    });
    return () => {
      unsubscribe();
      lastPayload = null;
    };
  });

  $effect(() => {
    document.addEventListener("keydown", handleDocumentKeydown, true);
    return () => document.removeEventListener("keydown", handleDocumentKeydown, true);
  });

  $effect(() => close);
</script>

{#if payload}
  <div
    bind:this={overlay}
    class="linux-rescue-overlay"
    class:open
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="linux-rescue-title"
    onmousedown={() => input?.focus()}
  >
    <div class="linux-rescue-terminal">
      <div id="linux-rescue-title" class="linux-rescue-title">
        tty1 - secure maintenance session
      </div>
      <div bind:this={stream} class="linux-rescue-stream">
        <div class="linux-rescue-output">
          {#each lines as line, index (`${index}:${line}`)}
            <div class="linux-rescue-line">{line}</div>
          {/each}
        </div>
        <label class="linux-rescue-input-row">
          <span class="linux-rescue-prompt">{prompt} </span>
          <input
            bind:this={input}
            bind:value={command}
            class="linux-rescue-input"
            type="text"
            aria-label="Linux rescue command"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            onkeydown={handleInputKeydown}
          />
        </label>
      </div>
    </div>
  </div>
{/if}
