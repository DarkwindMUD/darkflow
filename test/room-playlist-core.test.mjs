import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedPlaybackPosition,
  normalizePlaylistState,
  shouldCorrectDrift,
} from '../public/js/room-playlist-core.mjs';

function playingState(overrides = {}) {
  return normalizePlaylistState({
    enabled: true,
    room_id: 42,
    revision: 7,
    server_time: 100,
    name: 'Town Jukebox',
    playback: {
      status: 'playing',
      position: 12,
      start_at: 100,
      current: {
        id: 3,
        video_id: 'dQw4w9WgXcQ',
        title: 'A video',
        added_by: 'Tester',
        duration: 200,
        can_remove: true,
      },
      ...overrides,
    },
    queue: [],
    permissions: { add: true, moderate: false },
  });
}

test('normalizes disabled and malformed playlist state safely', () => {
  assert.deepEqual(normalizePlaylistState(null), {
    enabled: false,
    room_id: null,
    server_time: 0,
  });
  const state = normalizePlaylistState({ enabled: true, queue: [{ video_id: 'bad' }] });
  assert.equal(state.enabled, true);
  assert.deepEqual(state.queue, []);
  assert.equal(state.playback.current, null);
  const denied = normalizePlaylistState({
    enabled: 1,
    permissions: { add: 0, moderate: 0 },
  });
  assert.equal(denied.permissions.add, false);
  assert.equal(denied.permissions.moderate, false);
});

test('computes the shared playhead from server start time', () => {
  const state = playingState();
  assert.equal(expectedPlaybackPosition(state, 99), 12);
  assert.equal(expectedPlaybackPosition(state, 105), 17);
  assert.equal(state.playback.current.can_remove, true);
});

test('paused playback does not advance and duration caps the playhead', () => {
  const paused = playingState({ status: 'paused', position: 30 });
  assert.equal(expectedPlaybackPosition(paused, 500), 30);
  const playing = playingState({ position: 199 });
  assert.equal(expectedPlaybackPosition(playing, 110), 200);
});

test('queue snapshots do not count elapsed playback twice', () => {
  const initial = playingState({ position: 0 });
  const updated = normalizePlaylistState({
    ...initial,
    revision: initial.revision + 1,
    server_time: 130,
    playback: { ...initial.playback, position: 30 },
    queue: [{ id: 4, video_id: 'M7lc1UVf-VE', title: 'Next song' }],
  });
  assert.equal(expectedPlaybackPosition(updated, 130), 30);
  assert.equal(expectedPlaybackPosition(updated, 135), 35);
  assert.equal(expectedPlaybackPosition(updated, 135), expectedPlaybackPosition(initial, 135));
  assert.equal(shouldCorrectDrift(30, expectedPlaybackPosition(updated, 130)), false);
});

test('scheduled playback waits for its future start time', () => {
  const state = playingState({ position: 30, start_at: 110 });
  assert.equal(expectedPlaybackPosition(state, 105), 30);
  assert.equal(expectedPlaybackPosition(state, 110), 30);
  assert.equal(expectedPlaybackPosition(state, 115), 35);
});

test('drift correction uses a strict threshold', () => {
  assert.equal(shouldCorrectDrift(10, 12, 2), false);
  assert.equal(shouldCorrectDrift(10, 12.01, 2), true);
  assert.equal(shouldCorrectDrift(Number.NaN, 12, 2), false);
});
