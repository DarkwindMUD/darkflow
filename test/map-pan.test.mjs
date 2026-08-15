import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeMapPan, splitMapPan, wireMapPan } = await import('../public/js/map-pan.js');

function makeBody() {
  const listeners = new Map();
  const classes = new Set();
  const frame = {
    dataset: { mapPitch: '40', mapPanOffsetX: '0', mapPanOffsetY: '0' },
    style: {},
  };
  return {
    dataset: {},
    frame,
    listeners,
    captured: null,
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    },
    addEventListener(type, handler, capture = false) {
      listeners.set(type + (capture ? ':capture' : ''), handler);
    },
    removeEventListener(type, handler, capture = false) {
      const key = type + (capture ? ':capture' : '');
      if (listeners.get(key) === handler) listeners.delete(key);
    },
    querySelector(selector) {
      return selector === '.map-grid-frame' ? this.frame : null;
    },
    setPointerCapture(pointerId) { this.captured = pointerId; },
    hasPointerCapture(pointerId) { return this.captured === pointerId; },
    releasePointerCapture() { this.captured = null; },
  };
}

function pointerEvent(overrides = {}) {
  return {
    pointerId: 7,
    clientX: 0,
    clientY: 0,
    button: 0,
    isPrimary: true,
    target: { closest: () => null },
    preventDefault() {},
    ...overrides,
  };
}

test('map pan values split into world cells and a visual remainder', () => {
  assert.equal(normalizeMapPan('bad'), 0);
  assert.deepEqual(splitMapPan(1.25, 40), { cells: 1, offset: 10 });
  assert.deepEqual(splitMapPan(-0.75, 40), { cells: -1, offset: 10 });
});

test('dragging empty map space updates pan coordinates and uses grabbing state', () => {
  const body = makeBody();
  let renders = 0;
  wireMapPan(body, { rerender: () => { renders++; } });

  body.listeners.get('pointerdown')(pointerEvent({ clientX: 20, clientY: 30 }));
  assert.equal(body.classList.contains('map-panning'), true);
  assert.equal(body.captured, 7);

  body.listeners.get('pointermove')(pointerEvent({ clientX: 60, clientY: 10 }));
  assert.equal(body.frame.style.transform, 'translate(40px,-20px)');

  body.listeners.get('pointerup')(pointerEvent({ clientX: 60, clientY: 10 }));
  assert.equal(body.dataset.mapPanX, '1');
  assert.equal(body.dataset.mapPanY, '-0.5');
  assert.equal(body.classList.contains('map-panning'), false);
  assert.equal(renders, 1);
});

test('room cells do not start a map drag', () => {
  const body = makeBody();
  wireMapPan(body);
  const roomTarget = { closest: (selector) => selector.includes('.map-tile-room') ? {} : null };

  body.listeners.get('pointerdown')(pointerEvent({ target: roomTarget }));

  assert.equal(body.classList.contains('map-panning'), false);
  assert.equal(body.captured, null);
});

test('a completed drag suppresses its follow-up click', () => {
  const body = makeBody();
  wireMapPan(body);
  body.listeners.get('pointerdown')(pointerEvent());
  body.listeners.get('pointermove')(pointerEvent({ clientX: 10 }));
  body.listeners.get('pointerup')(pointerEvent({ clientX: 10 }));

  let prevented = false;
  let stopped = false;
  body.listeners.get('click:capture')({
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => { stopped = true; },
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('map pan disposer removes listeners and permits a clean rewire', () => {
  const body = makeBody();
  const dispose = wireMapPan(body);
  const firstPointerDown = body.listeners.get('pointerdown');

  dispose();
  assert.equal(body.listeners.size, 0);
  assert.equal(body.dataset.mapPanWired, undefined);

  const nextDispose = wireMapPan(body);
  assert.notEqual(body.listeners.get('pointerdown'), firstPointerDown);
  nextDispose();
});
