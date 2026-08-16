<script lang="ts">
  import { untrack } from "svelte";
  import type { Session } from "../runtime/session.ts";

  let { session }: { session: Session } = $props();

  const categories = [
    { id: "combat", icon: "⚔️", label: "Combat" },
    { id: "spell", icon: "✨", label: "Spell" },
    { id: "skill", icon: "💪", label: "Skill" },
    { id: "potion", icon: "🧪", label: "Potion" },
    { id: "quest", icon: "📜", label: "Quest" },
    { id: "celebration", icon: "🎉", label: "Celebration" },
    { id: "discussion", icon: "💬", label: "Discuss" },
    { id: "alert", icon: "⚠️", label: "Alert" },
    { id: "ambient", icon: "🌿", label: "Ambient" },
    { id: "fishing", icon: "🎣", label: "Fishing" },
    { id: "ui", icon: "🖱️", label: "Interface" },
  ] as const;

  let snapshot = $state(untrack(() => session.audio.getSnapshot()));
  let expanded = $state(false);
  let host = $state<HTMLElement>();
  let indicator = $state<HTMLButtonElement>();
  let unlockRequest = 0;
  let unlockPending = false;

  const volumePercent = $derived(Math.round(snapshot.volume * 100));
  const expandedId = $derived(`sound-widget-expanded-${session.sessionId}`);
  const activity = $derived(categories.find(({ id }) => id === snapshot.currentCategory));
  const indicatorLabel = $derived(
    !snapshot.enabled
      ? "Muted"
      : snapshot.volume <= 0
        ? "Volume 0%"
        : !snapshot.audioUnlocked && snapshot.pendingCount > 0
          ? "Click to enable"
          : (activity?.label ?? "Ready"),
  );
  const indicatorIcon = $derived(
    !snapshot.enabled || snapshot.volume <= 0 ? "🔇" : (activity?.icon ?? "🔊"),
  );

  $effect(() => {
    let active = true;
    const unsubscribe = session.audio.subscribe((next) => {
      if (!active) return;
      if (!next.supported) {
        unlockRequest += 1;
        unlockPending = false;
        expanded = false;
      }
      snapshot = next;
    });
    return () => {
      active = false;
      unlockRequest += 1;
      unlockPending = false;
      unsubscribe();
    };
  });

  $effect(() => {
    const element = host;
    if (!element) return;
    element.addEventListener("keydown", handleEscape);
    return () => element.removeEventListener("keydown", handleEscape);
  });

  async function toggleExpanded(): Promise<void> {
    const request = ++unlockRequest;
    unlockPending = true;
    await session.audio.unlock();
    if (request !== unlockRequest) return;
    unlockPending = false;
    if (snapshot.supported) expanded = !expanded;
  }

  function handleEscape(event: KeyboardEvent): void {
    if ((!expanded && !unlockPending) || event.key !== "Escape") return;
    const targetInside = event.target instanceof Node && host?.contains(event.target);
    const focusInside = host?.contains(document.activeElement);
    if (!targetInside && !focusInside) return;
    event.preventDefault();
    event.stopPropagation();
    unlockRequest += 1;
    unlockPending = false;
    expanded = false;
    indicator?.focus();
  }

  function handleOutsidePointer(event: PointerEvent): void {
    if (event.target instanceof Node && host?.contains(event.target)) return;
    unlockRequest += 1;
    unlockPending = false;
    expanded = false;
  }
</script>

<svelte:window onpointerdown={handleOutsidePointer} />

<span
  bind:this={host}
  id="audio-widget-root"
  aria-live="polite"
  hidden={!snapshot.supported}
  style:display={snapshot.supported ? undefined : "none"}
>
  <div
    class="sound-widget"
    class:active={snapshot.activityKind !== null}
    class:locked={snapshot.enabled && !snapshot.audioUnlocked}
    class:muted={!snapshot.enabled}
    class:expanded
    hidden={!snapshot.supported}
  >
    <div class="sound-widget-compact">
      <button
        bind:this={indicator}
        class="sound-widget-indicator"
        type="button"
        aria-expanded={expanded}
        aria-controls={expandedId}
        title="Audio controls"
        onclick={toggleExpanded}
      >
        <span class="sound-widget-indicator-icon">{indicatorIcon}</span>
        <span class="sound-widget-indicator-label">{indicatorLabel}</span>
      </button>
      <button
        class="sound-widget-mute"
        type="button"
        title="Toggle audio"
        aria-label="Toggle audio"
        onclick={() => session.audio.setEnabled(!snapshot.enabled)}
      >
        <span class="sound-widget-mute-icon">{snapshot.enabled ? "🔊" : "🔇"}</span>
      </button>
    </div>
    <div
      id={expandedId}
      class="sound-widget-expanded"
      role="dialog"
      aria-label="Audio settings"
      aria-hidden={!expanded}
      inert={!expanded}
      hidden={!expanded}
    >
      <div class="sound-widget-volume">
        <label for={`sound-widget-volume-${session.sessionId}`}>Volume</label>
        <input
          id={`sound-widget-volume-${session.sessionId}`}
          class="sound-widget-volume-slider"
          type="range"
          min="0"
          max="100"
          value={volumePercent}
          data-1p-ignore="true"
          data-op-ignore="true"
          oninput={(event) => session.audio.setVolume(Number(event.currentTarget.value) / 100)}
        />
        <span class="sound-widget-volume-value">{volumePercent}%</span>
      </div>
      <div class="sound-widget-categories">
        {#each categories as category (category.id)}
          <button
            class="sound-widget-category"
            class:enabled={snapshot.categoryEnabled[category.id]}
            class:disabled={!snapshot.categoryEnabled[category.id]}
            type="button"
            title={category.label}
            aria-pressed={snapshot.categoryEnabled[category.id]}
            onclick={() =>
              session.audio.setCategoryEnabled(category.id, !snapshot.categoryEnabled[category.id])}
          >
            <span class="sound-widget-category-icon">{category.icon}</span>
            <span class="sound-widget-category-label">{category.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</span>
