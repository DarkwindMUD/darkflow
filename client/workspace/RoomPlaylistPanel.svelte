<script module lang="ts">
  interface YouTubePlayer {
    cueVideoById(options: { videoId: string; startSeconds: number }): void;
    destroy?(): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    getVideoData(): { title?: string };
    pauseVideo(): void;
    playVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
    stopVideo(): void;
  }

  interface YouTubeApi {
    Player: new (
      hostId: string,
      options: {
        width: string;
        height: string;
        playerVars: Record<string, string | number>;
        events: {
          onReady(event: { target: YouTubePlayer }): void;
          onStateChange(event: { data: number }): void;
          onError(event: { data: number }): void;
          onAutoplayBlocked(): void;
        };
      },
    ) => YouTubePlayer;
    PlayerState: { PLAYING: number; ENDED: number };
  }

  type YouTubeWindow = Window & {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  };

  let youtubeApiPromise: Promise<YouTubeApi> | null = null;

  function loadYouTubeApi(): Promise<YouTubeApi> {
    const target = window as YouTubeWindow;
    if (target.YT && typeof target.YT.Player === "function") return Promise.resolve(target.YT);
    if (youtubeApiPromise) return youtubeApiPromise;

    const pending = new Promise<YouTubeApi>((resolve, reject) => {
      const previousReady = target.onYouTubeIframeAPIReady;
      let script = document.querySelector<HTMLScriptElement>("script[data-darkflow-youtube-api]");

      const restoreReady = (): void => {
        if (target.onYouTubeIframeAPIReady === ready) {
          if (previousReady) target.onYouTubeIframeAPIReady = previousReady;
          else delete target.onYouTubeIframeAPIReady;
        }
      };
      const fail = (message: string): void => {
        restoreReady();
        script?.remove();
        reject(new Error(message));
      };
      const ready = (): void => {
        previousReady?.();
        restoreReady();
        if (target.YT && typeof target.YT.Player === "function") resolve(target.YT);
        else fail("YouTube player API did not initialize");
      };

      target.onYouTubeIframeAPIReady = ready;
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.dataset.darkflowYoutubeApi = "1";
        document.head.appendChild(script);
      }
      script.onerror = () => fail("Unable to load the YouTube player API");
    });

    youtubeApiPromise = pending.catch((error: unknown) => {
      youtubeApiPromise = null;
      throw error;
    });
    return youtubeApiPromise;
  }
</script>

<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type { RoomInfo } from "../gmcp/contracts/room.ts";
  import type { Session } from "../runtime/session.ts";
  import type { SessionPlaylistSnapshot, SessionWorldSnapshot } from "../runtime/world.ts";
  import type { PanelState } from "./workspace.ts";
  // @ts-expect-error Retained playlist math core is JavaScript without a declaration file.
  import * as playlistCore from "../../public/js/room-playlist-core.mjs";

  const { clamp, expectedPlaybackPosition, shouldCorrectDrift } = playlistCore;

  const SETTINGS_KEY = "darkwind-room-playlist-settings";
  const DRIFT_INTERVAL_MS = 5_000;

  let { panelId, session }: { panelId: string; state: Readable<PanelState>; session?: Session } =
    $props();

  const resolvedSession = untrack(() => session);
  if (!resolvedSession) throw new Error("Room Playlist requires a session");
  const activeSession: Session = resolvedSession;

  function readSettings(): { autoJoin: boolean; volume: number } {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as Record<
        string,
        unknown
      >;
      return {
        autoJoin: Boolean(saved.autoJoin),
        volume: clamp(saved.volume === undefined ? 70 : saved.volume, 0, 100),
      };
    } catch {
      return { autoJoin: false, volume: 70 };
    }
  }

  const settings = readSettings();
  let snapshot = $state<SessionWorldSnapshot>(activeSession.world.getSnapshot());
  let autoJoin = $state(settings.autoJoin);
  let volume = $state(settings.volume);
  let listening = $state(false);
  let statusMessage = $state("");
  let clockTick = $state(0);
  let addUrl = $state("");
  let playerHostGeneration = $state(0);

  const playlist = $derived(snapshot.playlist);
  const enabledPlaylist = $derived(playlist.enabled ? playlist : null);
  const current = $derived(enabledPlaylist?.playback.current ?? null);
  const moderator = $derived(enabledPlaylist?.permissions.moderate ?? false);
  const roomMismatch = $derived.by(() => {
    const currentRoomId = roomId(snapshot.room);
    return Boolean(
      enabledPlaylist &&
      currentRoomId !== null &&
      currentRoomId !== String(enabledPlaylist.room_id),
    );
  });
  const playlistReady = $derived(snapshot.connected && snapshot.playlistFresh && !roomMismatch);
  const canUsePlayer = $derived(playlistReady && Boolean(enabledPlaylist) && Boolean(current));
  const expectedPosition = $derived.by(() => {
    clockTick;
    return enabledPlaylist ? expectedPlaybackPosition(enabledPlaylist, serverNow()) : 0;
  });

  let disposed = false;
  let serverClockOffset = 0;
  let lastPlaylist: SessionPlaylistSnapshot | null = null;
  let lastPlaylistRoomId: string | null = null;
  let player: YouTubePlayer | null = null;
  let playerReady = false;
  let playerGeneration = 0;
  let playerInitPromise: Promise<YouTubePlayer> | null = null;
  let scheduledStartTimer: ReturnType<typeof setTimeout> | null = null;
  let driftTimer: ReturnType<typeof setInterval> | null = null;
  let appliedEntryKey = "";
  let readyReportKey = "";

  $effect(() => activeSession.world.subscribe((next) => (snapshot = next)));
  $effect(() => reconcile(snapshot));

  onDestroy(() => {
    disposed = true;
    destroyPlayer();
  });

  function roomId(room: RoomInfo | null): string | null {
    const id = room?.num ?? room?.id;
    return id === undefined || id === null ? null : String(id);
  }

  function saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoJoin, volume }));
    } catch {
      // Settings are optional when browser storage is unavailable.
    }
  }

  function serverNow(): number {
    return Date.now() / 1_000 - serverClockOffset;
  }

  function formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function reconcile(next: SessionWorldSnapshot): void {
    const state = next.playlist;
    if (state !== lastPlaylist) {
      lastPlaylist = state;
      if (state.server_time > 0) serverClockOffset = Date.now() / 1_000 - state.server_time;
      const nextRoomId = String(state.room_id ?? "");
      if (lastPlaylistRoomId !== null && nextRoomId !== lastPlaylistRoomId) destroyPlayer();
      lastPlaylistRoomId = nextRoomId;
      clockTick = Date.now();
    }

    if (!next.connected) {
      if (hasPlaybackResources()) destroyPlayer();
      statusMessage = "Shared playback is unavailable while disconnected.";
      return;
    }
    if (!next.playlistFresh) {
      if (hasPlaybackResources()) destroyPlayer();
      statusMessage = "Waiting for fresh jukebox state.";
      return;
    }
    if (!state.enabled) {
      if (hasPlaybackResources()) destroyPlayer();
      statusMessage = "";
      return;
    }
    if (roomMismatch) {
      if (hasPlaybackResources()) destroyPlayer();
      statusMessage = "You left the jukebox room.";
      return;
    }
    if (
      statusMessage === "Shared playback is unavailable while disconnected." ||
      statusMessage === "You left the jukebox room." ||
      statusMessage === "Waiting for fresh jukebox state."
    ) {
      statusMessage = "";
    }
    if (autoJoin && !listening && state.playback.current) {
      join(false);
    } else if (listening) {
      void ensurePlayer()
        .then(() => applyAuthoritativeState())
        .catch(() => {});
    }
  }

  function hasPlaybackResources(): boolean {
    return Boolean(listening || player || playerInitPromise || scheduledStartTimer || driftTimer);
  }

  function clearScheduledStart(): void {
    if (scheduledStartTimer) clearTimeout(scheduledStartTimer);
    scheduledStartTimer = null;
  }

  function stopDriftTimer(): void {
    if (driftTimer) clearInterval(driftTimer);
    driftTimer = null;
  }

  function stopPlayback(): void {
    clearScheduledStart();
    stopDriftTimer();
    listening = false;
    appliedEntryKey = "";
    if (player && playerReady) {
      try {
        player.stopVideo();
      } catch {
        // Ignore a stale iframe while it is being replaced.
      }
    }
  }

  function destroyPlayer(): void {
    playerGeneration += 1;
    stopPlayback();
    playerReady = false;
    playerInitPromise = null;
    readyReportKey = "";
    const stalePlayer = player;
    player = null;
    try {
      stalePlayer?.destroy?.();
    } catch {
      // A removed iframe is already disposed.
    }
    if (!disposed) playerHostGeneration = playerGeneration;
  }

  function ensurePlayer(): Promise<YouTubePlayer> {
    if (disposed) return Promise.reject(new Error("Jukebox panel unavailable"));
    if (player && playerReady) return Promise.resolve(player);
    if (playerInitPromise) return playerInitPromise;

    const generation = ++playerGeneration;
    playerHostGeneration = generation;
    const hostId = `room-playlist-player-${activeSession.sessionId}-${generation}`;

    const pending = tick()
      .then(loadYouTubeApi)
      .then(
        (api) =>
          new Promise<YouTubePlayer>((resolve, reject) => {
            if (!isCurrentGeneration(generation)) {
              reject(new Error("Jukebox panel changed"));
              return;
            }
            try {
              player = new api.Player(hostId, {
                width: "100%",
                height: "100%",
                playerVars: {
                  playsinline: 1,
                  controls: 1,
                  rel: 0,
                  origin: window.location.origin,
                },
                events: {
                  onReady(event) {
                    if (!isCurrentGeneration(generation)) return;
                    player = event.target;
                    playerReady = true;
                    event.target.setVolume(volume);
                    resolve(event.target);
                  },
                  onStateChange: (event) => handlePlayerState(event.data, generation),
                  onError: (event) => handlePlayerError(event.data, generation),
                  onAutoplayBlocked: () => handleAutoplayBlocked(generation),
                },
              });
            } catch (error) {
              player = null;
              reject(error instanceof Error ? error : new Error("Unable to create YouTube player"));
            }
          }),
      );
    playerInitPromise = pending;
    pending.then(
      () => {
        if (playerInitPromise === pending) playerInitPromise = null;
      },
      () => {
        if (playerInitPromise === pending) playerInitPromise = null;
        if (isCurrentGeneration(generation)) player = null;
      },
    );
    return pending;
  }

  function isCurrentGeneration(generation: number): boolean {
    return !disposed && generation === playerGeneration;
  }

  function join(trustedGesture = true): void {
    if (!canUsePlayer) return;
    listening = true;
    autoJoin = true;
    saveSettings();
    statusMessage = trustedGesture ? "Joining the shared playback…" : "Restoring shared playback…";
    const generation = playerGeneration + (player || playerInitPromise ? 0 : 1);
    void ensurePlayer()
      .then(() => {
        if (!isCurrentGeneration(generation) || !listening) return;
        statusMessage = "";
        applyAuthoritativeState();
      })
      .catch(() => {
        if (!isCurrentGeneration(generation)) return;
        listening = false;
        autoJoin = false;
        saveSettings();
        statusMessage = "Playback could not start. Select Listen in sync to try again.";
      });
  }

  function leave(): void {
    autoJoin = false;
    saveSettings();
    stopPlayback();
    statusMessage = "Playback stopped.";
  }

  function applyAuthoritativeState(): void {
    const state = snapshot.playlist;
    if (!listening || !playerReady || !player || !state.enabled || roomMismatch) return;
    const playback = state.playback;
    const entry = playback.current;
    clearScheduledStart();
    if (!entry) {
      player.stopVideo();
      appliedEntryKey = "";
      stopDriftTimer();
      return;
    }

    const generation = playerGeneration;
    const entryKey = `${state.room_id}:${entry.id}`;
    const expected = expectedPlaybackPosition(state, serverNow());
    const isNewEntry = appliedEntryKey !== entryKey;
    if (isNewEntry && appliedEntryKey) {
      destroyPlayer();
      listening = true;
      const replacementGeneration = playerGeneration + 1;
      void ensurePlayer()
        .then(() => {
          if (isCurrentGeneration(replacementGeneration) && listening) applyAuthoritativeState();
        })
        .catch(() => {
          if (isCurrentGeneration(replacementGeneration)) listening = false;
        });
      return;
    }
    appliedEntryKey = entryKey;

    if (playback.status === "playing") {
      const delayMs = Math.max(0, (playback.start_at - serverNow()) * 1_000);
      if (isNewEntry || delayMs > 50) {
        player.cueVideoById({ videoId: entry.video_id, startSeconds: expected });
      } else if (shouldCorrectDrift(player.getCurrentTime(), expected)) {
        player.seekTo(expected, true);
      }
      if (delayMs > 50) {
        scheduledStartTimer = setTimeout(() => {
          scheduledStartTimer = null;
          if (!isCurrentGeneration(generation) || !listening || appliedEntryKey !== entryKey)
            return;
          const startPosition = expectedPlaybackPosition(snapshot.playlist, serverNow());
          player?.seekTo(startPosition, true);
          player?.playVideo();
          clockTick = Date.now();
        }, delayMs);
      } else {
        player.playVideo();
      }
      startDriftTimer();
    } else {
      if (isNewEntry) {
        player.cueVideoById({ videoId: entry.video_id, startSeconds: expected });
      } else if (shouldCorrectDrift(player.getCurrentTime(), expected)) {
        player.seekTo(expected, true);
      }
      player.pauseVideo();
      stopDriftTimer();
    }
    clockTick = Date.now();
  }

  function startDriftTimer(): void {
    if (driftTimer) return;
    const generation = playerGeneration;
    driftTimer = setInterval(() => reconcileDrift(generation), DRIFT_INTERVAL_MS);
  }

  function reconcileDrift(generation: number): void {
    const state = snapshot.playlist;
    if (
      !isCurrentGeneration(generation) ||
      !listening ||
      !playerReady ||
      !player ||
      !state.enabled ||
      state.playback.status !== "playing"
    )
      return;
    const expected = expectedPlaybackPosition(state, serverNow());
    if (shouldCorrectDrift(player.getCurrentTime(), expected)) player.seekTo(expected, true);
    const api = (window as YouTubeWindow).YT;
    if (
      api &&
      player.getPlayerState() !== api.PlayerState.PLAYING &&
      serverNow() >= state.playback.start_at
    ) {
      player.playVideo();
    }
    clockTick = Date.now();
  }

  function handlePlayerState(playerState: number, generation: number): void {
    if (!isCurrentGeneration(generation) || !listening) return;
    const state = snapshot.playlist;
    const api = (window as YouTubeWindow).YT;
    if (!api || !state.enabled || !state.playback.current || !player) return;
    if (playerState === api.PlayerState.PLAYING) {
      if (state.playback.status !== "playing") {
        player.pauseVideo();
        return;
      }
      reportReady();
      startDriftTimer();
    } else if (playerState === api.PlayerState.ENDED) {
      activeSession.world.reportPlaylistEnded();
    }
  }

  function reportReady(): void {
    const state = snapshot.playlist;
    if (!state.enabled || !state.playback.current || !playerReady || !player || !listening) return;
    const key = `${state.room_id}:${state.playback.current.id}:${state.revision}`;
    if (readyReportKey === key) return;
    const videoData = player.getVideoData?.() ?? {};
    const sent = activeSession.world.reportPlaylistReady(
      videoData.title || state.playback.current.title,
      Math.round(player.getDuration?.() ?? 0),
    );
    if (sent) readyReportKey = key;
  }

  function handlePlayerError(code: number, generation: number): void {
    if (!isCurrentGeneration(generation) || !listening) return;
    statusMessage = `This video could not play (YouTube error ${code}).`;
    activeSession.world.reportPlaylistError(Number(code) || 0);
  }

  function handleAutoplayBlocked(generation: number): void {
    if (!isCurrentGeneration(generation) || !listening) return;
    listening = false;
    autoJoin = false;
    saveSettings();
    clearScheduledStart();
    stopDriftTimer();
    statusMessage = "Your browser blocked autoplay. Select Listen in sync to begin.";
  }

  function submitAdd(event: SubmitEvent): void {
    event.preventDefault();
    const url = addUrl.trim();
    if (url && activeSession.world.addPlaylistUrl(url)) addUrl = "";
  }

  function updateVolume(event: Event): void {
    volume = clamp((event.currentTarget as HTMLInputElement).value, 0, 100);
    saveSettings();
    if (playerReady) player?.setVolume(volume);
  }

  function updateAutoJoin(event: Event): void {
    autoJoin = (event.currentTarget as HTMLInputElement).checked;
    saveSettings();
    if (autoJoin && !listening) join(false);
  }
</script>

<section
  class:room-playlist-disabled={!playlist.enabled}
  class="room-playlist room-playlist-panel"
  data-panel-id={panelId}
  data-workspace-owned="true"
>
  <div
    class="room-playlist-offline"
    hidden={playlist.enabled && snapshot.connected && !roomMismatch}
  >
    {#if !playlist.enabled}
      There is no shared jukebox in this room.
    {:else if !snapshot.connected}
      Shared playback is unavailable while disconnected.
    {:else}
      You left the jukebox room.
    {/if}
  </div>

  {#if enabledPlaylist}
    <div class="room-playlist-player">
      {#key playerHostGeneration}
        <div id={`room-playlist-player-${activeSession.sessionId}-${playerHostGeneration}`}></div>
      {/key}
      <div class="room-playlist-gate" hidden={listening}>
        <div class="room-playlist-title">{enabledPlaylist.name}</div>
        <div class="room-playlist-subtitle">
          {#if current}
            Join everyone listening to “{current.title}” at the shared playhead.
          {:else}
            The queue is empty. Add a YouTube video to get things started.
          {/if}
        </div>
        <button
          type="button"
          class="room-playlist-button"
          disabled={!canUsePlayer}
          onclick={() => join()}>Listen in sync</button
        >
      </div>
    </div>

    <div class="room-playlist-now">
      <div class="room-playlist-now-title">{current?.title ?? "Nothing playing"}</div>
      <div class="room-playlist-now-meta">
        {#if current}
          {formatTime(expectedPosition)}{current.duration
            ? ` / ${formatTime(current.duration)}`
            : ""} · added by {current.added_by}
        {:else}
          Add a video below to begin the shared playlist.
        {/if}
      </div>
    </div>

    <div class="room-playlist-controls">
      {#if listening}
        <button type="button" class="room-playlist-button" onclick={leave}>Stop listening</button>
      {/if}
      <button
        type="button"
        class="room-playlist-button"
        disabled={!playlistReady || !current}
        onclick={() => activeSession.world.votePlaylistSkip()}
        >Vote to skip ({enabledPlaylist.skip_votes}/{enabledPlaylist.skip_needed})</button
      >
      {#if moderator}
        <button
          type="button"
          class="room-playlist-button"
          disabled={!playlistReady || !current}
          onclick={() =>
            enabledPlaylist.playback.status === "playing"
              ? activeSession.world.pausePlaylist()
              : activeSession.world.resumePlaylist()}
          >{enabledPlaylist.playback.status === "playing" ? "Pause all" : "Resume all"}</button
        >
        <button
          type="button"
          class="room-playlist-button"
          disabled={!playlistReady || !current}
          onclick={() => activeSession.world.skipPlaylist()}>Skip now</button
        >
      {/if}
      <label class="room-playlist-volume">
        Volume
        <input type="range" min="0" max="100" value={volume} oninput={updateVolume} />
      </label>
      <label class="room-playlist-auto-join">
        <input type="checkbox" checked={autoJoin} onchange={updateAutoJoin} /> Auto-join
      </label>
    </div>

    <div class="room-playlist-status" aria-live="polite">
      {statusMessage ||
        (listening
          ? "Listening at the room’s synchronized playhead."
          : "Playback is opt-in. The queue remains shared for everyone here.")}
    </div>

    {#if enabledPlaylist.permissions.add}
      <form class="room-playlist-add" onsubmit={submitAdd}>
        <input
          type="url"
          aria-label="YouTube video URL"
          placeholder="Paste a YouTube URL"
          disabled={!playlistReady}
          bind:value={addUrl}
        />
        <button type="submit" disabled={!playlistReady || !addUrl.trim()}> Add </button>
      </form>
    {/if}

    <div class="room-playlist-queue">
      <div class="room-playlist-queue-heading">Up next</div>
      {#if !enabledPlaylist.queue.length}
        <div class="room-playlist-empty">No videos are waiting.</div>
      {:else}
        {#each enabledPlaylist.queue as entry, index (entry.id)}
          {@const number = index + 1}
          <div class="room-playlist-queue-item">
            <div class="room-playlist-queue-index">{number}</div>
            <div class="room-playlist-queue-copy">
              <div class="room-playlist-queue-title" title={entry.title}>{entry.title}</div>
              <div class="room-playlist-queue-meta">added by {entry.added_by}</div>
            </div>
            <div class="room-playlist-queue-actions">
              {#if entry.can_remove}
                <button
                  type="button"
                  class="room-playlist-button"
                  disabled={!playlistReady}
                  onclick={() => activeSession.world.removePlaylistEntry(number)}>Remove</button
                >
              {/if}
              {#if moderator}
                <button
                  type="button"
                  class="room-playlist-button"
                  aria-label={`Move ${entry.title} up`}
                  disabled={!playlistReady || number === 1}
                  onclick={() => activeSession.world.movePlaylistEntry(number, number - 1)}
                  >↑</button
                >
                <button
                  type="button"
                  class="room-playlist-button"
                  aria-label={`Move ${entry.title} down`}
                  disabled={!playlistReady || number === enabledPlaylist.queue.length}
                  onclick={() => activeSession.world.movePlaylistEntry(number, number + 1)}
                  >↓</button
                >
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</section>

<style>
  .room-playlist-panel {
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    padding: 0.75rem;
    overflow: auto;
  }

  .room-playlist-auto-join {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: calc(11px * var(--pane-font-scale, 1));
  }
</style>
