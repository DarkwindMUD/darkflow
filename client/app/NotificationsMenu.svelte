<script lang="ts">
  import { untrack } from "svelte";
  import type { Session } from "../runtime/session.ts";

  let { session, onactivate }: { session: Session; onactivate: (id: number) => boolean } = $props();

  let snapshot = $state(untrack(() => session.notifications.getSnapshot()));
  let open = $state(false);
  let wrap = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();

  $effect(() => session.notifications.subscribe((next) => (snapshot = next)));

  $effect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Node) || !wrap?.contains(event.target)) open = false;
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  });

  function handleEscape(event: KeyboardEvent): void {
    const targetInside = event.target instanceof Node && wrap?.contains(event.target);
    const focusInside = wrap?.contains(document.activeElement);
    if (!open || event.key !== "Escape" || (!targetInside && !focusInside)) return;
    event.preventDefault();
    event.stopPropagation();
    open = false;
    queueMicrotask(() => trigger?.focus());
  }

  function activate(id: number): void {
    if (onactivate(id)) open = false;
  }

  function channelLabel(channel: string): string {
    return channel ? `[${channel}]` : "[Channel]";
  }

  function displayTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }
</script>

<svelte:window onkeydown={handleEscape} />

<span bind:this={wrap} class="toolbar-btn-wrap notification-toolbar-wrap">
  <button
    bind:this={trigger}
    class:active={open}
    class:has-alert={snapshot.unreadCount > 0}
    class="toolbar-icon-btn"
    type="button"
    title="Notifications"
    aria-label="Notifications"
    aria-controls="notifications-menu"
    aria-expanded={open}
    aria-haspopup="dialog"
    onclick={() => (open = !open)}>🔔</button
  >

  {#if snapshot.unreadCount > 0}
    <span class="toolbar-count-badge" aria-label={`${snapshot.unreadCount} unread notifications`}>
      {snapshot.unreadCount > 99 ? "99+" : snapshot.unreadCount}
    </span>
  {/if}

  <div
    id="notifications-menu"
    class:open
    class="notifications-menu"
    role="dialog"
    aria-label="Notifications"
    aria-hidden={!open}
    inert={!open}
  >
    <div class="notifications-header">
      <div class="notifications-title">Notifications</div>
      <button
        class="notifications-clear"
        type="button"
        onclick={() => session.notifications.clear()}
      >
        Clear
      </button>
    </div>
    <div class="notifications-list">
      {#each snapshot.notifications as notification (notification.id)}
        <button
          class:unread={!notification.read}
          class:expired={notification.expired}
          class="notification-row"
          type="button"
          onclick={() => activate(notification.id)}
        >
          <span class="notification-meta">
            <span>{channelLabel(notification.channel)}</span>
            {#if notification.talker}<span>{notification.talker}</span>{/if}
            <span>{displayTime(notification.timestamp)}</span>
          </span>
          <span class="notification-body">{notification.text}</span>
          {#if notification.expired}
            <span class="notification-expired">Terminal line no longer in scrollback.</span>
          {/if}
        </button>
      {:else}
        <div class="notifications-empty">No notifications.</div>
      {/each}
    </div>
  </div>
</span>
