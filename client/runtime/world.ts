import type typia from "typia";

import { deepFreeze } from "../configuration/snapshot";
import type {
  MapData2Area,
  MapData2Browse,
  MapData2BrowseArea,
  MapData2Current,
  MapData2Error,
  MapData2Reset,
  MapData2RoomId,
  MapData2Sync,
  MapData2Update,
} from "../gmcp/contracts/darkwind-map-data-v2.ts";
import type {
  RoomAddPlayer,
  RoomInfo,
  RoomPlayer,
  RoomPlayers,
  RoomRemovePlayer,
} from "../gmcp/contracts/room.ts";
import type {
  DarkwindRoomImage,
  DarkwindRoomPlaylistAction,
  DarkwindRoomPlaylistOpen,
  DarkwindRoomPlaylistReport,
  DarkwindRoomPlaylistState,
} from "../gmcp/contracts/world.ts";
import {
  validateDarkwindRoomImage,
  validateDarkwindRoomPlaylistOpen,
  validateDarkwindRoomPlaylistState,
  validateMapData2Area,
  validateMapData2BrowseArea,
  validateMapData2Current,
  validateMapData2Error,
  validateMapData2Reset,
  validateMapData2Update,
  validateRoomAddPlayer,
  validateRoomInfo,
  validateRoomPlayers,
  validateRoomRemovePlayer,
} from "../gmcp/contracts/validators";
import type { SessionGmcpBus } from "../gmcp/bus.ts";
import type { TransportReconnectStatusPayload } from "../transport/types.ts";
// @ts-expect-error Retained map controller is JavaScript without a declaration file.
import * as learnedMapCore from "../../public/js/map-data-gmcp-core.js";
// @ts-expect-error Retained map controller is JavaScript without a declaration file.
import * as mapDataV2Core from "../../public/js/map-data-v2-core.js";
// @ts-expect-error Retained live source selector is JavaScript without a declaration file.
import * as liveMapSourceCore from "../../public/js/live-map-source-core.js";
// @ts-expect-error Retained speedwalk controller is JavaScript without a declaration file.
import * as mapSpeedwalkCore from "../../public/js/map-speedwalk-core.js";
// @ts-expect-error Retained playlist normalizer is JavaScript without a declaration file.
import { normalizePlaylistState } from "../../public/js/room-playlist-core.mjs";
import type { SessionEventBus } from "./event-bus.ts";
import type { Unsubscribe } from "./events.ts";
import type { ResourceScope } from "./resource-scope.ts";

const mapDataWorldRepository = mapDataV2Core.createMapDataV2WorldRepository();
const learnedMapWorldRepository = learnedMapCore.createLearnedMapWorldRepository();
const MAX_ROOM_PLAYERS = 512;

export const WORLD_PANEL_IDS = ["room", "map", "areaMap", "roomImage", "roomPlaylist"] as const;
export type WorldPanelId = (typeof WORLD_PANEL_IDS)[number];

export interface WorldMapRoom {
  readonly id: string;
  readonly name?: string;
  readonly area?: string;
  readonly x?: number | null;
  readonly y?: number | null;
  readonly z?: number | null;
  readonly exits?: Readonly<Record<string, string>>;
  readonly exitDoors?: Readonly<Record<string, number>>;
  readonly [key: string]: unknown;
}

/** Stable, renderer-compatible adapter that never exposes retained mutable graph records. */
export interface WorldMapSource {
  readonly isBrowse?: boolean;
  readonly DIR_OFFSETS: Readonly<
    Record<string, { readonly dx: number; readonly dy: number; readonly dz: number }>
  >;
  isActive(): boolean;
  hasCurrentRoom(): boolean;
  hasPositionedCurrentRoom(): boolean;
  getCurrentRoomId(): string | null;
  getRoom(id: MapData2RoomId | null): WorldMapRoom | null;
  getRoomsByArea(area?: string): readonly WorldMapRoom[];
  getMapStatus(): string;
  getAreaName(): string;
  getAuthority(): "authoritative" | "learned" | "browse";
  getMapEpoch(): string;
  canWalkExit(room: WorldMapRoom | null, direction: string, destinationId: string): boolean;
  getClearMapActionLabel(): string;
  getClearMapActionTitle(): string;
  clearMapDataForArea(area: string): void;
}

export interface SessionRoomImageSnapshot extends DarkwindRoomImage {
  readonly roomId: string;
  readonly generation: number;
}

export interface SessionPlaylistEntry {
  readonly id: number;
  readonly video_id: string;
  readonly title: string;
  readonly added_by: string;
  readonly duration: number;
  readonly can_remove: boolean;
}

export type SessionPlaylistSnapshot =
  | {
      readonly enabled: false;
      readonly room_id: MapData2RoomId | null;
      readonly server_time: number;
    }
  | {
      readonly enabled: true;
      readonly room_id: MapData2RoomId | null;
      readonly revision: number;
      readonly server_time: number;
      readonly name: string;
      readonly playback: {
        readonly status: "stopped" | "playing" | "paused" | "paused_empty";
        readonly position: number;
        readonly start_at: number;
        readonly current: SessionPlaylistEntry | null;
      };
      readonly queue: readonly SessionPlaylistEntry[];
      readonly skip_votes: number;
      readonly skip_needed: number;
      readonly permissions: { readonly add: boolean; readonly moderate: boolean };
    };

export interface SessionWorldSnapshot {
  readonly connected: boolean;
  readonly sourceVersion: number;
  readonly source: WorldMapSource;
  readonly browseSource: WorldMapSource;
  readonly browseOpenVersion: number;
  readonly speedwalking: boolean;
  readonly room: RoomInfo | null;
  readonly players: readonly RoomPlayer[];
  readonly roomGeneration: number;
  readonly roomImage: SessionRoomImageSnapshot | null;
  readonly playlist: SessionPlaylistSnapshot;
  readonly playlistFresh: boolean;
  readonly playlistOpenVersion: number;
}

/** Public Step 8 capability; retained controllers and protocol transport stay private. */
export interface SessionWorld {
  getSnapshot(): SessionWorldSnapshot;
  subscribe(listener: (snapshot: SessionWorldSnapshot) => void): Unsubscribe;
  setVisiblePanels(ids: readonly WorldPanelId[]): void;
  browseArea(catalog: string): boolean;
  closeBrowse(): void;
  resyncCurrentArea(): boolean;
  speedwalkTo(roomId: MapData2RoomId): boolean;
  cancelSpeedwalk(): void;
  refreshMedia(): boolean;
  addPlaylistUrl(url: string): boolean;
  removePlaylistEntry(number: number): boolean;
  movePlaylistEntry(from: number, to: number): boolean;
  votePlaylistSkip(): boolean;
  pausePlaylist(): boolean;
  resumePlaylist(): boolean;
  skipPlaylist(): boolean;
  reportPlaylistReady(title: string, duration: number): boolean;
  reportPlaylistEnded(): boolean;
  reportPlaylistError(code: number): boolean;
}

export interface SessionWorldIdentity {
  worldKey: string;
  host: string;
  port: string | number;
}

type PayloadValidator<T> = (input: unknown) => typia.IValidation<T>;
type RetainedMapSource = Record<string, unknown> & {
  DIR_OFFSETS: Record<string, { dx: number; dy: number; dz: number }>;
  isActive(): boolean;
  hasCurrentRoom(): boolean;
  hasPositionedCurrentRoom?(): boolean;
  getCurrentRoomId(): string | null;
  getRoom(id: MapData2RoomId | null): WorldMapRoom | null;
  getRoomsByArea(area?: string): WorldMapRoom[];
  getMapStatus(): string;
  getAreaName(): string;
  getAuthority?(): "authoritative" | "learned";
  getMapEpoch?(): string;
  canWalkExit?(room: WorldMapRoom | null, direction: string, destinationId: string): boolean;
  getClearMapActionLabel?(): string;
  getClearMapActionTitle?(): string;
  clearMapDataForArea(area: string, reset?: MapData2Reset): void;
};
type RetainedMapData = RetainedMapSource & {
  browseSource: RetainedMapSource;
  load(): Promise<void>;
  processCurrent(data: MapData2Current): number;
  mergeServerAreaData(data: MapData2Area): number;
  mergeServerUpdate(data: MapData2Update): number;
  processSyncError(data: MapData2Error): void;
  mergeBrowseArea(data: MapData2BrowseArea): number;
  beginGlobalReset(data: MapData2Reset): void;
  requestBrowse(catalog: string): void;
  exitBrowse(): void;
  flushPendingMapSave(): void;
  disposeMapDataLifecycle(): void;
};
type RetainedLearnedMap = RetainedMapSource & {
  load(): Promise<void>;
  flushPendingMapSave(): void;
  disposeMapDataLifecycle(): void;
};
type PlaylistActionInput =
  | { action: "add"; url: string }
  | { action: "remove"; number: number }
  | { action: "move"; from: number; to: number }
  | { action: "vote_skip" | "pause" | "resume" | "skip" };
type PlaylistReportInput =
  | { report: "ready"; title: string; duration: number }
  | { report: "ended" }
  | { report: "error"; code: number };

function roomIdFrom(data: RoomInfo): string | null {
  const id = data.num ?? data.id;
  return id === undefined || id === null ? null : String(id);
}

function initialPlaylist(): SessionPlaylistSnapshot {
  return { enabled: false, room_id: null, server_time: 0 };
}

/** Creates one validated session view over application-shared, world-keyed map graphs. */
export function createSessionWorld(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
  identity: SessionWorldIdentity,
  sendCommand: (command: string) => boolean,
): SessionWorld {
  let connected = false;
  let sourceVersion = 0;
  let browseOpenVersion = 0;
  let playlistOpenVersion = 0;
  let roomGeneration = 0;
  let room: RoomInfo | null = null;
  let players: readonly RoomPlayer[] = [];
  let roomImage: SessionRoomImageSnapshot | null = null;
  let playlist = deepFreeze(initialPlaylist());
  let playlistFresh = false;
  let browseCatalog = "";
  let disposed = false;
  const listeners = new Set<(snapshot: SessionWorldSnapshot) => void>();

  const mapData = mapDataV2Core.createMapDataV2({
    worldRepository: mapDataWorldRepository,
    worldKey: identity.worldKey,
    gmcp: {
      send(packageName: string, payload: unknown): boolean {
        if (packageName === "Darkwind.MapData2.Sync") {
          return gmcp.sendMapData2Sync(payload as MapData2Sync);
        }
        if (packageName === "Darkwind.MapData2.Browse") {
          return gmcp.sendMapData2Browse(payload as MapData2Browse);
        }
        return false;
      },
    },
  }) as RetainedMapData;
  const learnedMap = learnedMapCore.createLearnedMap({
    worldRepository: learnedMapWorldRepository,
    worldKey: identity.worldKey,
  }) as RetainedLearnedMap;

  const selector = liveMapSourceCore.createLiveMapSource({
    darkwindMap: mapData,
    gmcpMap: learnedMap,
    getIdentity: () => ({ ...identity }),
    notifySourceChanged: () => publish(),
  });

  const currentRetainedSource = (): RetainedMapSource =>
    selector.getLiveMapSource() as RetainedMapSource;
  const speedwalk = mapSpeedwalkCore.createMapSpeedwalk({
    source: () => currentRetainedSource(),
    send: sendCommand,
    rerender: publish,
  });

  const readonlyRoom = (value: WorldMapRoom | null | undefined): WorldMapRoom | null =>
    value ? deepFreeze(structuredClone(value)) : null;
  const readonlyRooms = (values: WorldMapRoom[]): readonly WorldMapRoom[] =>
    deepFreeze(structuredClone(values));

  const makeSource = (browse: boolean): WorldMapSource => {
    const retained = (): RetainedMapSource =>
      browse ? mapData.browseSource : currentRetainedSource();
    return deepFreeze({
      ...(browse ? { isBrowse: true } : {}),
      DIR_OFFSETS: deepFreeze(structuredClone(mapData.DIR_OFFSETS)),
      isActive: () => retained().isActive(),
      hasCurrentRoom: () => retained().hasCurrentRoom(),
      hasPositionedCurrentRoom: () =>
        retained().hasPositionedCurrentRoom?.() ??
        retained().getRoom(retained().getCurrentRoomId())?.x != null,
      getCurrentRoomId: () => retained().getCurrentRoomId(),
      getRoom: (id: MapData2RoomId | null) => readonlyRoom(retained().getRoom(id)),
      getRoomsByArea: (area?: string) => readonlyRooms(retained().getRoomsByArea(area)),
      getMapStatus: () => retained().getMapStatus(),
      getAreaName: () => retained().getAreaName(),
      getAuthority: () => (browse ? "browse" : (retained().getAuthority?.() ?? "learned")),
      getMapEpoch: () => retained().getMapEpoch?.() ?? "",
      canWalkExit: (value: WorldMapRoom | null, direction: string, destinationId: string) =>
        retained().canWalkExit?.(value, direction, destinationId) ?? false,
      getClearMapActionLabel: () => retained().getClearMapActionLabel?.() ?? "Resync",
      getClearMapActionTitle: () =>
        retained().getClearMapActionTitle?.() ?? "Clear and resync map for this area",
      clearMapDataForArea: (area: string) => {
        if (!browse && area) {
          retained().clearMapDataForArea(area);
          publish();
        }
      },
    });
  };

  const source = makeSource(false);
  const browseSource = makeSource(true);
  let snapshot: SessionWorldSnapshot;

  function makeSnapshot(): SessionWorldSnapshot {
    return deepFreeze({
      connected,
      sourceVersion,
      source,
      browseSource,
      browseOpenVersion,
      speedwalking: speedwalk.isSpeedwalking(),
      room,
      players,
      roomGeneration,
      roomImage,
      playlist,
      playlistFresh,
      playlistOpenVersion,
    });
  }

  function publish(): void {
    if (disposed) return;
    sourceVersion += 1;
    snapshot = makeSnapshot();
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(snapshot);
    }
  }

  snapshot = makeSnapshot();

  void Promise.all([mapData.load(), learnedMap.load()]).then(() => publish());

  const listen = <T>(
    packageName: string,
    validate: PayloadValidator<T>,
    apply: (data: T) => void,
  ): void => {
    const handler = (data: unknown): void => {
      const result = validate(data);
      if (result.success) apply(structuredClone(result.data));
    };
    gmcp.on(packageName, handler);
    scope.own("listener", () => gmcp.off(packageName, handler));
  };

  listen<RoomInfo>("Room.Info", validateRoomInfo, (data) => {
    const previousRoomId = room ? roomIdFrom(room) : null;
    const nextRoom = { ...(room ?? {}), ...data };
    const nextRoomId = roomIdFrom(nextRoom);
    if (nextRoomId !== previousRoomId) {
      roomGeneration += 1;
      roomImage = null;
      players = [];
    }
    room = deepFreeze(nextRoom);
    selector.processGenericRoomInfo(data);
    if (selector.getLiveMapSource() === learnedMap && nextRoomId) {
      speedwalk.notifyRoomChange(nextRoomId);
    }
    publish();
  });
  listen<RoomPlayers>("Room.Players", validateRoomPlayers, (data) => {
    players = deepFreeze(Array.isArray(data) ? data.slice(0, MAX_ROOM_PLAYERS) : []);
    publish();
  });
  listen<RoomAddPlayer>("Room.AddPlayer", validateRoomAddPlayer, (data) => {
    players = deepFreeze([...players, data].slice(-MAX_ROOM_PLAYERS));
    publish();
  });
  listen<RoomRemovePlayer>("Room.RemovePlayer", validateRoomRemovePlayer, (data) => {
    const name = typeof data === "string" ? data : data.name;
    players = deepFreeze(players.filter((player) => player.name !== name));
    publish();
  });

  listen<MapData2Current>("Darkwind.MapData2.Current", validateMapData2Current, (data) => {
    mapData.processCurrent(data);
    selector.markMapData2Active();
    speedwalk.notifyRoomChange(String(data.id));
    publish();
  });
  listen<MapData2Area>("Darkwind.MapData2.Area", validateMapData2Area, (data) => {
    mapData.mergeServerAreaData(data);
    publish();
  });
  listen<MapData2Update>("Darkwind.MapData2.Update", validateMapData2Update, (data) => {
    mapData.mergeServerUpdate(data);
    publish();
  });
  listen<MapData2Error>("Darkwind.MapData2.Error", validateMapData2Error, (data) => {
    mapData.processSyncError(data);
    selector.markMapData2Unavailable(data);
    publish();
  });
  listen<MapData2BrowseArea>("Darkwind.MapData2.BrowseArea", validateMapData2BrowseArea, (data) => {
    const opensBrowse =
      data.replace === true || data.replace === 1 || data.catalog !== browseCatalog;
    mapData.mergeBrowseArea(data);
    browseCatalog = data.catalog;
    if (opensBrowse) browseOpenVersion += 1;
    publish();
  });
  listen<MapData2Reset>("Darkwind.MapData2.Reset", validateMapData2Reset, (data) => {
    if (data.area) {
      mapData.clearMapDataForArea(data.area, data);
    } else {
      mapData.beginGlobalReset(data);
      mapData.exitBrowse();
      browseCatalog = "";
    }
    publish();
  });
  listen<DarkwindRoomImage>("Darkwind.Room.Image", validateDarkwindRoomImage, (data) => {
    const roomId = room ? roomIdFrom(room) : null;
    if (!roomId || !data.url.trim()) return;
    roomImage = deepFreeze({ ...data, roomId, generation: roomGeneration });
    publish();
  });

  const replacePlaylist = (data: DarkwindRoomPlaylistState, open: boolean): void => {
    playlist = deepFreeze(normalizePlaylistState(data) as SessionPlaylistSnapshot);
    playlistFresh = true;
    if (open) playlistOpenVersion += 1;
    publish();
  };
  listen<DarkwindRoomPlaylistState>(
    "Darkwind.Room.Playlist.State",
    validateDarkwindRoomPlaylistState,
    (data) => replacePlaylist(data, false),
  );
  listen<DarkwindRoomPlaylistOpen>(
    "Darkwind.Room.Playlist.Open",
    validateDarkwindRoomPlaylistOpen,
    (data) => replacePlaylist(data, true),
  );

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      connected = payload.status === "connected";
      if (!connected) {
        playlistFresh = false;
        speedwalk.cancel();
        void selector.resetLiveMapModeForConnection();
        room = null;
        players = [];
        roomGeneration += 1;
        roomImage = null;
      }
      publish();
    }),
  );

  const playlistAction = (action: PlaylistActionInput): boolean => {
    if (disposed || !connected || !playlistFresh || !playlist.enabled || playlist.room_id === null)
      return false;
    return gmcp.sendRoomPlaylistAction({
      room_id: playlist.room_id,
      revision: playlist.revision,
      ...action,
    } as DarkwindRoomPlaylistAction);
  };

  const playlistReport = (report: PlaylistReportInput): boolean => {
    if (
      disposed ||
      !connected ||
      !playlistFresh ||
      !playlist.enabled ||
      playlist.room_id === null ||
      !playlist.playback.current
    ) {
      return false;
    }
    return gmcp.sendRoomPlaylistReport({
      room_id: playlist.room_id,
      revision: playlist.revision,
      entry_id: playlist.playback.current.id,
      ...report,
    } as DarkwindRoomPlaylistReport);
  };

  scope.own("listener", () => {
    disposed = true;
    listeners.clear();
    speedwalk.dispose();
    selector.disposeLiveMapSourceLifecycle();
    mapData.flushPendingMapSave();
    learnedMap.flushPendingMapSave();
    mapData.disposeMapDataLifecycle();
    learnedMap.disposeMapDataLifecycle();
    roomGeneration += 1;
    roomImage = null;
    players = [];
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listener(snapshot);
      listeners.add(listener);
      return scope.own("subscription", () => listeners.delete(listener));
    },
    setVisiblePanels(ids) {
      if (disposed) return;
      const visible = new Set(ids);
      const mapVisible = visible.has("map") || visible.has("areaMap");
      gmcp.sendSubscriptions({
        panels: {
          map: mapVisible,
          areaMap: visible.has("areaMap"),
          room: mapVisible || visible.has("room") || visible.has("roomImage"),
          roomImage: visible.has("roomImage"),
          roomPlaylist: visible.has("roomPlaylist"),
        },
      });
    },
    browseArea(catalog) {
      if (disposed || !connected) return false;
      const next = catalog.trim();
      if (!next) return false;
      mapData.requestBrowse(next);
      return true;
    },
    closeBrowse() {
      if (disposed) return;
      mapData.exitBrowse();
      browseCatalog = "";
      publish();
    },
    resyncCurrentArea() {
      if (disposed || !connected) return false;
      const active = currentRetainedSource();
      const area = active.getAreaName();
      if (!area) return false;
      active.clearMapDataForArea(area);
      publish();
      return true;
    },
    speedwalkTo(roomId) {
      if (disposed || !connected) return false;
      const started = speedwalk.start(String(roomId));
      publish();
      return started;
    },
    cancelSpeedwalk() {
      if (disposed) return;
      speedwalk.cancel("cancelled");
      publish();
    },
    refreshMedia: () => !disposed && connected && gmcp.requestMediaRefresh(),
    addPlaylistUrl(url) {
      const trimmed = url.trim();
      return trimmed ? playlistAction({ action: "add", url: trimmed }) : false;
    },
    removePlaylistEntry(number) {
      return Number.isInteger(number) && number > 0
        ? playlistAction({ action: "remove", number })
        : false;
    },
    movePlaylistEntry(from, to) {
      return Number.isInteger(from) && from > 0 && Number.isInteger(to) && to > 0
        ? playlistAction({ action: "move", from, to })
        : false;
    },
    votePlaylistSkip: () => playlistAction({ action: "vote_skip" }),
    pausePlaylist: () => playlistAction({ action: "pause" }),
    resumePlaylist: () => playlistAction({ action: "resume" }),
    skipPlaylist: () => playlistAction({ action: "skip" }),
    reportPlaylistReady(title, duration) {
      const trimmed = title.trim();
      return trimmed && Number.isFinite(duration) && duration >= 0
        ? playlistReport({ report: "ready", title: trimmed, duration })
        : false;
    },
    reportPlaylistEnded: () => playlistReport({ report: "ended" }),
    reportPlaylistError(code) {
      return Number.isFinite(code) ? playlistReport({ report: "error", code }) : false;
    },
  };
}
