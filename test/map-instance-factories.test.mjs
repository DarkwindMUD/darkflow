import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMapDataV2,
  createMapDataV2WorldRepository,
} from '../public/js/map-data-v2-core.js';
import {
  createLearnedMap,
  createLearnedMapWorldRepository,
} from '../public/js/map-data-gmcp-core.js';
import { createLiveMapSource } from '../public/js/live-map-source-core.js';
import { createMapRenderer } from '../public/js/map-renderer-core.js';
import { createMapSpeedwalk } from '../public/js/map-speedwalk-core.js';

const storage = {
  loadMapAreas: async () => [],
  saveMapArea: async () => {},
  deleteMapArea: async () => {},
  clearMapSource: async () => {},
  pruneMapAreas: async () => {},
};

test('MapData2 instances share durable graph data but isolate live session state', () => {
  const worldRepository = createMapDataV2WorldRepository();
  const create = () => createMapDataV2({
    ...storage,
    worldRepository,
    worldKey: 'shared',
    gmcp: { send() {} },
  });
  const first = create();
  const second = create();

  first.processCurrent({
    protocol: 2,
    id: 'A',
    name: 'First',
    area: 'Town',
    positioned: true,
    x: 0,
    y: 0,
    z: 0,
    exits: { east: 'B' },
    liveExits: { east: 'B' },
    liveDoors: {},
  });
  first.setMapStatus('first-only');
  first.mergeBrowseArea({
    catalog: 'browse-a',
    replace: true,
    center: 'browse-room',
    rooms: [{ id: 'browse-room', area: 'browse-a', positioned: true, x: 0, y: 0, z: 0 }],
  });
  assert.equal(first.browseSource.isActive(), true);
  first.exitBrowse();
  assert.equal(first.browseSource.isActive(), false);

  assert.equal(second.getRoom('A').name, 'First', 'durable graph is shared');
  assert.equal(second.getCurrentRoomId(), null, 'current pointer is private');
  assert.equal(second.getRoom('A').hasLiveObservation, false, 'live exits are private');
  assert.equal(second.getMapStatus(), '');
  assert.equal(second.browseSource.getCurrentRoomId(), null);

  second.processCurrent({
    protocol: 2,
    id: 'B',
    name: 'Second',
    area: 'Town',
    positioned: true,
    x: 1,
    y: 0,
    z: 0,
    exits: { west: 'A' },
    liveExits: { west: 'A' },
    liveDoors: {},
  });
  assert.equal(first.getCurrentRoomId(), 'A');
  assert.equal(first.getRoom('A').liveExits.east, 'B');
  assert.equal(second.getRoom('A').hasLiveObservation, false);

  first.disposeMapDataLifecycle();
  second.disposeMapDataLifecycle();
});

test('learned-map instances share learned rooms but isolate current observations', () => {
  const worldRepository = createLearnedMapWorldRepository();
  const create = () => createLearnedMap({ ...storage, worldRepository, worldKey: 'shared' });
  const first = create();
  const second = create();

  first.processRoomInfo({ num: 1, name: 'One', area: 'Town', exits: { east: 2 } });
  assert.equal(second.getRoom('1').name, 'One');
  assert.equal(second.getCurrentRoomId(), null);
  assert.equal(second.getRoom('1').hasLiveObservation, false);

  second.processRoomInfo({ num: 2, name: 'Two', area: 'Town', exits: { west: 1 } });
  assert.equal(first.getCurrentRoomId(), '1');
  assert.equal(first.getRoom('1').liveExits.east, '2');
  assert.equal(second.getRoom('1').hasLiveObservation, false);

  first.disposeMapDataLifecycle();
  second.disposeMapDataLifecycle();
});

test('explicit world keys take precedence over endpoint-derived keys', async () => {
  const authoritativeRepository = createMapDataV2WorldRepository();
  const authoritative = createMapDataV2({
    ...storage,
    worldRepository: authoritativeRepository,
    worldKey: 'shared',
    gmcp: { send() {} },
  });
  authoritative.processCurrent({
    protocol: 2,
    id: 'A',
    name: 'Authoritative',
    area: 'Town',
    positioned: true,
    x: 0,
    y: 0,
    z: 0,
    exits: {},
    liveExits: {},
    liveDoors: {},
  });
  const authoritativePeer = createMapDataV2({
    ...storage,
    worldRepository: authoritativeRepository,
    worldKey: 'other',
    gmcp: { send() {} },
  });
  await authoritativePeer.configureWorld({
    worldKey: 'shared',
    host: 'different.example',
    port: 4444,
  });
  assert.equal(authoritativePeer.getRoom('A').name, 'Authoritative');

  const learnedRepository = createLearnedMapWorldRepository();
  const learned = createLearnedMap({
    ...storage,
    worldRepository: learnedRepository,
    worldKey: 'shared',
  });
  learned.processRoomInfo({ num: 1, name: 'Learned', area: 'Town', exits: {} });
  const learnedPeer = createLearnedMap({
    ...storage,
    worldRepository: learnedRepository,
    worldKey: 'other',
  });
  await learnedPeer.configureWorld({
    worldKey: 'shared',
    host: 'different.example',
    port: 4444,
  });
  assert.equal(learnedPeer.getWorldKey(), 'shared');
  assert.equal(learnedPeer.getRoom('1').name, 'Learned');

  authoritative.disposeMapDataLifecycle();
  authoritativePeer.disposeMapDataLifecycle();
  learned.disposeMapDataLifecycle();
  learnedPeer.disposeMapDataLifecycle();
});

test('live-source watchdog and disposal are isolated per selector', () => {
  const callbacks = [];
  const cancelled = [];
  const makeMap = () => ({
    live: true,
    current: true,
    hasCurrentRoom() { return this.current; },
    hasLiveCurrent() { return this.live; },
    configureWorld() {},
    resetForConnection() { this.live = false; },
  });
  const makeSelector = () => {
    const darkwindMap = makeMap();
    const gmcpMap = {
      configureWorld() {}, resetForConnection() {}, processHello() {}, processRoomInfo() {},
    };
    return {
      darkwindMap,
      gmcpMap,
      selector: createLiveMapSource({
        darkwindMap,
        gmcpMap,
        setTimeout(callback) {
          const timer = { callback };
          callbacks.push(timer);
          return timer;
        },
        clearTimeout(timer) { cancelled.push(timer); },
      }),
    };
  };
  const first = makeSelector();
  const second = makeSelector();
  first.selector.markMapData2Active();
  second.selector.markMapData2Active();
  first.selector.resetLiveMapModeForConnection();
  second.selector.resetLiveMapModeForConnection();

  assert.equal(callbacks.length, 2);
  first.selector.disposeLiveMapSourceLifecycle();
  assert.ok(cancelled.includes(callbacks[0]));
  assert.ok(!cancelled.includes(callbacks[1]));
  callbacks[1].callback();
  assert.equal(second.selector.getLiveMapSource(), second.gmcpMap);
});

test('live-source identity follows an explicit world key', async () => {
  let identity = { worldKey: 'first', host: 'same.example', port: 4444 };
  const darkwindMap = {
    current: true,
    hasCurrentRoom() { return this.current; },
    hasLiveCurrent() { return this.current; },
    configureWorld() {},
    resetForConnection() {},
  };
  const gmcpMap = { configureWorld() {}, resetForConnection() {} };
  const selector = createLiveMapSource({
    darkwindMap,
    gmcpMap,
    getIdentity: () => identity,
  });

  await selector.resetLiveMapModeForConnection();
  selector.markMapData2Active();
  assert.equal(selector.getLiveMapSource(), darkwindMap);

  identity = { worldKey: 'second', host: 'same.example', port: 4444 };
  await selector.resetLiveMapModeForConnection();
  assert.equal(selector.getLiveMapSource(), gmcpMap);
  selector.disposeLiveMapSourceLifecycle();
});

function rendererSource(positionedId) {
  const rooms = new Map([
    ['P', { id: 'P', name: 'P', area: 'Town', environment: '', x: 0, y: 0, z: 0, exits: {} }],
    ['Q', { id: 'Q', name: 'Q', area: 'Town', environment: '', x: 4, y: 0, z: 0, exits: {} }],
    ['U', { id: 'U', name: 'U', area: 'Town', environment: '', x: null, y: null, z: null, exits: {} }],
  ]);
  let currentId = positionedId;
  return {
    DIR_OFFSETS: {},
    setCurrent(id) { currentId = id; },
    getCurrentRoomId: () => currentId,
    getRoom: (id) => rooms.get(id),
    getRoomsByArea: () => [...rooms.values()].filter((room) => room.x !== null),
    getAreaName: () => 'Town',
    getAuthority: () => 'authoritative',
    getMapStatus: () => '',
  };
}

function rendererBody() {
  return {
    dataset: {},
    clientWidth: 320,
    clientHeight: 240,
    innerHTML: '',
    querySelector: () => null,
  };
}

test('renderer remembered centers and disposal are instance-owned', () => {
  const first = createMapRenderer();
  const second = createMapRenderer();
  const firstSource = rendererSource('P');
  const secondSource = rendererSource('Q');
  first.render(rendererBody(), firstSource);
  second.render(rendererBody(), secondSource);
  firstSource.setCurrent('U');
  secondSource.setCurrent('U');
  first.render(rendererBody(), firstSource);
  second.render(rendererBody(), secondSource);

  assert.equal(first.getDebug().centerRoom.id, 'P');
  assert.equal(second.getDebug().centerRoom.id, 'Q');
  first.dispose();
  assert.equal(first.getDebug(), null);
  assert.equal(second.getDebug().centerRoom.id, 'Q');
});

test('speedwalk timers and disposal are instance-owned', () => {
  const timers = [];
  const makeSource = () => {
    const rooms = new Map([
      ['A', { id: 'A', name: 'A', area: 'Town', exits: { east: 'B' } }],
      ['B', { id: 'B', name: 'B', area: 'Town', exits: {} }],
    ]);
    return {
      getCurrentRoomId: () => 'A',
      getRoom: (id) => rooms.get(id),
      canWalkExit: () => true,
      setMapStatus() {},
    };
  };
  const sentFirst = [];
  const sentSecond = [];
  const create = (sent) => createMapSpeedwalk({
    source: makeSource(),
    send: (command) => sent.push(command),
    setTimeout(callback) {
      const timer = { callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cancelled = true; },
  });
  const first = create(sentFirst);
  const second = create(sentSecond);
  first.start('B');
  second.start('B');
  first.dispose();

  assert.equal(timers[0].cancelled, true);
  assert.equal(timers[1].cancelled, false);
  timers[0].callback();
  assert.deepEqual(sentFirst, ['east']);
  assert.equal(second.isSpeedwalking(), true);
});
