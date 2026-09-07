<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { SessionChannelMessage } from "../runtime/notifications.ts";
  import type { Session } from "../runtime/session.ts";
  // @ts-expect-error Retained ANSI parser has no TypeScript declaration.
  import { parseAnsiText } from "../../public/js/ansi.js";

  let { panelId, session }: { panelId: string; session?: Session } = $props();

  const activeSession = untrack(() => session);
  if (!activeSession) throw new Error("Chat requires a session");

  let snapshot = $state(activeSession.notifications.getSnapshot());
  let log = $state<HTMLElement>();

  $effect(() => activeSession.notifications.subscribe((next) => (snapshot = next)));

  $effect.pre(() => {
    const lastMessageId = snapshot.channelMessages.at(-1)?.id;
    const node = log;
    if (!lastMessageId || !node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 32;
    void tick().then(() => {
      if (atBottom && node === log) node.scrollTop = node.scrollHeight;
    });
  });

  function channelColor(channel: string): string {
    let hash = 0;
    for (const character of channel) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return `hsl(${Math.abs(hash) % 360} 60% 65%)`;
  }

  function talkerName(talker: string): string {
    return talker ? talker[0]!.toUpperCase() + talker.slice(1) : "";
  }

  function messageText(message: SessionChannelMessage): string {
    const text = parseAnsiText(message.text)
      .map((fragment: { text: string }) => fragment.text)
      .join("");
    if (!message.talker) return text;
    const talker = message.talker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(
      new RegExp(`^(?:\\[\\S+\\]\\s+)?(?:\\(\\w+\\)\\s+)?${talker}(?:\\s+\\w+)?:\\s*`, "i"),
      "",
    );
  }
</script>

<section class="chat-panel" data-panel-id={panelId} data-workspace-owned="true">
  {#if snapshot.chatChannels.length || snapshot.activeChannelNames.length || snapshot.onlinePlayerCount}
    <div class="chat-meta" aria-label="Chat channels">
      {#each snapshot.chatChannels.slice(0, 12) as channel, index (index)}
        <span class="chat-chip">{channel.label}</span>
      {/each}
      {#each snapshot.activeChannelNames as channel (channel)}
        <span class="chat-chip active">{channel}</span>
      {/each}
      {#if snapshot.onlinePlayerCount}
        <span class="chat-chip">{snapshot.onlinePlayerCount} online</span>
      {/if}
    </div>
  {/if}

  <div bind:this={log} class="chat-log" role="log" aria-label="Chat messages" aria-live="polite">
    {#each snapshot.channelMessages as message (message.id)}
      <div class="chat-entry">
        <strong style:color={channelColor(message.channel)}>[{message.channel}]</strong>
        {#if message.talker}<span class="talker"> {talkerName(message.talker)}:</span>{/if}
        <span> {messageText(message)}</span>
      </div>
    {:else}
      <p class="placeholder">No messages.</p>
    {/each}
  </div>
</section>

<style>
  .chat-panel {
    display: flex;
    box-sizing: border-box;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0.5rem;
    overflow: hidden;
    color: var(--df-text, #c9d1d9);
  }

  .chat-meta {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .chat-chip {
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--df-border, #30363d);
    border-radius: 0.25rem;
    color: var(--df-muted, #8b949e);
    font-size: calc(10px * var(--pane-font-scale, 1));
  }

  .chat-chip.active {
    color: var(--df-ok, #3fb950);
  }

  .chat-log {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding-top: 0.375rem;
    overflow: auto;
  }

  .chat-entry,
  .placeholder {
    margin: 0;
    padding: 1px 0;
    overflow-wrap: anywhere;
    font-size: calc(11px * var(--pane-font-scale, 1));
  }

  .talker,
  .placeholder {
    color: var(--df-muted, #8b949e);
  }
</style>
