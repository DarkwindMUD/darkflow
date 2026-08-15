import {
  createLearnedMap,
  createLearnedMapWorldRepository,
  DIR_OFFSETS,
} from './map-data-gmcp-core.js';

export { createLearnedMap, createLearnedMapWorldRepository, DIR_OFFSETS };

const legacy = createLearnedMap();

export const setMapStatus = legacy.setMapStatus;
export const configureWorld = legacy.configureWorld;
export const resetForConnection = legacy.resetForConnection;
export const disposeMapDataLifecycle = legacy.disposeMapDataLifecycle;
export const processHello = legacy.processHello;
export const processRoomInfo = legacy.processRoomInfo;
export const flushPendingMapSave = legacy.flushPendingMapSave;
export const load = legacy.load;
export const clearMapDataForArea = legacy.clearMapDataForArea;
export const clearMapData = legacy.clearMapData;
export const isActive = legacy.isActive;
export const hasCurrentRoom = legacy.hasCurrentRoom;
export const hasPositionedCurrentRoom = legacy.hasPositionedCurrentRoom;
export const getCurrentRoomId = legacy.getCurrentRoomId;
export const getRoom = legacy.getRoom;
export const getRoomsByArea = legacy.getRoomsByArea;
export const getAreaName = legacy.getAreaName;
export const getAuthority = legacy.getAuthority;
export const canWalkExit = legacy.canWalkExit;
export const getMapStatus = legacy.getMapStatus;
export const getWorldKey = legacy.getWorldKey;
export const getStorageError = legacy.getStorageError;
export const getClearMapActionLabel = legacy.getClearMapActionLabel;
export const getClearMapActionTitle = legacy.getClearMapActionTitle;
