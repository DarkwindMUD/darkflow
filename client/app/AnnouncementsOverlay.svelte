<script lang="ts">
  import { untrack } from "svelte";
  import type { DarkwindAnnouncement } from "../gmcp/contracts/interactions.ts";
  import type { Session } from "../runtime/session.ts";
  // @ts-expect-error Legacy-safe Markdown renderer has no declaration file.
  import { renderAnnouncementMarkdown } from "../../public/js/announcement-markdown.js";

  let { open, session, onclose }: { open: boolean; session: Session; onclose: () => void } =
    $props();

  let snapshot = $state(untrack(() => session.interactions.getSnapshot()));
  let filter = $state<"active" | "archived">("active");
  let selectedId = $state<number | null>(null);
  let dialog = $state<HTMLElement>();
  let closeButton = $state<HTMLButtonElement>();
  let wasOpen = false;

  const announcements = $derived(snapshot.announcements);
  const items = $derived(filter === "archived" ? announcements.archived : announcements.active);
  const selected = $derived(items.find((item) => item.id === selectedId) ?? null);

  $effect(() => session.interactions.subscribe((next) => (snapshot = next)));

  $effect(() => {
    if (open && !wasOpen) {
      session.interactions.requestAnnouncements();
      queueMicrotask(() => closeButton?.focus());
    }
    wasOpen = open;
  });

  $effect(() => {
    if (!open) return;
    const visibleItems = items;
    const next = visibleItems.some((item) => item.id === selectedId)
      ? selectedId
      : (visibleItems[0]?.id ?? null);
    if (next !== selectedId) selectedId = next;
  });

  function select(item: DarkwindAnnouncement): void {
    selectedId = item.id;
    if (item.isRead === 0) session.interactions.markAnnouncementRead(item.id);
  }

  function setFilter(next: "active" | "archived"): void {
    filter = next;
    selectedId = null;
  }

  function formatTimestamp(epochSeconds: number): string {
    if (!epochSeconds) return "";
    return new Date(epochSeconds * 1000).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<svelte:window
  onkeydown={(event) => {
    const targetInside = event.target instanceof Node && dialog?.contains(event.target);
    const focusInside = dialog?.contains(document.activeElement);
    if (open && event.key === "Escape" && (targetInside || focusInside)) {
      event.preventDefault();
      onclose();
    }
  }}
/>

{#if open}
  <div
    class="announcements-overlay open"
    role="presentation"
    onpointerdown={(event) => event.target === event.currentTarget && onclose()}
  >
    <div
      bind:this={dialog}
      class="announcements-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcements-title"
    >
      <header class="announcements-header">
        <div class="announcements-title-wrap">
          <div id="announcements-title" class="announcements-title">Announcements</div>
          <div class="announcements-subtitle">
            {announcements.active.length} active, {announcements.archived.length} archived,
            {announcements.unreadCount} unread
          </div>
        </div>

        <div class="announcements-controls">
          <div class="announcements-filter" aria-label="Announcement status">
            <button
              class:active={filter === "active"}
              class="announcements-filter-btn"
              type="button"
              aria-pressed={filter === "active"}
              onclick={() => setFilter("active")}>Active</button
            >
            <button
              class:active={filter === "archived"}
              class="announcements-filter-btn"
              type="button"
              aria-pressed={filter === "archived"}
              onclick={() => setFilter("archived")}>Archived</button
            >
          </div>
          <button
            bind:this={closeButton}
            class="announcements-close"
            type="button"
            aria-label="Close announcements"
            onclick={onclose}>×</button
          >
        </div>
      </header>

      <div class="announcements-body">
        <div class="announcements-list-pane" aria-label={`${filter} announcements`}>
          {#each items as item (item.id)}
            <button
              class:active={item.id === selectedId}
              class="announcement-row"
              type="button"
              aria-current={item.id === selectedId ? "true" : undefined}
              onclick={() => select(item)}
            >
              <span class="announcement-row-header">
                <span class="announcement-row-title">{item.title || "Untitled Announcement"}</span>
                {#if item.isRead === 0}
                  <span class="announcement-unread-dot" aria-label="Unread"></span>
                {/if}
              </span>
              <span class="announcement-row-meta">
                <span class="announcement-row-author">{item.author || "Unknown"}</span>
                <span>{formatTimestamp(item.createdAt)}</span>
              </span>
              <span class="announcement-row-summary">{item.summary}</span>
            </button>
          {:else}
            <div class="announcements-list-empty">No announcements in this view.</div>
          {/each}
        </div>

        <div class="announcements-detail-pane">
          {#if selected}
            <article class="announcements-detail">
              <header class="announcement-detail-header">
                <div class="announcement-detail-title">{selected.title}</div>
                <div class="announcement-detail-meta">
                  <span><strong>By</strong> {selected.author || "Unknown"}</span>
                  <span>{formatTimestamp(selected.createdAt)}</span>
                </div>
              </header>
              <div class="announcement-detail-summary">{selected.summary}</div>
              <div class="announcement-markdown">
                <!-- The shared renderer escapes text and allowlists link protocols. -->
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderAnnouncementMarkdown(selected.markdown)}
              </div>
            </article>
          {:else}
            <div class="announcements-detail-empty">Select an announcement to read it.</div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
