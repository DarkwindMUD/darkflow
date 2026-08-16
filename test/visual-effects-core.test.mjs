import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createVisualEffectsState,
  createVisualWorldState,
  deriveRoomVisualContext,
  normalizeIncomingDamageEffect,
  normalizeVisualEffect,
  normalizeVisualPreview,
  reduceHealthState,
  reduceVisualEffectEvents,
  reduceVisualWorldState,
} from '../public/js/visual-effects-core.mjs';
import {
  extractTerrainTokens,
  getPrimaryTerrain,
} from '../public/js/terrain-semantics.mjs';

test('visual event normalization accepts only fixed damage and spell semantics', () => {
  assert.deepEqual(normalizeIncomingDamageEffect({
    seq: 7,
    kind: 'damage',
    perspective: 'incoming',
    cue: 'impact',
    intensity: 8,
  }), {
    seq: 7,
    kind: 'damage',
    perspective: 'incoming',
    cue: 'impact',
    intensity: 3,
  });

  assert.deepEqual(normalizeVisualEffect({
    seq: 8,
    kind: 'damage',
    perspective: 'outgoing',
    cue: 'impact',
    intensity: 0,
  }), {
    seq: 8,
    kind: 'damage',
    perspective: 'outgoing',
    cue: 'impact',
    intensity: 1,
  });

  assert.deepEqual(normalizeVisualEffect({
    seq: 9,
    kind: 'spell-cast',
    perspective: 'self',
    cue: 'cast',
    school: 'frost',
    intensity: 2,
  }), {
    seq: 9,
    kind: 'spell-cast',
    perspective: 'self',
    cue: 'cast',
    palette: 'cold',
    intensity: 2,
  });

  assert.equal(normalizeVisualEffect({
    seq: 10,
    kind: 'spell-cast',
    perspective: 'target',
    school: 'server-selected-css',
  }), null);
  assert.equal(normalizeVisualEffect({
    seq: 11,
    kind: 'damage',
    perspective: 'incoming',
    cue: 'server-selected-css',
  }), null);
});

test('elemental spell aliases normalize to the fixed fire, cold, and lightning palettes', () => {
  const aliases = [
    ['fire', 'fire'],
    ['flame', 'fire'],
    ['cold', 'cold'],
    ['frost', 'cold'],
    ['ice', 'cold'],
    ['lightning', 'lightning'],
    ['electric', 'lightning'],
    ['storm', 'lightning'],
  ];

  for (const [school, palette] of aliases) {
    assert.deepEqual(normalizeVisualEffect({
      seq: 12,
      kind: 'spell-cast',
      perspective: 'self',
      cue: 'cast',
      school,
      intensity: 2,
    }), {
      seq: 12,
      kind: 'spell-cast',
      perspective: 'self',
      cue: 'cast',
      palette,
      intensity: 2,
    }, `${school} normalizes to ${palette}`);
  }
});

test('builder previews accept only fixed client-owned kinds and values', () => {
  for (const planet of ['darkwind', 'dailos', 'markas', 'tekal']) {
    assert.deepEqual(normalizeVisualPreview({
      kind: 'planet',
      value: planet,
      duration: 999999,
      selector: 'body',
      url: 'https://untrusted.invalid/image.png',
    }), { kind: 'planet', value: planet });
  }

  for (const terrain of [
    'arctic', 'city', 'coast', 'desert', 'forest', 'inside', 'jungle',
    'mountain', 'plains', 'road', 'swamp', 'underground', 'underwater', 'water',
  ]) {
    assert.deepEqual(normalizeVisualPreview({
      kind: 'terrain',
      value: terrain,
    }), { kind: 'terrain', value: terrain });
  }

  for (const kind of ['low-health', 'transition', 'clear']) {
    assert.deepEqual(normalizeVisualPreview({ kind }), { kind });
  }

  assert.equal(normalizeVisualPreview({ kind: 'planet', value: 'TEKAL' }), null);
  assert.equal(normalizeVisualPreview({ kind: 'terrain', value: 'outside' }), null);
  assert.equal(normalizeVisualPreview({ kind: 'low-health', value: 'fire' }), null);
  assert.equal(normalizeVisualPreview({ kind: 'server-css', value: 'body' }), null);
});

test('event reduction is bounded, sequence-deduplicated, and resets on a new epoch', () => {
  const first = reduceVisualEffectEvents(createVisualEffectsState(), {
    epoch: 'session-a',
    events: [
      { seq: 2, kind: 'damage', perspective: 'incoming', cue: 'impact', intensity: 2 },
      { seq: 1, kind: 'damage', perspective: 'outgoing', cue: 'impact', intensity: 3 },
      { seq: 2, kind: 'damage', perspective: 'incoming', cue: 'impact', intensity: 2 },
    ],
  });

  assert.equal(first.state.epoch, 'session-a');
  assert.equal(first.state.lastSeq, 2);
  assert.deepEqual(first.effects.map((effect) => effect.seq), [1, 2]);

  const duplicate = reduceVisualEffectEvents(first.state, {
    epoch: 'session-a',
    events: [
      { seq: 2, kind: 'damage', perspective: 'incoming', cue: 'impact', intensity: 2 },
    ],
  });
  assert.deepEqual(duplicate.effects, []);

  const newConnection = reduceVisualEffectEvents(duplicate.state, {
    epoch: 'session-b',
    events: Array.from({ length: 20 }, (_, index) => ({
      seq: index + 1,
      kind: 'damage',
      perspective: 'incoming',
      cue: 'impact',
      intensity: 1,
    })),
  });
  assert.equal(newConnection.state.epoch, 'session-b');
  assert.equal(newConnection.state.lastSeq, 20);
  assert.equal(newConnection.effects.length, 12);
  assert.equal(newConnection.effects[0].seq, 9);
});

test('world state accepts only known planet and terrain semantics and deduplicates sequence', () => {
  const first = reduceVisualWorldState(createVisualWorldState(), {
    epoch: 'world-a',
    seq: 4,
    reason: 'move',
    planet: 'MARKAS',
    terrain: ['dense forest and city road', 'server-css-gradient'],
  });
  assert.equal(first.accepted, true);
  assert.equal(first.state.planet, 'markas');
  assert.deepEqual(first.state.terrains, ['city', 'road', 'forest']);
  assert.equal(first.state.reason, 'move');

  const duplicate = reduceVisualWorldState(first.state, {
    epoch: 'world-a',
    seq: 4,
    planet: 'tekal',
    terrains: ['arctic'],
  });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.state.planet, 'markas');

  const wayshard = reduceVisualWorldState(duplicate.state, {
    epoch: 'world-a',
    seq: 5,
    reason: 'wayshard',
    planet: 'markas',
    terrain: ['dense forest and city road'],
  });
  assert.equal(wayshard.accepted, true);
  assert.equal(wayshard.changed, false,
    'wayshard travel remains explicit even when the ambience is unchanged');
  assert.equal(wayshard.state.reason, 'wayshard');

  const nextEpoch = reduceVisualWorldState(wayshard.state, {
    epoch: 'world-b',
    seq: 1,
    planet: 'unknown-world',
    terrains: ['unknown-terrain'],
  });
  assert.equal(nextEpoch.accepted, true);
  assert.equal(nextEpoch.state.planet, '');
  assert.deepEqual(nextEpoch.state.terrains, []);
});

test('Room.Info fallback and map rendering share compound terrain priority', () => {
  assert.deepEqual(
    extractTerrainTokens('outside, dense forest and city road'),
    ['city', 'road', 'forest', 'outside'],
  );
  assert.equal(getPrimaryTerrain('arctic mountain and forest'), 'forest');
  assert.deepEqual(
    deriveRoomVisualContext({ environment: ['open water', 'rocky coast'] }).terrains,
    ['water', 'coast'],
  );
  assert.deepEqual(
    deriveRoomVisualContext({ environment: ['rocky coast', 'open water', 'city road'] }).terrains,
    ['city', 'road', 'water'],
  );

  assert.deepEqual(deriveRoomVisualContext({
    num: 42,
    area: 'Old Wood',
    planet: 'Dailos',
    environment: 'outside and dense forest',
  }), {
    epoch: '',
    lastSeq: 0,
    planet: 'dailos',
    terrains: ['forest'],
    roomId: '42',
    area: 'Old Wood',
    reason: 'snapshot',
  });
});

test('low health is alive-only at 40 percent and survives partial vitals updates', () => {
  const normal = reduceHealthState({}, { hp: 41, maxhp: 100 });
  assert.equal(normal.lowHealth, false);
  assert.equal(normal.ratio, 0.41);

  const threshold = reduceHealthState(normal, { hp: 40 });
  assert.equal(threshold.maxHp, 100);
  assert.equal(threshold.lowHealth, true);

  const aliases = reduceHealthState({}, { current_hp: '8', max_hp: '20' });
  assert.equal(aliases.lowHealth, true);

  const dead = reduceHealthState(threshold, { hp: 0 });
  assert.equal(dead.alive, false);
  assert.equal(dead.lowHealth, false);
});
