<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type { SessionRoomImageSnapshot, SessionWorldSnapshot } from "../runtime/world.ts";
  import type { Session } from "../runtime/session.ts";
  import type { PanelState } from "./workspace.ts";

  let {
    panelId,
    state: _state,
    session,
  }: { panelId: string; state: Readable<PanelState>; session?: Session } = $props();

  const resolvedSession = untrack(() => session);
  if (!resolvedSession) throw new Error("Room Image requires a session");
  const activeSession: Session = resolvedSession;

  let snapshot = $state<SessionWorldSnapshot>(activeSession.world.getSnapshot());
  let displayed = $state<SessionRoomImageSnapshot | null>(null);
  let loading = $state(false);
  let currentRoomId = "";
  let currentGeneration = -1;
  let attemptedImageKey = "";
  let probe: HTMLImageElement | undefined;
  let zoomDialog = $state<HTMLDialogElement>();
  let zoomCloseButton = $state<HTMLButtonElement>();
  let zoomTrigger: HTMLElement | undefined;

  const caption = $derived(displayed?.name?.trim() || snapshot.room?.name?.trim() || "Room");

  function roomId(next: SessionWorldSnapshot): string {
    const id = next.room?.num ?? next.room?.id;
    return id === undefined || id === null ? "" : String(id);
  }

  function cancelProbe(): void {
    if (!probe) return;
    probe.onload = null;
    probe.onerror = null;
    probe.removeAttribute("src");
    probe = undefined;
  }

  function restoreZoomFocus(): void {
    const trigger = zoomTrigger;
    zoomTrigger = undefined;
    queueMicrotask(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }

  function closeZoom(): void {
    if (zoomDialog?.open) zoomDialog.close();
  }

  function resetRoom(nextRoomId: string, generation: number): void {
    cancelProbe();
    closeZoom();
    displayed = null;
    loading = false;
    attemptedImageKey = "";
    currentRoomId = nextRoomId;
    currentGeneration = generation;
  }

  function acceptProbe(candidate: SessionRoomImageSnapshot, image: HTMLImageElement): boolean {
    return (
      probe === image &&
      snapshot.connected &&
      snapshot.roomGeneration === candidate.generation &&
      roomId(snapshot) === candidate.roomId
    );
  }

  function preload(candidate: SessionRoomImageSnapshot): void {
    cancelProbe();
    loading = true;
    const image = new Image();
    probe = image;
    image.onload = () => {
      if (!acceptProbe(candidate, image)) return;
      image.onload = null;
      image.onerror = null;
      probe = undefined;
      displayed = candidate;
      loading = false;
    };
    image.onerror = () => {
      if (!acceptProbe(candidate, image)) return;
      image.onload = null;
      image.onerror = null;
      probe = undefined;
      loading = false;
    };
    image.src = candidate.url;
  }

  function sync(next: SessionWorldSnapshot): void {
    snapshot = next;
    const nextRoomId = roomId(next);
    if (
      !next.connected ||
      !nextRoomId ||
      next.roomGeneration !== currentGeneration ||
      nextRoomId !== currentRoomId
    ) {
      resetRoom(nextRoomId, next.roomGeneration);
    }

    const candidate = next.roomImage;
    if (
      !next.connected ||
      !candidate ||
      candidate.generation !== next.roomGeneration ||
      candidate.roomId !== nextRoomId
    ) {
      return;
    }

    const imageKey = `${candidate.generation}:${candidate.roomId}:${candidate.url}`;
    if (imageKey === attemptedImageKey) return;
    attemptedImageKey = imageKey;
    if (
      displayed?.generation === candidate.generation &&
      displayed.roomId === candidate.roomId &&
      displayed.url === candidate.url
    ) {
      cancelProbe();
      displayed = candidate;
      loading = false;
      return;
    }
    preload(candidate);
  }

  function openZoom(event: MouseEvent): void {
    if (!displayed || !zoomDialog) return;
    zoomTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    zoomDialog.showModal();
    queueMicrotask(() => zoomCloseButton?.focus({ preventScroll: true }));
  }

  function handleBackdrop(event: MouseEvent): void {
    if (event.target === zoomDialog) closeZoom();
  }

  $effect(() => activeSession.world.subscribe(sync));

  onDestroy(() => {
    cancelProbe();
    closeZoom();
    restoreZoomFocus();
  });
</script>

<section
  class="room-image-panel"
  data-panel-id={panelId}
  data-workspace-owned="true"
  aria-label="Room image"
>
  <div class="panel-body" aria-busy={loading}>
    <button
      class="room-image-refresh"
      type="button"
      disabled={!snapshot.connected}
      aria-label="Refresh room image"
      title="Refresh room image"
      onclick={() => activeSession.world.refreshMedia()}>Refresh</button
    >
    {#if displayed}
      <figure class="room-image-wrap">
        <button
          class="room-image-zoom-trigger"
          type="button"
          aria-label={`View larger image of ${caption}`}
          onclick={openZoom}
        >
          <img
            class:room-image-loading={loading}
            class="room-image-img"
            src={displayed.url}
            alt={caption}
            draggable="false"
          />
        </button>
        {#if loading}<span class="room-image-loading-status" role="status">Loading…</span>{/if}
        <figcaption class="room-image-caption">{caption}</figcaption>
      </figure>
    {:else}
      <div class="room-image-placeholder" role="status">Generating room image...</div>
    {/if}
  </div>
</section>

<dialog
  bind:this={zoomDialog}
  class="dw-modal room-image-modal"
  aria-label={caption}
  onclick={handleBackdrop}
  oncancel={(event) => {
    event.preventDefault();
    closeZoom();
  }}
  onclose={restoreZoomFocus}
>
  <div class="dw-modal-header">
    <span class="dw-modal-title">{caption}</span>
    <button
      bind:this={zoomCloseButton}
      type="button"
      class="dw-modal-close"
      aria-label="Close room image"
      onclick={closeZoom}>✕</button
    >
  </div>
  <div class="dw-modal-body room-image-modal-body">
    {#if displayed}
      <img class="room-image-modal-img" src={displayed.url} alt={caption} draggable="false" />
    {/if}
  </div>
</dialog>

<style>
  .room-image-panel,
  .panel-body,
  .room-image-wrap,
  .room-image-zoom-trigger {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
  }

  .room-image-panel {
    position: relative;
  }

  .panel-body,
  .room-image-wrap {
    position: relative;
    margin: 0;
  }

  .room-image-zoom-trigger {
    display: block;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
  }

  .room-image-zoom-trigger:focus-visible {
    outline: 2px solid var(--df-accent-blue);
    outline-offset: -2px;
  }

  .room-image-caption,
  .room-image-loading-status,
  .room-image-refresh {
    position: absolute;
    z-index: 1;
  }

  .room-image-caption {
    right: 0;
    bottom: 0;
    left: 0;
    padding: 0.35rem 0.5rem;
    color: #fff;
    font-size: 0.75rem;
    text-align: center;
    text-shadow: 0 1px 2px #000;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
    pointer-events: none;
  }

  .room-image-loading-status {
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.25rem 0.4rem;
    border-radius: 0.25rem;
    color: #fff;
    font-size: 0.75rem;
    background: rgba(0, 0, 0, 0.7);
  }

  .room-image-refresh {
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--df-border);
    border-radius: 0.25rem;
    color: var(--df-text);
    background: rgba(5, 7, 10, 0.8);
  }

  dialog.room-image-modal {
    margin: auto;
    padding: 0;
  }

  dialog.room-image-modal:not([open]) {
    display: none;
  }

  dialog.room-image-modal::backdrop {
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(4px);
  }
</style>
