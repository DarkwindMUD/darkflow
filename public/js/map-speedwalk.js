// Legacy singleton wiring for click-to-walk. New session owners use the
// injected core directly and subscribe it to validated Session capabilities.
import * as mapData from './map-data-v2.js';
import { gmcp } from './gmcp.js';
import { createMapSpeedwalk, findPath as findPathCore } from './map-speedwalk-core.js';
import {
  disposeControllerLifecycle,
  installControllerLifecycle,
} from './session-compat/controllers.js';

export { createMapSpeedwalk } from './map-speedwalk-core.js';

const DEFAULT_STEP_TIMEOUT_MS = 5000;
const speedwalkController = {};
const legacy = createMapSpeedwalk({ source: mapData });
let legacySource = () => mapData;
let initialized = false;

export function initSpeedwalk(options = {}) {
  initialized = true;
  legacySource = typeof options.source === 'function' ? options.source : () => mapData;
  legacy.configure({
    source: typeof options.source === 'function' ? options.source : mapData,
    send: options.send || (() => false),
    rerender: options.rerender || (() => {}),
    stepTimeoutMs: options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
  });
  return installControllerLifecycle(
    speedwalkController,
    'map-speedwalk',
    gmcp,
    (scopedGmcp, lifecycle) => {
      scopedGmcp.on('Darkwind.MapData2.Current', (data) => {
        if (legacySource() !== mapData) return;
        if (!data || data.id === undefined || data.id === null) return;
        const roomId = String(data.id);
        queueMicrotask(() => {
          if (legacySource() === mapData) legacy.notifyRoomChange(roomId);
        });
      });
      scopedGmcp.on('Room.Info', (data) => {
        if (legacySource() === mapData) return;
        const id = data && (data.num !== undefined ? data.num
          : data.id !== undefined ? data.id
          : data.vnum);
        if (id === undefined || id === null) return;
        const roomId = String(id);
        queueMicrotask(() => {
          if (legacySource() !== mapData) legacy.notifyRoomChange(roomId);
        });
      });
      if (typeof document !== 'undefined') {
        lifecycle.listen(document, 'dw:connectionstate', (event) => {
          if (!event.detail || event.detail.state !== 'connected') {
            legacy.cancel('disconnected');
          }
        });
      }
    },
    () => {
      initialized = false;
      legacy.dispose();
    },
  );
}

export function disposeSpeedwalk() {
  disposeControllerLifecycle(speedwalkController);
}

export function findPath(fromId, toId, source = mapData) {
  return findPathCore(fromId, toId, source);
}

export const isSpeedwalking = legacy.isSpeedwalking;
export function startSpeedwalk(targetId, source) {
  return initialized ? legacy.start(targetId, source) : false;
}
export const cancelSpeedwalk = legacy.cancel;
export const notifyRoomChange = legacy.notifyRoomChange;
