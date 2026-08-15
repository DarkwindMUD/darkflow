<script lang="ts">
  import { untrack } from "svelte";
  import type { DarkwindBroadcastShow } from "../gmcp/contracts/interactions.ts";
  import type { Session } from "../runtime/session.ts";

  let { session }: { session: Session } = $props();

  let payload = $state<DarkwindBroadcastShow | null>(null);
  let open = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let renderToken = 0;
  let lastPayload: DarkwindBroadcastShow | null = null;

  function hide(): void {
    renderToken += 1;
    clearTimeout(hideTimer);
    hideTimer = undefined;
    open = false;
    payload = null;
  }

  function show(next: DarkwindBroadcastShow): void {
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
        if (snapshot.broadcast === lastPayload) return;
        lastPayload = snapshot.broadcast;
        if (snapshot.broadcast) show(snapshot.broadcast);
        else hide();
        payload = snapshot.broadcast;
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
  <aside class="broadcast-overlay" class:open aria-live="assertive">
    <div class="broadcast-card" role="dialog" aria-label={payload.title || "Broadcast"}>
      <button class="broadcast-close" type="button" aria-label="Close broadcast" onclick={hide}
        >×</button
      >
      <div class="broadcast-header">
        <div class="broadcast-title">{payload.title || "Broadcast"}</div>
        <div class="broadcast-sender">{payload.sender || "Darkwind"}</div>
      </div>
      <div class="broadcast-message">{payload.message}</div>
    </div>
  </aside>
{/if}
