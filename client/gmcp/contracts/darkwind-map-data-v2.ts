/** JSON boolean or the 0/1 integer emitted by LDMud. */
export type MapData2WireBoolean = boolean | 0 | 1;

/** Stable room identifier. LDMud emits numeric ids; cached/foreign ids may be strings. */
export type MapData2RoomId = string | number;

/** Shared MapData2 room record (docs/gmcp-darkwind-mapdata-v2.md:33-53). */
export interface MapData2RoomRecord {
  id: MapData2RoomId;
  name?: string;
  area?: string;
  env?: string;
  observed?: MapData2WireBoolean;
  observedAt?: number;
  layoutState?: string;
  positioned?: MapData2WireBoolean;
  x?: number;
  y?: number;
  z?: number;
  coordSource?: string;
  version?: number;
  exits?: Record<string, MapData2RoomId>;
  exitKinds?: Record<string, string>;
  exitDoors?: Record<string, number>;
  walkSafe?: Record<string, MapData2WireBoolean>;
  details?: string[];
  [key: string]: unknown;
}

/** Darkwind.MapData2.Current inbound payload (docs/gmcp-darkwind-mapdata-v2.md:64-76). */
export interface MapData2Current extends MapData2RoomRecord {
  protocol?: number;
  mapEpoch?: string;
  areaGeneration?: number;
  areaVersion?: number;
  areaName?: string;
  liveExits?: Record<string, MapData2RoomId>;
  liveDoors?: Record<string, number>;
  syncId?: string | 0;
  fromCursor?: MapData2RoomId;
}

/** Darkwind.MapData2.Area inbound payload (docs/gmcp-darkwind-mapdata-v2.md:128-131). */
export interface MapData2Area {
  area: string;
  rooms: MapData2RoomRecord[];
  version?: number;
  more?: MapData2WireBoolean;
  replace?: MapData2WireBoolean;
  areaGeneration?: number;
  mapEpoch?: string;
  [key: string]: unknown;
}

/** Darkwind.MapData2.Update inbound payload (docs/gmcp-darkwind-mapdata-v2.md:100-114,133-141). */
export interface MapData2Update {
  area: string;
  protocol?: number;
  mapEpoch?: string;
  areaGeneration?: number;
  since?: number;
  snapshotVersion?: number;
  latestVersion?: number;
  cursor?: string | number;
  complete?: MapData2WireBoolean;
  replace?: MapData2WireBoolean;
  rooms?: MapData2RoomRecord[];
  version?: number;
  offset?: number;
  more?: MapData2WireBoolean;
  syncId?: string | 0;
  fromCursor?: MapData2RoomId;
  [key: string]: unknown;
}

/** Darkwind.MapData2.Error inbound payload (docs/gmcp-darkwind-mapdata-v2.md:122-124). */
export interface MapData2Error {
  protocol?: number;
  code?: string;
  reason?: string;
  area?: string;
  restart?: MapData2WireBoolean;
  current?: MapData2WireBoolean;
  unavailable?: MapData2WireBoolean;
  mapEpoch?: string;
  areaGeneration?: number;
  retryAfterMs?: number;
  syncId?: string | 0;
  fromCursor?: MapData2RoomId;
  [key: string]: unknown;
}

/** Darkwind.MapData2.BrowseArea inbound payload (docs/gmcp-darkwind-mapdata-v2.md:150-152). */
export interface MapData2BrowseArea {
  catalog: string;
  name?: string;
  center?: MapData2RoomId;
  rooms?: MapData2RoomRecord[];
  more?: MapData2WireBoolean;
  replace?: MapData2WireBoolean;
  offset?: number;
  [key: string]: unknown;
}

/** Darkwind.MapData2.Reset inbound payload (docs/gmcp-darkwind-mapdata-v2.md:154-158). */
export interface MapData2Reset {
  scope?: string;
  area?: string;
  areaGeneration?: number;
  mapEpoch?: string;
  [key: string]: unknown;
}

interface MapData2SyncCorrelation {
  mapEpoch?: string;
  syncId?: string;
  cursor?: MapData2RoomId;
  fromCursor?: MapData2RoomId;
}

/** Context-only Darkwind.MapData2.Sync request used to recover Current. */
export type MapData2ContextSync = MapData2SyncCorrelation &
  (
    | { protocol: 2; current: true | 1; state?: MapData2WireBoolean }
    | { protocol: 2; state: true | 1; current?: MapData2WireBoolean }
  );

/** Area Darkwind.MapData2.Sync request for v1 or correlated v2 paging. */
export interface MapData2AreaSync extends MapData2SyncCorrelation {
  area: string;
  protocol?: 2;
  current?: MapData2WireBoolean;
  state?: MapData2WireBoolean;
  generation?: number;
  since?: number;
  snapshotVersion?: number;
  version?: number;
  offset?: number;
  [key: string]: unknown;
}

/** Darkwind.MapData2.Sync outbound payload (docs/gmcp-darkwind-mapdata-v2.md:86-95). */
export type MapData2Sync = MapData2ContextSync | MapData2AreaSync;

/** Darkwind.MapData2.Browse outbound payload (docs/gmcp-darkwind-mapdata-v2.md:149). */
export interface MapData2Browse {
  catalog: string;
  offset?: number;
  [key: string]: unknown;
}
