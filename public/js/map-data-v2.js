import { gmcp } from './gmcp.js';
import {
  createMapDataV2,
  createMapDataV2WorldRepository,
  DIR_OFFSETS,
} from './map-data-v2-core.js';

export { createMapDataV2, createMapDataV2WorldRepository, DIR_OFFSETS };

const legacy = createMapDataV2({
  // Keep the legacy gmcp/connection cycle lazy; dev ESM evaluates this wrapper first.
  gmcp: { send: (...args) => gmcp.send(...args) },
});

export const hasLiveCurrent = legacy.hasLiveCurrent;
export const requestCurrentState = legacy.requestCurrentState;
export const resetForConnection = legacy.resetForConnection;
export const disposeMapDataLifecycle = legacy.disposeMapDataLifecycle;
export const configureWorld = legacy.configureWorld;
export const setMapStatus = legacy.setMapStatus;
export const isActive = legacy.isActive;
export const hasCurrentRoom = legacy.hasCurrentRoom;
export const hasPositionedCurrentRoom = legacy.hasPositionedCurrentRoom;
export const getCurrentRoomId = legacy.getCurrentRoomId;
export const getRoom = legacy.getRoom;
export const getMapStatus = legacy.getMapStatus;
export const getAreaName = legacy.getAreaName;
export const getAuthority = legacy.getAuthority;
export const getMapEpoch = legacy.getMapEpoch;
export const canWalkExit = legacy.canWalkExit;
export const getRoomsByArea = legacy.getRoomsByArea;
export const flushPendingMapSave = legacy.flushPendingMapSave;
export const load = legacy.load;
export const processCurrent = legacy.processCurrent;
export const mergeServerAreaData = legacy.mergeServerAreaData;
export const mergeServerUpdate = legacy.mergeServerUpdate;
export const requestAreaSync = legacy.requestAreaSync;
export const processSyncError = legacy.processSyncError;
export const clearMapDataForArea = legacy.clearMapDataForArea;
export const beginGlobalReset = legacy.beginGlobalReset;
export const clearMapData = legacy.clearMapData;
export const requestBrowse = legacy.requestBrowse;
export const mergeBrowseArea = legacy.mergeBrowseArea;
export const exitBrowse = legacy.exitBrowse;
export const getBrowseName = legacy.getBrowseName;
export const browseSource = legacy.browseSource;

if (typeof window !== 'undefined') window.mapDebug = legacy.debug;
