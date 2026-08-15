<script lang="ts">
  import { untrack } from "svelte";
  import type { DarkwindGiphyShow } from "../gmcp/contracts/interactions.ts";
  import type { Session } from "../runtime/session.ts";

  let { session }: { session: Session } = $props();

  let payload = $state<DarkwindGiphyShow | null>(null);
  let open = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let renderToken = 0;
  let lastPayload: DarkwindGiphyShow | null = null;

  function hide(): void {
    renderToken += 1;
    clearTimeout(hideTimer);
    hideTimer = undefined;
    open = false;
    payload = null;
  }

  function show(next: DarkwindGiphyShow): void {
    const token = ++renderToken;
    clearTimeout(hideTimer);
    payload = next;
    open = true;
    hideTimer = setTimeout(
      () => {
        if (token === renderToken) hide();
      },
      Math.max(1_000, next.durationMs ?? 10_000),
    );
  }

  $effect(() => {
    const unsubscribe = session.interactions.subscribe((snapshot) => {
      untrack(() => {
        if (snapshot.giphy === lastPayload) return;
        lastPayload = snapshot.giphy;
        if (snapshot.giphy) show(snapshot.giphy);
        else hide();
        payload = snapshot.giphy;
      });
    });
    return () => {
      unsubscribe();
      lastPayload = null;
      hide();
    };
  });
</script>

{#if payload}
  <aside
    class="giphy-overlay"
    class:open
    aria-label={`${payload.talker || "Someone"} shared a GIF`}
    aria-live="polite"
  >
    <div class="giphy-card">
      <button class="giphy-close" type="button" aria-label="Close GIF" onclick={hide}>×</button>
      <div class="giphy-meta">
        <div class="giphy-channel">{payload.caption || payload.channel || "GIF"}</div>
        <div class="giphy-talker">{payload.talker || "Someone"}</div>
        <div class="giphy-phrase">{payload.phrase ? `“${payload.phrase}”` : ""}</div>
      </div>
      <div class="giphy-image-wrap">
        <img
          class="giphy-image"
          src={payload.gifUrl}
          alt={`${payload.talker || "Someone"} shared a GIF${payload.phrase ? ` for “${payload.phrase}”` : ""}`}
          loading="eager"
          decoding="async"
          onerror={hide}
        />
      </div>
    </div>
  </aside>
{/if}
