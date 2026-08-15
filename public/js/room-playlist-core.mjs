export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const videoId = String(entry.video_id || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return {
    id: Number(entry.id) || 0,
    video_id: videoId,
    title: String(entry.title || `YouTube video ${videoId}`).trim().slice(0, 120),
    added_by: String(entry.added_by || 'Someone').trim().slice(0, 40),
    duration: clamp(entry.duration, 0, 21600),
    can_remove: !!entry.can_remove,
  };
}

export function normalizePlaylistState(input) {
  const state = input && typeof input === 'object' ? input : {};
  if (!state.enabled) {
    return {
      enabled: false,
      room_id: state.room_id ?? null,
      server_time: Number(state.server_time) || 0,
    };
  }
  const playback = state.playback && typeof state.playback === 'object'
    ? state.playback
    : {};
  const allowedStatuses = new Set(['stopped', 'playing', 'paused', 'paused_empty']);
  const status = allowedStatuses.has(playback.status) ? playback.status : 'stopped';
  return {
    enabled: true,
    room_id: state.room_id ?? null,
    revision: Math.max(1, Number(state.revision) || 1),
    server_time: Number(state.server_time) || 0,
    name: String(state.name || 'Room Jukebox').trim().slice(0, 80),
    playback: {
      status,
      position: clamp(playback.position, 0, 21600),
      start_at: Math.max(0, Number(playback.start_at) || 0),
      current: normalizeEntry(playback.current),
    },
    queue: Array.isArray(state.queue)
      ? state.queue.map(normalizeEntry).filter(Boolean).slice(0, 25)
      : [],
    skip_votes: Math.max(0, Number(state.skip_votes) || 0),
    skip_needed: Math.max(1, Number(state.skip_needed) || 1),
    permissions: {
      add: state.permissions ? !!state.permissions.add : true,
      moderate: !!(state.permissions && state.permissions.moderate),
    },
  };
}

export function expectedPlaybackPosition(state, serverNowSeconds) {
  if (!state || !state.enabled || !state.playback || !state.playback.current) return 0;
  const base = clamp(state.playback.position, 0, 21600);
  if (state.playback.status !== 'playing') return base;
  const startAt = Math.max(0, Number(state.playback.start_at) || 0);
  if (!startAt || serverNowSeconds <= startAt) return base;
  const expected = base + (serverNowSeconds - startAt);
  const duration = Number(state.playback.current.duration) || 0;
  return clamp(expected, 0, duration > 0 ? duration : 21600);
}

export function shouldCorrectDrift(actualSeconds, expectedSeconds, thresholdSeconds = 2) {
  const actual = Number(actualSeconds);
  const expected = Number(expectedSeconds);
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) > Math.max(0, Number(thresholdSeconds) || 0);
}
