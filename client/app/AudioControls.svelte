<script lang="ts">
  import Dessert from "@lucide/svelte/icons/dessert";
  import Fish from "@lucide/svelte/icons/fish";
  import FlaskRound from "@lucide/svelte/icons/flask-round";
  import HandFist from "@lucide/svelte/icons/hand-fist";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import MonitorCheck from "@lucide/svelte/icons/monitor-check";
  import PartyPopper from "@lucide/svelte/icons/party-popper";
  import Piano from "@lucide/svelte/icons/piano";
  import Scroll from "@lucide/svelte/icons/scroll";
  import Swords from "@lucide/svelte/icons/swords";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Volume from "@lucide/svelte/icons/volume";
  import Volume1 from "@lucide/svelte/icons/volume-1";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import Wand from "@lucide/svelte/icons/wand";
  import { untrack } from "svelte";
  import type { Session } from "../runtime/session.ts";

  let { session }: { session: Session } = $props();

  const categories = [
    { id: "combat", icon: Swords, label: "Combat" },
    { id: "spell", icon: Wand, label: "Spell" },
    { id: "skill", icon: HandFist, label: "Skill" },
    { id: "potion", icon: FlaskRound, label: "Potion" },
    { id: "quest", icon: Scroll, label: "Quest" },
    { id: "celebration", icon: PartyPopper, label: "Celebration" },
    { id: "discussion", icon: MessagesSquare, label: "Discuss" },
    { id: "alert", icon: TriangleAlert, label: "Alert" },
    { id: "ambient", icon: Dessert, label: "Ambient" },
    { id: "fishing", icon: Fish, label: "Fishing" },
    { id: "ui", icon: MonitorCheck, label: "Interface" },
    { id: "music", icon: Piano, label: "Music" },
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
  const VolumeIcon = $derived(
    !snapshot.enabled
      ? VolumeX
      : snapshot.volume <= 0.1
        ? Volume
        : snapshot.volume <= 0.7
          ? Volume1
          : Volume2,
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

<span bind:this={host} id="audio-widget-root" class="phase2-audio-widget" aria-live="polite">
  <div
    class="sound-widget"
    class:active={snapshot.activityKind !== null}
    class:locked={snapshot.enabled && !snapshot.audioUnlocked}
    class:expanded
  >
    <div class="sound-widget-compact">
      <button
        bind:this={indicator}
        class="sound-widget-indicator"
        type="button"
        disabled={!snapshot.supported || !snapshot.loggedIn}
        aria-expanded={expanded}
        aria-controls={expandedId}
        aria-label={`Audio controls: ${indicatorLabel}`}
        title="Audio controls"
        onclick={toggleExpanded}
      >
        <span class="sound-widget-indicator-icon"><VolumeIcon size={18} /></span>
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
        <button
          class="sound-widget-mute"
          type="button"
          title={snapshot.enabled ? "Mute audio" : "Unmute audio"}
          aria-label={snapshot.enabled ? "Mute audio" : "Unmute audio"}
          onclick={() => session.audio.setEnabled(!snapshot.enabled)}
        >
          <span class="sound-widget-mute-icon"><VolumeIcon size={18} /></span>
        </button>
        <input
          id={`sound-widget-volume-${session.sessionId}`}
          aria-label="Volume"
          class="sound-widget-volume-slider"
          class:muted={!snapshot.enabled}
          type="range"
          min="0"
          max="100"
          value={volumePercent}
          data-1p-ignore="true"
          data-op-ignore="true"
          oninput={(event) => session.audio.setVolume(Number(event.currentTarget.value) / 100)}
        />
      </div>
      <div class="sound-widget-categories">
        {#each categories as category (category.id)}
          {@const CategoryIcon = category.icon}
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
            <span class="sound-widget-category-icon"><CategoryIcon size={16} /></span>
            <span class="sound-widget-category-label">{category.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</span>

<style>
  #audio-widget-root {
    width: 26px;
  }

  .sound-widget {
    border: 0;
    background: transparent;
  }

  .sound-widget-indicator {
    flex: none;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
  }

  .sound-widget-indicator:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .sound-widget-volume {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .sound-widget-volume-slider.muted {
    accent-color: var(--df-muted, #8b949e);
  }
</style>
