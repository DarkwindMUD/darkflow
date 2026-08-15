import type { MapData2RoomId, MapData2WireBoolean } from "./darkwind-map-data-v2.ts";

/** Darkwind.Room.Image inbound payload. */
export interface DarkwindRoomImage {
  url: string;
  name?: string;
  [key: string]: unknown;
}

export interface DarkwindRoomPlaylistEntry {
  id: number;
  video_id: string;
  title: string;
  added_by: string;
  duration: number;
  can_remove?: MapData2WireBoolean;
}

export interface DarkwindRoomPlaylistPlayback {
  status: "stopped" | "playing" | "paused" | "paused_empty";
  position: number;
  start_at: number;
  current: DarkwindRoomPlaylistEntry | 0;
}

export interface DarkwindRoomPlaylistEnabledState {
  enabled: true | 1;
  room_id: MapData2RoomId;
  revision: number;
  server_time: number;
  name: string;
  playback: DarkwindRoomPlaylistPlayback;
  queue: DarkwindRoomPlaylistEntry[];
  skip_votes: number;
  skip_needed: number;
  permissions: {
    add: MapData2WireBoolean;
    moderate: MapData2WireBoolean;
  };
}

export interface DarkwindRoomPlaylistDisabledState {
  enabled: false | 0;
  room_id: MapData2RoomId;
  server_time: number;
}

/** Authoritative room playlist snapshot. */
export type DarkwindRoomPlaylistState =
  DarkwindRoomPlaylistEnabledState | DarkwindRoomPlaylistDisabledState;

/** Explicit-open payload has the same wire shape as State. */
export type DarkwindRoomPlaylistOpen = DarkwindRoomPlaylistState;

interface DarkwindRoomPlaylistRequest {
  room_id: MapData2RoomId;
  revision: number;
}

/** Named playlist mutation sent to the room playlist daemon. */
export type DarkwindRoomPlaylistAction = DarkwindRoomPlaylistRequest &
  (
    | { action: "add"; url: string }
    | { action: "remove"; number: number }
    | { action: "move"; from: number; to: number }
    | { action: "vote_skip" | "pause" | "resume" | "skip" }
  );

interface DarkwindRoomPlaylistEntryRequest extends DarkwindRoomPlaylistRequest {
  entry_id: number;
}

/** Player lifecycle report for the authoritative current entry. */
export type DarkwindRoomPlaylistReport = DarkwindRoomPlaylistEntryRequest &
  (
    | { report: "ready"; title: string; duration: number }
    | { report: "ended" }
    | { report: "error"; code: number }
  );
