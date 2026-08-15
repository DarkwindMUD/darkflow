import * as darkwindMap from './map-data-v2.js';
import * as gmcpMap from './map-data-gmcp.js';
import { createLiveMapSource } from './live-map-source-core.js';
import { dom } from './state.js';

export { createLiveMapSource } from './live-map-source-core.js';

const legacy = createLiveMapSource({
  darkwindMap,
  gmcpMap,
  getIdentity: () => ({
    host: dom.host && dom.host.value,
    port: dom.port && dom.port.value,
  }),
  notifySourceChanged: () => {
    if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return;
    document.dispatchEvent(new CustomEvent('darkflow:map-source-changed'));
  },
});

export const getLiveMapSource = legacy.getLiveMapSource;
export const resetLiveMapModeForConnection = legacy.resetLiveMapModeForConnection;
export const disposeLiveMapSourceLifecycle = legacy.disposeLiveMapSourceLifecycle;
export const markMapData2Active = legacy.markMapData2Active;
export const markMapData2Unavailable = legacy.markMapData2Unavailable;
export const processGenericHello = legacy.processGenericHello;
export const processGenericRoomInfo = legacy.processGenericRoomInfo;
export const notifyLiveRoomChange = legacy.notifyLiveRoomChange;
