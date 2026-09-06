import test from 'node:test';
import assert from 'node:assert/strict';

const documentListeners = new Map();
const storage = new Map();

globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  clear() { storage.clear(); },
};
globalThis.document = {
  hidden: false,
  addEventListener(name, callback) {
    if (!documentListeners.has(name)) documentListeners.set(name, new Set());
    documentListeners.get(name).add(callback);
  },
  removeEventListener(name, callback) {
    documentListeners.get(name)?.delete(callback);
  },
};

const { SoundManager } = await import('../public/js/sound-manager.js');

class FakeAudioEngine {
  constructor({ unlocked = false } = {}) {
    this.unlocked = unlocked;
    this.unlockListeners = new Set();
    this.created = [];
    this.plays = [];
    this.stops = [];
    this.globalVolumes = [];
    this.nextId = 1;
  }

  isUnlocked() { return this.unlocked; }
  onUnlock(callback) { this.unlockListeners.add(callback); return () => this.unlockListeners.delete(callback); }
  setGlobalVolume(volume) { this.globalVolumes.push(volume); }
  markLocked() { this.unlocked = false; }

  async unlock() {
    this.unlocked = true;
    for (const callback of this.unlockListeners) callback();
    return true;
  }

  create(src, options) {
    const handle = { src, options, listeners: [] };
    this.created.push(handle);
    return handle;
  }

  play(handle, options) {
    const id = this.nextId++;
    this.plays.push({ handle, options, id });
    return id;
  }

  once(handle, event, callback, id) {
    handle.listeners.push({ event, callback, id });
  }

  off(handle, event, callback, id) {
    handle.listeners = handle.listeners.filter((listener) => !(
      listener.event === event
      && listener.callback === callback
      && listener.id === id
    ));
  }

  stop(handle, id) {
    this.stops.push({ handle, id });
  }

  emit(playIndex, event, error) {
    const playback = this.plays[playIndex];
    const matching = playback.handle.listeners.filter((listener) => (
      listener.event === event
      && (listener.id === undefined || listener.id === playback.id)
    ));
    playback.handle.listeners = playback.handle.listeners.filter((listener) => !matching.includes(listener));
    for (const listener of matching) listener.callback(playback.id, error);
  }
}

function createManager(options) {
  storage.clear();
  document.hidden = false;
  const engine = new FakeAudioEngine(options);
  return { engine, manager: new SoundManager(engine) };
}

test('queues locked sounds and loops, then drains each once after unlock', async () => {
  const { engine, manager } = createManager();

  manager.play('combat', 'hit', 0.5);
  manager.loop('ambient', 'darkwind-theme', 'login-theme', 0.25);
  assert.equal(manager.getSettings().pendingCount, 2);
  assert.equal(engine.plays.length, 0);

  assert.equal(await manager.unlockFromUserGesture(), true);
  assert.equal(manager.getSettings().pendingCount, 0);
  assert.equal(engine.plays.length, 2);
  assert.deepEqual(engine.plays.map((playback) => playback.options), [
    { volume: 0.5 },
    { volume: 0.25, loop: true },
  ]);
});

test('reuses one Howl while tracking overlapping playback IDs independently', () => {
  const { engine, manager } = createManager({ unlocked: true });

  manager.play('combat', 'hit', 0.5);
  manager.play('combat', 'hit', 0.75);

  assert.equal(engine.created.length, 1);
  assert.equal(engine.plays.length, 2);
  assert.notEqual(engine.plays[0].id, engine.plays[1].id);
  assert.equal(manager.getDebugSnapshot().activeOneShots, 2);

  engine.emit(0, 'end');
  assert.equal(manager.getDebugSnapshot().activeOneShots, 1);
  engine.emit(1, 'play');
  assert.equal(manager.getDebugSnapshot().lastPlayResult.ok, true);
  assert.ok(Math.abs(manager.getDebugSnapshot().lastPlayResult.volume - 0.525) < Number.EPSILON);
});

test('uses HTML5 streaming only for long-form music keys', () => {
  const { engine, manager } = createManager({ unlocked: true });

  manager.play('combat', 'hit');
  manager.loop('ambient', 'darkwind-theme', 'login-theme');

  assert.equal(engine.created[0].options.html5, false);
  assert.equal(engine.created[1].options.html5, true);
});

test('controls phase 2 login music independently of ambient sounds', () => {
  const { engine, manager } = createManager({ unlocked: true });

  manager.setCategoryEnabled('ambient', false);
  manager.loop('music', 'darkwind-theme', 'login-theme');
  assert.equal(engine.plays.length, 1);
  assert.equal(engine.created[0].src, '/assets/sounds/darkwind-theme.mp3');

  manager.setCategoryEnabled('music', false);
  assert.equal(engine.stops.length, 1);
  assert.equal(manager.getSettings().categoryEnabled.music, false);
});

test('replaces and stops loops by Darkflow semantic ID', () => {
  const { engine, manager } = createManager({ unlocked: true });

  manager.loop('ambient', 'rain', 'weather');
  manager.loop('ambient', 'wind', 'weather');

  assert.equal(engine.stops.length, 1);
  assert.equal(manager.getDebugSnapshot().loops.length, 1);
  manager.stopById('weather');
  assert.equal(engine.stops.length, 2);
  assert.deepEqual(manager.getDebugSnapshot().loops, []);
});

test('resets active session playback without resetting application sound state', () => {
  const { engine, manager } = createManager({ unlocked: true });
  manager.setVolume(0.4);
  manager.setCategoryEnabled('spell', false);
  manager.play('combat', 'hit');
  manager.loop('ambient', 'rain', 'weather');
  engine.emit(0, 'play');

  const settings = manager.getSettings();
  const cachedSounds = manager.getDebugSnapshot().cachedSounds;
  assert.equal(manager.getDebugSnapshot().lastPlayResult.ok, true);

  manager.resetSessionPlayback();

  const reset = manager.getDebugSnapshot();
  assert.deepEqual(engine.stops.map(({ id }) => id), [1, 2]);
  assert.equal(engine.created.every(({ listeners }) => listeners.length === 0), true);
  assert.deepEqual(manager.getSettings(), settings);
  assert.deepEqual(reset.pendingSounds, []);
  assert.deepEqual(reset.pendingLoops, []);
  assert.deepEqual(reset.cachedSounds, cachedSounds);
  assert.equal(reset.activeOneShots, 0);
  assert.deepEqual(reset.loops, []);
  assert.equal(reset.lastPlayResult, null);
  assert.equal(manager.isAudioUnlocked(), true);
  assert.deepEqual(engine.globalVolumes, [0.7, 0.4]);

  manager.resetSessionPlayback();
  assert.equal(engine.stops.length, 2);
  assert.deepEqual(manager.getDebugSnapshot().cachedSounds, cachedSounds);
});

test('clears pending session playback and remembered loop metadata', async () => {
  const { engine, manager } = createManager();
  manager.play('combat', 'hit');
  manager.loop('ambient', 'rain', 'weather');
  assert.equal(manager.getSettings().pendingCount, 2);

  manager.resetSessionPlayback();
  assert.equal(manager.getSettings().pendingCount, 0);

  await manager.unlockFromUserGesture();
  document.hidden = true;
  for (const callback of documentListeners.get('visibilitychange') || []) callback();
  document.hidden = false;
  for (const callback of documentListeners.get('visibilitychange') || []) callback();

  assert.equal(engine.plays.length, 0);
  assert.deepEqual(manager.getDebugSnapshot().loops, []);
  assert.equal(manager.isAudioUnlocked(), true);
});

test('applies master volume globally and preserves the stored settings schema', () => {
  const { engine, manager } = createManager({ unlocked: true });

  manager.setVolume(0.4);
  manager.setCategoryEnabled('combat', false);

  assert.deepEqual(engine.globalVolumes, [0.7, 0.4]);
  assert.deepEqual(JSON.parse(storage.get('darkwind-sound-settings')), {
    enabled: true,
    volume: 0.4,
    categoryEnabled: manager.getSettings().categoryEnabled,
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    manager.play('combat', 'hit');
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(engine.plays.length, 0);
});

test('records load failures and requeues autoplay failures for the next unlock', () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const { engine, manager } = createManager({ unlocked: true });
    manager.play('combat', 'hit');
    engine.emit(0, 'loaderror', 'missing');
    assert.equal(manager.getDebugSnapshot().lastPlayResult.ok, false);
    assert.equal(manager.getDebugSnapshot().lastPlayResult.errorName, 'HowlerLoadError');
    assert.equal(manager.getDebugSnapshot().activeOneShots, 0);

    manager.play('combat', 'miss');
    engine.emit(1, 'playerror', 'not allowed');
    assert.equal(manager.isAudioUnlocked(), false);
    assert.equal(manager.getSettings().pendingCount, 1);
    assert.equal(manager.getDebugSnapshot().lastPlayResult.errorName, 'HowlerPlayError');
  } finally {
    console.warn = originalWarn;
  }
});

test('stops loops while hidden and resumes remembered loops when visible', () => {
  const { engine, manager } = createManager({ unlocked: true });
  manager.loop('ambient', 'rain', 'weather');

  document.hidden = true;
  for (const callback of documentListeners.get('visibilitychange') || []) callback();
  assert.deepEqual(manager.getDebugSnapshot().loops, []);
  assert.equal(engine.stops.length, 1);

  document.hidden = false;
  for (const callback of documentListeners.get('visibilitychange') || []) callback();
  assert.deepEqual(manager.getDebugSnapshot().loops, ['weather']);
  assert.equal(engine.plays.length, 2);
});
