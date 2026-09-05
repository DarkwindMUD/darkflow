<script lang="ts">
  import { untrack } from "svelte";
  import type { RoomInfo } from "../gmcp/contracts/room.ts";
  import type { SessionWorldSnapshot } from "../runtime/world.ts";
  import type { Session } from "../runtime/session.ts";

  let { panelId, session }: { panelId: string; session?: Session } = $props();

  const activeSession = untrack(() => session);
  if (!activeSession) throw new Error("Room requires a session");

  const compass = [
    "northwest",
    "north",
    "northeast",
    "west",
    null,
    "east",
    "southwest",
    "south",
    "southeast",
  ] as const;
  const labels: Record<string, string> = {
    northwest: "NW",
    north: "N",
    northeast: "NE",
    west: "W",
    east: "E",
    southwest: "SW",
    south: "S",
    southeast: "SE",
    up: "U",
    down: "D",
  };

  let snapshot = $state<SessionWorldSnapshot>(activeSession.world.getSnapshot());
  const room = $derived(snapshot.room);

  $effect(() => activeSession.world.subscribe((next) => (snapshot = next)));

  function exits(value: RoomInfo | null): Record<string, string | number> {
    return value?.exits && typeof value.exits === "object" ? value.exits : {};
  }

  function exitStates(value: RoomInfo | null): Record<string, string> {
    return value?.exit_states && typeof value.exit_states === "object" ? value.exit_states : {};
  }
</script>

<section class="room-panel" data-panel-id={panelId} data-workspace-owned="true">
  {#if room?.name}
    <div class="room-name">{room.name}</div>
    {#if room.area}<div class="room-area">{room.area}</div>{/if}
    {#if room.environment}<div class="room-environment">{room.environment}</div>{/if}

    <div class="exit-compass" aria-label="Room exits">
      {#each compass as direction, index (index)}
        {#if direction === null}
          <div class="exit-rose-center" aria-hidden="true"><span></span></div>
        {:else if exits(room)[direction] !== undefined && !exitStates(room)[direction]}
          <button
            type="button"
            class:cardinal={direction === "north" ||
              direction === "south" ||
              direction === "east" ||
              direction === "west"}
            aria-label={`Go ${direction}`}
            onclick={() => activeSession.terminal.sendCommand(direction)}
            >{labels[direction]}</button
          >
        {:else}
          <span class="exit-empty" aria-hidden="true"></span>
        {/if}
      {/each}
    </div>

    {#if exits(room).up !== undefined || exits(room).down !== undefined}
      <div class="exit-vertical" aria-label="Vertical room exits">
        {#each ["up", "down"] as direction (direction)}
          {#if exits(room)[direction] !== undefined && !exitStates(room)[direction]}
            <button
              type="button"
              aria-label={`Go ${direction}`}
              onclick={() => activeSession.terminal.sendCommand(direction)}
              >{labels[direction]}</button
            >
          {/if}
        {/each}
      </div>
    {/if}

    {#if snapshot.players.length}
      <div class="room-players">
        Players:
        {#each snapshot.players as player, index (index)}
          {#if index > 0},
          {/if}<span>{player.fullname || player.name}</span>
        {/each}
      </div>
    {/if}
  {:else}
    <p class="placeholder">No room data.</p>
  {/if}
</section>

<style>
  .room-panel {
    box-sizing: border-box;
    min-height: 100%;
    padding: 0.5rem;
    color: var(--df-text, #c9d1d9);
  }

  .room-name {
    margin-bottom: 2px;
    color: var(--df-text-strong, #e6edf3);
    font-weight: 600;
  }

  .room-area,
  .room-environment,
  .room-players,
  .placeholder {
    color: var(--df-muted, #8b949e);
    font-size: calc(11px * var(--pane-font-scale, 1));
  }

  .room-area,
  .room-environment {
    margin-bottom: 6px;
  }

  .exit-compass {
    display: grid;
    grid-template-columns: repeat(3, 34px);
    grid-template-rows: repeat(3, 28px);
    justify-content: center;
    gap: 3px;
    margin: 2px auto 8px;
    padding: 6px 0 4px;
  }

  button,
  .exit-empty {
    box-sizing: border-box;
    width: 34px;
    height: 28px;
  }

  button {
    padding: 0;
    border: 1px solid #3d444d;
    border-radius: 3px;
    background: linear-gradient(180deg, #2a3038 0%, #1c2128 100%);
    color: var(--df-text, #c9d1d9);
    font-family: inherit;
    font-size: calc(11px * var(--pane-font-scale, 1));
    font-weight: 700;
    line-height: 26px;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--df-accent-blue, #58a6ff);
    color: var(--df-text-strong, #e6edf3);
  }

  button:focus-visible {
    outline: 2px solid var(--df-accent-blue, #58a6ff);
    outline-offset: 1px;
  }

  button.cardinal {
    border-color: color-mix(in srgb, var(--df-accent-blue, #58a6ff) 55%, #3d444d);
  }

  .exit-rose-center {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    margin: 0 auto;
    border: 1px solid var(--df-accent-blue, #58a6ff);
    border-radius: 50%;
    opacity: 0.72;
  }

  .exit-rose-center span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--df-text-strong, #e6edf3);
    box-shadow: 0 0 7px rgb(88 166 255 / 55%);
  }

  .exit-vertical {
    display: flex;
    justify-content: center;
    gap: 4px;
    margin: 0 auto 6px;
  }

  .exit-vertical button {
    width: 42px;
  }

  .room-players {
    padding-top: 4px;
    border-top: 1px solid var(--df-btn-secondary, rgb(255 255 255 / 6%));
  }

  .room-players span {
    color: var(--df-text, #c9d1d9);
  }

  .placeholder {
    margin: 0;
  }
</style>
