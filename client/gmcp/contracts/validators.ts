import typia from "typia";

import { canonicalPackageName } from "../frame.ts";
import type { CoreSupportsPayload } from "./core.ts";
import type {
  CharDefencesList,
  CharDefencesRemove,
  CharDefence,
  CharEnemy,
  CharItemsList,
  CharItemsMutation,
  CharRealStats,
  CharStats,
  CharStatus,
  CharStatusVars,
  CharVitals,
  CharWorth,
} from "./char.ts";
import type {
  CommChannelList,
  CommChannelMessage,
  CommChannelPlayers,
  CommChannelState,
} from "./comm.ts";
import type { RoomAddPlayer, RoomInfo, RoomPlayers, RoomRemovePlayer } from "./room.ts";
import type { DarkwindClientNaws, DarkwindSessionRecovered } from "./darkwind-client.ts";
import type { CompletionRequest, CompletionResult } from "./completion.ts";
import type { CorePing, DarkwindLagStatus } from "./diagnostics.ts";
import type {
  DarkwindAvatar,
  DarkwindAchievements,
  DarkwindAchievementsUpdate,
  DarkwindCyberware,
  DarkwindCyberwareDetails,
  DarkwindCyberwareImage,
  DarkwindDivine,
  DarkwindGuildVitals,
  DarkwindSky,
  DarkwindXpMon,
  DarkwindQuestsActive,
  DarkwindQuestsUpdate,
  DarkwindQuest,
  Group,
} from "./information.ts";
import type {
  DarkwindIdeOpen,
  DarkwindIdeOpenChunk,
  DarkwindIdeOpenFinish,
  DarkwindIdeOpenStart,
  DarkwindIdeClose,
  DarkwindIdeSave,
  DarkwindIdeSaveAbort,
  DarkwindIdeSaveChunk,
  DarkwindIdeSaveFinish,
  DarkwindIdeSaveResult,
  DarkwindIdeSaveStart,
} from "./darkwind-ide.ts";
import type {
  MapData2Area,
  MapData2Browse,
  MapData2BrowseArea,
  MapData2Current,
  MapData2Error,
  MapData2Reset,
  MapData2Sync,
  MapData2Update,
} from "./darkwind-map-data-v2.ts";
import type {
  DarkwindWindowClose,
  DarkwindWindowOpen,
  DarkwindWindowUpdate,
} from "./darkwind-window.ts";
import type {
  DarkwindAnnouncementsList,
  DarkwindAnnouncementsNew,
  DarkwindAnnouncementsState,
  DarkwindAnnouncementsUpdate,
  DarkwindBroadcastShow,
  DarkwindFishingArt,
  DarkwindFishingBite,
  DarkwindFishingCaught,
  DarkwindFishingEnd,
  DarkwindFishingEscaped,
  DarkwindFishingFight,
  DarkwindFishingOpen,
  DarkwindGiphyShow,
  DarkwindLinuxRescueOpen,
  DarkwindSnoopAppend,
  DarkwindSnoopClose,
  DarkwindSnoopOpen,
  DarkwindSnoopStatus,
} from "./interactions.ts";
import type {
  DarkwindRoomImage,
  DarkwindRoomPlaylistAction,
  DarkwindRoomPlaylistOpen,
  DarkwindRoomPlaylistReport,
  DarkwindRoomPlaylistState,
} from "./world.ts";
import { normalizeDarkwindSound, type DarkwindSound } from "./sound";
import {
  normalizeDarkwindCombatEvent,
  normalizeDarkwindCombatEvents,
  normalizeDarkwindCombatState,
  type DarkwindCombatEventMessage,
  type DarkwindCombatEvents,
  type DarkwindCombatState,
} from "./combat.ts";
import {
  normalizeDarkwindTutorialAction,
  normalizeDarkwindTutorialControl,
  normalizeDarkwindTutorialResync,
  normalizeDarkwindTutorialState,
  type DarkwindTutorialAction,
  type DarkwindTutorialControl,
  type DarkwindTutorialResync,
  type DarkwindTutorialState,
} from "./tutorial.ts";
import {
  normalizeDarkwindVisualEvent,
  normalizeDarkwindVisualEvents,
  normalizeDarkwindVisualPreview,
  normalizeDarkwindVisualState,
  type DarkwindVisualEvent,
  type DarkwindVisualEvents,
  type DarkwindVisualPreview,
  type DarkwindVisualState,
} from "./visual-effects.ts";
import { normalizeDarkwindStreetSamurai, type DarkwindStreetSamurai } from "./street-samurai.ts";

export const validateCoreSupports = typia.createValidate<CoreSupportsPayload>();
export const validateCharVitals = typia.createValidate<CharVitals>();
export const validateCharStatus = typia.createValidate<CharStatus>();
export const validateCharStatusVars = typia.createValidate<CharStatusVars>();
export const validateCharStats = typia.createValidate<CharStats>();
export const validateCharRealStats = typia.createValidate<CharRealStats>();
export const validateCharWorth = typia.createValidate<CharWorth>();
export const validateCharEnemy = typia.createValidate<CharEnemy>();
export const validateCharItemsList = typia.createValidate<CharItemsList>();
export const validateCharItemsMutation = typia.createValidate<CharItemsMutation>();
export const validateCharDefencesList = typia.createValidate<CharDefencesList>();
export const validateCharDefence = typia.createValidate<CharDefence>();
export const validateCharDefencesRemove = typia.createValidate<CharDefencesRemove>();
export const validateRoomInfo = typia.createValidate<RoomInfo>();
export const validateRoomPlayers = typia.createValidate<RoomPlayers>();
export const validateRoomAddPlayer = typia.createValidate<RoomAddPlayer>();
export const validateRoomRemovePlayer = typia.createValidate<RoomRemovePlayer>();
export const validateCommChannelMessage = typia.createValidate<CommChannelMessage>();
export const validateCommChannelList = typia.createValidate<CommChannelList>();
export const validateCommChannelPlayers = typia.createValidate<CommChannelPlayers>();
export const validateCommChannelState = typia.createValidate<CommChannelState>();
export const validateDarkwindWindowOpen = typia.createValidate<DarkwindWindowOpen>();
export const validateDarkwindWindowUpdate = typia.createValidate<DarkwindWindowUpdate>();
export const validateDarkwindWindowClose = typia.createValidate<DarkwindWindowClose>();
export const validateDarkwindIdeOpen = typia.createValidate<DarkwindIdeOpen>();
export const validateDarkwindIdeOpenStart = typia.createValidate<DarkwindIdeOpenStart>();
export const validateDarkwindIdeOpenChunk = typia.createValidate<DarkwindIdeOpenChunk>();
export const validateDarkwindIdeOpenFinish = typia.createValidate<DarkwindIdeOpenFinish>();
export const validateDarkwindIdeSaveResult = typia.createValidate<DarkwindIdeSaveResult>();
export const validateDarkwindIdeSave = typia.createValidate<DarkwindIdeSave>();
export const validateDarkwindIdeSaveStart = typia.createValidate<DarkwindIdeSaveStart>();
export const validateDarkwindIdeSaveChunk = typia.createValidate<DarkwindIdeSaveChunk>();
export const validateDarkwindIdeSaveFinish = typia.createValidate<DarkwindIdeSaveFinish>();
export const validateDarkwindIdeSaveAbort = typia.createValidate<DarkwindIdeSaveAbort>();
export const validateDarkwindIdeClose = typia.createValidate<DarkwindIdeClose>();
export const validateMapData2Current = typia.createValidate<MapData2Current>();
export const validateMapData2Area = typia.createValidate<MapData2Area>();
export const validateMapData2Update = typia.createValidate<MapData2Update>();
export const validateMapData2Error = typia.createValidate<MapData2Error>();
export const validateMapData2BrowseArea = typia.createValidate<MapData2BrowseArea>();
export const validateMapData2Reset = typia.createValidate<MapData2Reset>();
export const validateMapData2Sync = typia.createValidate<MapData2Sync>();
export const validateMapData2Browse = typia.createValidate<MapData2Browse>();
export const validateDarkwindRoomImage = typia.createValidate<DarkwindRoomImage>();
export const validateDarkwindRoomPlaylistState = typia.createValidate<DarkwindRoomPlaylistState>();
export const validateDarkwindRoomPlaylistOpen = typia.createValidate<DarkwindRoomPlaylistOpen>();
export const validateDarkwindRoomPlaylistAction =
  typia.createValidate<DarkwindRoomPlaylistAction>();
export const validateDarkwindRoomPlaylistReport =
  typia.createValidate<DarkwindRoomPlaylistReport>();
export const validateDarkwindClientNaws = typia.createValidate<DarkwindClientNaws>();
export const validateDarkwindSessionRecovered = typia.createValidate<DarkwindSessionRecovered>();
export const validateCompletionRequest = typia.createValidate<CompletionRequest>();
export const validateCompletionResult = typia.createValidate<CompletionResult>();
export const validateCorePing = typia.createValidate<CorePing>();
export const validateDarkwindLagStatus = typia.createValidate<DarkwindLagStatus>();
export const validateGroup = typia.createValidate<Group>();
export const validateDarkwindAvatar = typia.createValidate<DarkwindAvatar>();
export const validateDarkwindDivine = typia.createValidate<DarkwindDivine>();
export const validateDarkwindSky = typia.createValidate<DarkwindSky>();
export const validateDarkwindGuildVitals = typia.createValidate<DarkwindGuildVitals>();
export const validateDarkwindXpMon = typia.createValidate<DarkwindXpMon>();
export const validateDarkwindQuestsList = typia.createValidate<DarkwindQuest[]>();
export const validateDarkwindQuestsActive = typia.createValidate<DarkwindQuestsActive>();
export const validateDarkwindQuestsUpdate = typia.createValidate<DarkwindQuestsUpdate>();
export const validateDarkwindQuestsComplete = typia.createValidate<Record<string, unknown>>();
export const validateDarkwindAchievements = typia.createValidate<DarkwindAchievements>();
export const validateDarkwindAchievementsUpdate =
  typia.createValidate<DarkwindAchievementsUpdate>();
export const validateDarkwindCyberware = typia.createValidate<DarkwindCyberware>();
export const validateDarkwindCyberwareDetails = typia.createValidate<DarkwindCyberwareDetails>();
export const validateDarkwindCyberwareImage = typia.createValidate<DarkwindCyberwareImage>();
export const validateDarkwindSnoopOpen = typia.createValidate<DarkwindSnoopOpen>();
export const validateDarkwindSnoopAppend = typia.createValidate<DarkwindSnoopAppend>();
export const validateDarkwindSnoopStatus = typia.createValidate<DarkwindSnoopStatus>();
export const validateDarkwindSnoopClose = typia.createValidate<DarkwindSnoopClose>();
export const validateDarkwindAnnouncementsList = typia.createValidate<DarkwindAnnouncementsList>();
export const validateDarkwindAnnouncementsNew = typia.createValidate<DarkwindAnnouncementsNew>();
export const validateDarkwindAnnouncementsUpdate =
  typia.createValidate<DarkwindAnnouncementsUpdate>();
export const validateDarkwindAnnouncementsState =
  typia.createValidate<DarkwindAnnouncementsState>();
export const validateDarkwindGiphyShow = typia.createValidate<DarkwindGiphyShow>();
export const validateDarkwindBroadcastShow = typia.createValidate<DarkwindBroadcastShow>();
export const validateDarkwindLinuxRescueOpen = typia.createValidate<DarkwindLinuxRescueOpen>();
export const validateDarkwindFishingOpen = typia.createValidate<DarkwindFishingOpen>();
export const validateDarkwindFishingBite = typia.createValidate<DarkwindFishingBite>();
export const validateDarkwindFishingFight = typia.createValidate<DarkwindFishingFight>();
export const validateDarkwindFishingCaught = typia.createValidate<DarkwindFishingCaught>();
export const validateDarkwindFishingEscaped = typia.createValidate<DarkwindFishingEscaped>();
export const validateDarkwindFishingArt = typia.createValidate<DarkwindFishingArt>();
export const validateDarkwindFishingEnd = typia.createValidate<DarkwindFishingEnd>();
function validateNormalized<T>(
  input: unknown,
  expected: string,
  normalize: (value: unknown) => T | null,
): typia.IValidation<T> {
  const data = normalize(input);
  return data
    ? { success: true, data }
    : {
        success: false,
        data: input,
        errors: [{ path: "$input", expected, value: input }],
      };
}

export function validateDarkwindSound(input: unknown): typia.IValidation<DarkwindSound> {
  return validateNormalized(input, "Darkwind.Sound payload", normalizeDarkwindSound);
}
export function validateDarkwindCombatState(
  input: unknown,
): typia.IValidation<DarkwindCombatState> {
  return validateNormalized(input, "Darkwind.Combat.State payload", normalizeDarkwindCombatState);
}
export function validateDarkwindCombatEvents(
  input: unknown,
): typia.IValidation<DarkwindCombatEvents> {
  return validateNormalized(input, "Darkwind.Combat.Events payload", normalizeDarkwindCombatEvents);
}
export function validateDarkwindCombatEvent(
  input: unknown,
): typia.IValidation<DarkwindCombatEventMessage> {
  return validateNormalized(input, "Darkwind.Combat.Event payload", normalizeDarkwindCombatEvent);
}
export function validateDarkwindTutorialState(
  input: unknown,
): typia.IValidation<DarkwindTutorialState> {
  return validateNormalized(
    input,
    "Darkwind.Tutorial.State payload",
    normalizeDarkwindTutorialState,
  );
}
export function validateDarkwindTutorialControl(
  input: unknown,
): typia.IValidation<DarkwindTutorialControl> {
  return validateNormalized(
    input,
    "Darkwind.Tutorial.Control payload",
    normalizeDarkwindTutorialControl,
  );
}
export function validateDarkwindTutorialAction(
  input: unknown,
): typia.IValidation<DarkwindTutorialAction> {
  return validateNormalized(
    input,
    "Darkwind.Tutorial.Action payload",
    normalizeDarkwindTutorialAction,
  );
}
export function validateDarkwindTutorialResync(
  input: unknown,
): typia.IValidation<DarkwindTutorialResync> {
  return validateNormalized(
    input,
    "Darkwind.Tutorial.Resync payload",
    normalizeDarkwindTutorialResync,
  );
}
export function validateDarkwindVisualState(
  input: unknown,
): typia.IValidation<DarkwindVisualState> {
  return validateNormalized(input, "Darkwind.Visual.State payload", normalizeDarkwindVisualState);
}
export function validateDarkwindVisualEvents(
  input: unknown,
): typia.IValidation<DarkwindVisualEvents> {
  return validateNormalized(input, "Darkwind.Visual.Events payload", normalizeDarkwindVisualEvents);
}
export function validateDarkwindVisualEvent(
  input: unknown,
): typia.IValidation<DarkwindVisualEvent> {
  return validateNormalized(input, "Darkwind.Visual.Event payload", normalizeDarkwindVisualEvent);
}
export function validateDarkwindVisualPreview(
  input: unknown,
): typia.IValidation<DarkwindVisualPreview> {
  return validateNormalized(
    input,
    "Darkwind.Visual.Preview payload",
    normalizeDarkwindVisualPreview,
  );
}
export function validateDarkwindStreetSamurai(
  input: unknown,
): typia.IValidation<DarkwindStreetSamurai> {
  return validateNormalized(
    input,
    "Darkwind.StreetSamurai payload",
    normalizeDarkwindStreetSamurai,
  );
}

/** Typia validator invoked by canonical inbound package name. */
export type GmcpPayloadValidator = (input: unknown) => typia.IValidation<unknown>;

const PACKAGE_VALIDATORS: Record<string, GmcpPayloadValidator> = {
  [canonicalPackageName("Core.Supports.Set")]: validateCoreSupports,
  [canonicalPackageName("Core.Supports.Add")]: validateCoreSupports,
  [canonicalPackageName("Core.Supports.Remove")]: validateCoreSupports,
  [canonicalPackageName("Char.Vitals")]: validateCharVitals,
  [canonicalPackageName("Char.Status")]: validateCharStatus,
  [canonicalPackageName("Char.StatusVars")]: validateCharStatusVars,
  [canonicalPackageName("Char.Stats")]: validateCharStats,
  [canonicalPackageName("Char.RealStats")]: validateCharRealStats,
  [canonicalPackageName("Char.Worth")]: validateCharWorth,
  [canonicalPackageName("Char.Enemy")]: validateCharEnemy,
  [canonicalPackageName("Char.Items.List")]: validateCharItemsList,
  [canonicalPackageName("Char.Items.Add")]: validateCharItemsMutation,
  [canonicalPackageName("Char.Items.Remove")]: validateCharItemsMutation,
  [canonicalPackageName("Char.Items.Update")]: validateCharItemsMutation,
  [canonicalPackageName("Char.Defences.List")]: validateCharDefencesList,
  [canonicalPackageName("Char.Defences.Add")]: validateCharDefence,
  [canonicalPackageName("Char.Defences.Remove")]: validateCharDefencesRemove,
  [canonicalPackageName("Room.Info")]: validateRoomInfo,
  [canonicalPackageName("Room.Players")]: validateRoomPlayers,
  [canonicalPackageName("Room.AddPlayer")]: validateRoomAddPlayer,
  [canonicalPackageName("Room.RemovePlayer")]: validateRoomRemovePlayer,
  [canonicalPackageName("Comm.Channel")]: validateCommChannelMessage,
  [canonicalPackageName("Comm.Channel.Text")]: validateCommChannelMessage,
  [canonicalPackageName("Comm.Channel.List")]: validateCommChannelList,
  [canonicalPackageName("Comm.Channel.Players")]: validateCommChannelPlayers,
  [canonicalPackageName("Comm.Channel.Start")]: validateCommChannelState,
  [canonicalPackageName("Comm.Channel.End")]: validateCommChannelState,
  [canonicalPackageName("Darkwind.Window.Open")]: validateDarkwindWindowOpen,
  [canonicalPackageName("Darkwind.Window.Update")]: validateDarkwindWindowUpdate,
  [canonicalPackageName("Darkwind.Window.Close")]: validateDarkwindWindowClose,
  [canonicalPackageName("Darkwind.IDE.Open")]: validateDarkwindIdeOpen,
  [canonicalPackageName("Darkwind.IDE.OpenStart")]: validateDarkwindIdeOpenStart,
  [canonicalPackageName("Darkwind.IDE.OpenChunk")]: validateDarkwindIdeOpenChunk,
  [canonicalPackageName("Darkwind.IDE.OpenFinish")]: validateDarkwindIdeOpenFinish,
  [canonicalPackageName("Darkwind.IDE.SaveResult")]: validateDarkwindIdeSaveResult,
  [canonicalPackageName("Darkwind.MapData2.Current")]: validateMapData2Current,
  [canonicalPackageName("Darkwind.MapData2.Area")]: validateMapData2Area,
  [canonicalPackageName("Darkwind.MapData2.Update")]: validateMapData2Update,
  [canonicalPackageName("Darkwind.MapData2.Error")]: validateMapData2Error,
  [canonicalPackageName("Darkwind.MapData2.BrowseArea")]: validateMapData2BrowseArea,
  [canonicalPackageName("Darkwind.MapData2.Reset")]: validateMapData2Reset,
  [canonicalPackageName("Darkwind.Room.Image")]: validateDarkwindRoomImage,
  [canonicalPackageName("Darkwind.Room.Playlist.State")]: validateDarkwindRoomPlaylistState,
  [canonicalPackageName("Darkwind.Room.Playlist.Open")]: validateDarkwindRoomPlaylistOpen,
  [canonicalPackageName("Darkwind.Session.Recovered")]: validateDarkwindSessionRecovered,
  [canonicalPackageName("Darkwind.Completion.Result")]: validateCompletionResult,
  [canonicalPackageName("Group")]: validateGroup,
  [canonicalPackageName("Darkwind.Char.Avatar")]: validateDarkwindAvatar,
  [canonicalPackageName("Darkwind.Divine")]: validateDarkwindDivine,
  [canonicalPackageName("Darkwind.Sky")]: validateDarkwindSky,
  [canonicalPackageName("Darkwind.GuildVitals")]: validateDarkwindGuildVitals,
  [canonicalPackageName("Darkwind.XPMon")]: validateDarkwindXpMon,
  [canonicalPackageName("Darkwind.Quests.List")]: validateDarkwindQuestsList,
  [canonicalPackageName("Darkwind.Quests.Active")]: validateDarkwindQuestsActive,
  [canonicalPackageName("Darkwind.Quests.Update")]: validateDarkwindQuestsUpdate,
  [canonicalPackageName("Darkwind.Quests.Complete")]: validateDarkwindQuestsComplete,
  [canonicalPackageName("Darkwind.Achievements.List")]: validateDarkwindAchievements,
  [canonicalPackageName("Darkwind.Achievements.Update")]: validateDarkwindAchievementsUpdate,
  [canonicalPackageName("Darkwind.Cyberware.List")]: validateDarkwindCyberware,
  [canonicalPackageName("Darkwind.Cyberware.Details")]: validateDarkwindCyberwareDetails,
  [canonicalPackageName("Darkwind.Cyberware.Image")]: validateDarkwindCyberwareImage,
  [canonicalPackageName("Darkwind.Snoop.Open")]: validateDarkwindSnoopOpen,
  [canonicalPackageName("Darkwind.Snoop.Append")]: validateDarkwindSnoopAppend,
  [canonicalPackageName("Darkwind.Snoop.Status")]: validateDarkwindSnoopStatus,
  [canonicalPackageName("Darkwind.Snoop.Close")]: validateDarkwindSnoopClose,
  [canonicalPackageName("Darkwind.Announcements.List")]: validateDarkwindAnnouncementsList,
  [canonicalPackageName("Darkwind.Announcements.New")]: validateDarkwindAnnouncementsNew,
  [canonicalPackageName("Darkwind.Announcements.Update")]: validateDarkwindAnnouncementsUpdate,
  [canonicalPackageName("Darkwind.Announcements.State")]: validateDarkwindAnnouncementsState,
  [canonicalPackageName("Darkwind.Giphy.Show")]: validateDarkwindGiphyShow,
  [canonicalPackageName("Darkwind.Broadcast.Show")]: validateDarkwindBroadcastShow,
  [canonicalPackageName("Darkwind.LinuxRescue.Open")]: validateDarkwindLinuxRescueOpen,
  [canonicalPackageName("Darkwind.Fishing.Open")]: validateDarkwindFishingOpen,
  [canonicalPackageName("Darkwind.Fishing.Bite")]: validateDarkwindFishingBite,
  [canonicalPackageName("Darkwind.Fishing.Fight")]: validateDarkwindFishingFight,
  [canonicalPackageName("Darkwind.Fishing.Caught")]: validateDarkwindFishingCaught,
  [canonicalPackageName("Darkwind.Fishing.Escaped")]: validateDarkwindFishingEscaped,
  [canonicalPackageName("Darkwind.Fishing.Art")]: validateDarkwindFishingArt,
  [canonicalPackageName("Darkwind.Fishing.End")]: validateDarkwindFishingEnd,
  [canonicalPackageName("Darkwind.Sound")]: validateDarkwindSound,
  [canonicalPackageName("Darkwind.Combat.State")]: validateDarkwindCombatState,
  [canonicalPackageName("Darkwind.Combat.Events")]: validateDarkwindCombatEvents,
  [canonicalPackageName("Darkwind.Combat.Event")]: validateDarkwindCombatEvent,
  [canonicalPackageName("Darkwind.Tutorial.State")]: validateDarkwindTutorialState,
  [canonicalPackageName("Darkwind.Tutorial.Control")]: validateDarkwindTutorialControl,
  [canonicalPackageName("Darkwind.Visual.State")]: validateDarkwindVisualState,
  [canonicalPackageName("Darkwind.Visual.Events")]: validateDarkwindVisualEvents,
  [canonicalPackageName("Darkwind.Visual.Event")]: validateDarkwindVisualEvent,
  [canonicalPackageName("Darkwind.Visual.Preview")]: validateDarkwindVisualPreview,
  [canonicalPackageName("Darkwind.StreetSamurai")]: validateDarkwindStreetSamurai,
  [canonicalPackageName("Core.Ping")]: validateCorePing,
  [canonicalPackageName("Darkwind.Lag.Status")]: validateDarkwindLagStatus,
};

/** Returns the structural validator for a canonical package name, if modeled. */
export function lookupGmcpValidator(packageName: string): GmcpPayloadValidator | undefined {
  return PACKAGE_VALIDATORS[canonicalPackageName(packageName)];
}

/** Canonical inbound package names with registered validators. */
export const modeledGmcpPackageNames = Object.keys(PACKAGE_VALIDATORS);

/** Canonical package names with no inbound validator; legacy passthrough until Phase 2 ports. */
export const unmodeledGmcpPackageNames: readonly string[] = [
  "Core.Hello",
  "Game",
  "Darkwind.Lag.Get",
];
