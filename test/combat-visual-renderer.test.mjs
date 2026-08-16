import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

globalThis.document = {
  hidden: false,
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
  createElement() {
    return {
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  },
};

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
};

const { panelRenderers } = await import('../public/js/panel-renderers.js');
const { createCombatVisualRenderer } = await import('../public/js/combat-visual-renderer.mjs');
const {
  createCombatVisualState,
  reduceCombatEvents,
  reduceCombatState,
  takeNextCombatEvent,
} = await import('../public/js/combat-visual-core.mjs');

function bodyElement() {
  return {
    innerHTML: '',
    querySelectorAll() { return []; },
  };
}

function combatModel(overrides = {}) {
  return reduceCombatState(createCombatVisualState(), {
    epoch: 'epoch-1',
    encounter_id: 'encounter-1',
    seq: 4,
    visual_enabled: 1,
    effective: 1,
    active: 1,
    current_target_id: 'target-1',
    actors: [
      { id: 'self', name: '<img src=x onerror=alert(1)>', role: 'self' },
      { id: 'target-1', name: '<script>enemy</script>', role: 'target' },
      { id: 'threat-1', name: '<b>extra threat</b>', role: 'threat' },
    ],
    summary: 'Combat begins.',
    outcome: '',
    ...overrides,
  });
}

function combatData(model = combatModel()) {
  return {
    combatVisual: true,
    model,
    vitals: { hp: 78, maxhp: 100 },
    avatar: {},
    enemy: {
      enemy_name: 'an ash drake',
      enemy_curhp: 41,
      enemy_maxhp: 100,
      enemy_is_npc: 1,
    },
  };
}

function trackedImage() {
  const listeners = new Map();
  const attributes = new Map([
    ['data-combat-image', '/assets/generic-monster.png'],
    ['data-combat-fallback', '/assets/generic-monster.png'],
  ]);
  return {
    complete: false,
    naturalWidth: 0,
    src: '/assets/generic-monster.png',
    parentElement: { classList: { add() {}, remove() {} } },
    addEventListener(type, listener) {
      const current = listeners.get(type) || new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    getAttribute(name) { return attributes.get(name) || ''; },
    setAttribute(name, value) { attributes.set(name, value); },
    listenerCount() {
      return [...listeners.values()].reduce((total, current) => total + current.size, 0);
    },
  };
}

test('visual Enemy renderer escapes server text and exposes accessible health bars', () => {
  const body = bodyElement();
  const model = combatModel();

  panelRenderers.enemy(body, {
    combatVisual: true,
    model,
    vitals: { hp: 78, maxhp: 100 },
    avatar: {},
    enemy: {
      enemy_name: '<script>enemy</script>',
      enemy_curhp: 41,
      enemy_maxhp: 100,
      enemy_hp_string: 'None',
      enemy_is_npc: 1,
      enemy_image: '/assets/generic-monster.png',
    },
  });

  assert.match(body.innerHTML, /class="combat-visual/);
  assert.doesNotMatch(body.innerHTML, /<script>/);
  assert.match(body.innerHTML, /&lt;script&gt;enemy&lt;\/script&gt;/);
  assert.match(body.innerHTML, /role="progressbar"/);
  assert.match(body.innerHTML, /aria-valuenow="78"/);
  assert.match(body.innerHTML, /aria-valuenow="41"/);
  assert.match(body.innerHTML, /class="combat-threat-chip">&lt;b&gt;extra threat&lt;\/b&gt;/);
  assert.match(body.innerHTML, /is-placeholder/);
  assert.match(body.innerHTML, /combat-art-target is-fallback/);
  assert.match(body.innerHTML, /src="\/assets\/generic-monster\.png"/);
  assert.doesNotMatch(body.innerHTML, /Visual combat active/);
  assert.doesNotMatch(body.innerHTML, /combat-sync-state/);
});

test('visual synchronization warning remains visible until text fallback can stop', () => {
  const body = bodyElement();
  const model = combatModel({ effective: 0 });

  panelRenderers.enemy(body, {
    combatVisual: true,
    model,
    vitals: { hp: 78, maxhp: 100 },
    avatar: {},
    enemy: { enemy_name: 'an ash drake', enemy_curhp: 41, enemy_maxhp: 100 },
  });

  assert.match(
    body.innerHTML,
    /Visual combat is synchronizing; text fallback remains active/,
  );
  assert.match(body.innerHTML, /combat-sync-state/);
});

test('repeated authoritative vitals renders do not repeat a live announcement', () => {
  const body = bodyElement();
  const model = combatModel();
  const data = {
    combatVisual: true,
    model,
    vitals: { hp: 80, maxhp: 100 },
    avatar: {},
    enemy: { enemy_name: 'an ash drake', enemy_curhp: 50, enemy_maxhp: 100 },
  };

  panelRenderers.enemy(body, data);
  assert.match(body.innerHTML, />Combat begins\.<\/div>/);

  data.vitals.hp = 79;
  panelRenderers.enemy(body, data);

  assert.doesNotMatch(body.innerHTML, />Combat begins\.<\/div>/);
  assert.match(body.innerHTML, /combat-live-region[^>]*><\/div>/);
  assert.match(body.innerHTML, /aria-valuenow="79"/);
});

test('qualitative events omit damage popups when the server omits damage', () => {
  const body = bodyElement();
  let model = combatModel();
  model = reduceCombatEvents(model, {
    epoch: 'epoch-1',
    encounter_id: 'encounter-1',
    events: [{
      seq: 5,
      kind: 'attack',
      perspective: 'outgoing',
      actor_id: 'self',
      target_id: 'target-1',
      result: 'critical',
      summary: 'You land a critical hit.',
    }],
  });
  model = takeNextCombatEvent(model).state;

  panelRenderers.enemy(body, {
    combatVisual: true,
    model,
    vitals: { hp: 80, maxhp: 100 },
    avatar: {},
    enemy: { enemy_name: 'an ash drake', enemy_curhp: 50, enemy_maxhp: 100 },
  });

  assert.match(body.innerHTML, /combat-current-critical/);
  assert.match(body.innerHTML, />Your critical hit<\/strong>/);
  assert.doesNotMatch(body.innerHTML, /combat-damage-number/);
});

test('incoming hits visibly animate the enemy attacker and the player impact side', () => {
  const body = bodyElement();
  let model = combatModel();
  model = reduceCombatEvents(model, {
    epoch: 'epoch-1',
    encounter_id: 'encounter-1',
    events: [{
      seq: 5,
      kind: 'attack',
      perspective: 'incoming',
      actor_id: 'target-1',
      target_id: 'self',
      result: 'hit',
      damage: 17,
      summary: 'An ash drake claws you for 17 damage.',
    }],
  });
  model = takeNextCombatEvent(model).state;

  panelRenderers.enemy(body, {
    combatVisual: true,
    model,
    vitals: { hp: 63, maxhp: 100 },
    avatar: {},
    enemy: { enemy_name: 'an ash drake', enemy_curhp: 50, enemy_maxhp: 100 },
  });

  assert.match(body.innerHTML, /combat-perspective-incoming/);
  assert.match(body.innerHTML, /combat-impact-player/);
  assert.match(body.innerHTML, /combatant-player is-impact-target/);
  assert.match(body.innerHTML, /combatant-target is-event-actor/);
  assert.match(body.innerHTML, />Incoming hit • 17 damage<\/strong>/);
  assert.match(body.innerHTML, />An ash drake claws you for 17 damage\.<\/span>/);
  const playerCard = body.innerHTML.match(
    /<article class="combatant-card combatant-player[\s\S]*?<\/article>/,
  )[0];
  const targetCard = body.innerHTML.match(
    /<article class="combatant-card combatant-target[\s\S]*?<\/article>/,
  )[0];
  assert.match(playerCard, /class="combat-damage-number combat-damage-player"[^>]*>17<\/div>/);
  assert.doesNotMatch(targetCard, /combat-damage-number/);
});

test('incoming perspective anchors damage over the player even when event IDs are stale', () => {
  const body = bodyElement();
  let model = combatModel();
  model = reduceCombatEvents(model, {
    epoch: 'epoch-1',
    encounter_id: 'encounter-1',
    events: [{
      seq: 5,
      kind: 'attack',
      perspective: 'incoming',
      actor_id: 'legacy-enemy-id',
      target_id: 'legacy-player-id',
      result: 'critical',
      damage: 42,
      summary: '',
    }],
  });
  model = takeNextCombatEvent(model).state;

  panelRenderers.enemy(body, {
    combatVisual: true,
    model,
    vitals: { hp: 58, maxhp: 100 },
    avatar: {},
    enemy: { enemy_name: 'an ash drake', enemy_curhp: 50, enemy_maxhp: 100 },
  });

  const playerCard = body.innerHTML.match(
    /<article class="combatant-card combatant-player[\s\S]*?<\/article>/,
  )[0];
  const targetCard = body.innerHTML.match(
    /<article class="combatant-card combatant-target[\s\S]*?<\/article>/,
  )[0];
  assert.match(body.innerHTML, /combat-impact-player/);
  assert.match(playerCard, /combatant-player is-impact-target/);
  assert.match(playerCard, /combat-damage-player"[^>]*>42<\/div>/);
  assert.match(targetCard, /combatant-target is-event-actor/);
  assert.doesNotMatch(targetCard, /combat-damage-number/);
  assert.match(body.innerHTML, />Incoming critical hit • 42 damage<\/strong>/);
  assert.match(body.innerHTML, /combat-live-region[^>]*>Incoming critical hit • 42 damage<\/div>/);
});

test('passive observed combat shows the actual fighter without private health', () => {
  const body = bodyElement();
  let model = combatModel({ current_actor_id: 'threat-1' });
  model = reduceCombatEvents(model, {
    epoch: 'epoch-1',
    encounter_id: 'encounter-1',
    events: [{
      seq: 5,
      kind: 'attack',
      perspective: 'observed',
      actor_id: 'threat-1',
      target_id: 'target-1',
      result: 'hit',
      summary: 'An extra threat hits the target.',
    }],
  });
  model = takeNextCombatEvent(model).state;

  panelRenderers.enemy(body, {
    combatVisual: true,
    model,
    vitals: { hp: 80, maxhp: 100 },
    avatar: {},
    // An inactive Enemy frame must not expose stale values to an observer.
    enemy: { enemy_name: 'None', enemy_curhp: 99, enemy_maxhp: 100 },
  });

  assert.match(body.innerHTML, /aria-valuetext="Unavailable"/);
  assert.match(body.innerHTML, /<span>HP<\/span><span>Unavailable<\/span>/);
  assert.doesNotMatch(body.innerHTML, /aria-valuenow="99"/);
  assert.doesNotMatch(body.innerHTML, /aria-valuenow="80"/);

  const playerCard = body.innerHTML.match(
    /<article class="combatant-card combatant-player[\s\S]*?<\/article>/,
  )[0];
  const targetCard = body.innerHTML.match(
    /<article class="combatant-card combatant-target[\s\S]*?<\/article>/,
  )[0];
  assert.match(playerCard, /&lt;b&gt;extra threat&lt;\/b&gt;/);
  assert.match(playerCard, /combatant-player is-event-actor/);
  assert.match(playerCard, /aria-valuetext="Unavailable"/);
  assert.match(targetCard, /combatant-target is-impact-target/);
  assert.match(targetCard, /aria-valuetext="Unavailable"/);
  assert.doesNotMatch(body.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(body.innerHTML, /combat-threat-chip/);
});

test('own-combat target health remains synchronizing before Char.Enemy arrives', () => {
  const body = bodyElement();

  panelRenderers.enemy(body, {
    combatVisual: true,
    model: combatModel(),
    vitals: { hp: 80, maxhp: 100 },
    avatar: {},
    enemy: { enemy_name: 'None' },
  });

  assert.match(body.innerHTML, /aria-valuetext="Synchronizing"/);
});

test('renderer instances isolate announcements and dispose every image listener', () => {
  const image = trackedImage();
  const firstBody = {
    innerHTML: '',
    querySelectorAll() { return [image]; },
  };
  const secondBody = bodyElement();
  const first = createCombatVisualRenderer(firstBody);
  const second = createCombatVisualRenderer(secondBody);
  const data = combatData();

  assert.equal(first.render(data), true);
  assert.equal(second.render(data), true);
  assert.match(firstBody.innerHTML, />Combat begins\.<\/div>/);
  assert.match(secondBody.innerHTML, />Combat begins\.<\/div>/);
  assert.equal(image.listenerCount(), 2);

  first.render(data);
  assert.doesNotMatch(firstBody.innerHTML, />Combat begins\.<\/div>/);
  assert.equal(image.listenerCount(), 2, 'rerender replaces rather than accumulates listeners');

  first.dispose();
  first.dispose();
  assert.equal(image.listenerCount(), 0);
  const disposedHtml = firstBody.innerHTML;
  assert.equal(first.render(data), false);
  assert.equal(firstBody.innerHTML, disposedHtml);
  second.dispose();
});

test('legacy Enemy wrapper disposes its renderer when compact rendering resumes', () => {
  const image = trackedImage();
  const body = {
    innerHTML: '',
    querySelectorAll(selector) {
      return selector === '.combat-art img' ? [image] : [];
    },
  };

  panelRenderers.enemy(body, combatData());
  assert.equal(image.listenerCount(), 2);
  assert.ok(body._combatVisualRenderer);

  panelRenderers.enemy(body, { enemy_name: 'None' });
  assert.equal(image.listenerCount(), 0);
  assert.equal(body._combatVisualRenderer, undefined);
  assert.match(body.innerHTML, /No target/);
});
