import type {
  DarkwindWindowAction,
  DarkwindWindowLayoutNode,
  DarkwindWindowOpen,
  DarkwindWindowSubmit,
} from "./darkwind-window";
import type { DarkwindStreetSamurai } from "./street-samurai";

export interface DarkwindSnoopOpen {
  id: string;
  target: string;
  targetRealName: string;
  snooper: string;
  startedAt: number;
}

export interface DarkwindSnoopAppend {
  id: string;
  type: "output" | "input" | "command" | "status";
  text: string;
  timestamp: number;
}

export interface DarkwindSnoopStatus {
  id: string;
  text: string;
  timestamp: number;
}

export interface DarkwindSnoopClose {
  id: string;
  reason?: string;
}

export interface DarkwindSnoopCommand {
  id: string;
  mode: "target" | "self";
  command: string;
}

export interface DarkwindSnoopStop {
  id: string;
}

export type DarkwindSnoopClosed = DarkwindSnoopStop;

export interface DarkwindAnnouncement {
  id: number;
  status: "active" | "archived";
  title: string;
  summary: string;
  author: string;
  authorRealName: string;
  createdAt: number;
  updatedAt?: number;
  updatedBy?: string | 0;
  archivedAt: number;
  markdown: string;
  isRead: 0 | 1;
}

export interface DarkwindAnnouncementsList {
  active: DarkwindAnnouncement[];
  archived: DarkwindAnnouncement[];
  unreadCount: number;
}

export interface DarkwindAnnouncementsNew {
  item: DarkwindAnnouncement;
  unreadCount: number;
}

export interface DarkwindAnnouncementsUpdate extends DarkwindAnnouncementsNew {
  bucket: "active" | "archived";
}

export interface DarkwindAnnouncementsState {
  unreadCount: number;
}

export interface DarkwindAnnouncementsMarkRead {
  id: number;
}

export interface DarkwindGiphyShow {
  gifUrl: string;
  channel?: string;
  caption?: string;
  talker?: string;
  phrase?: string;
  durationMs?: number;
}

export interface DarkwindBroadcastShow {
  message: string;
  title?: string;
  sender?: string;
  durationMs?: number;
  sentAt?: number;
}

export interface DarkwindLinuxRescueOpen {
  fullscreen?: boolean | 0 | 1;
}

export interface DarkwindFishingOpen {
  session: string;
  terrain: string;
  skill: number;
  poleTier: number;
  baitTier: number;
  baited: boolean | 0 | 1;
  sceneArtUrl: string | null | 0;
}

export interface DarkwindFishingCast {
  session: string;
  power: number;
}

export interface DarkwindFishingBite {
  session: string;
  windowMs: number;
  tease: string;
}

export interface DarkwindFishingHook {
  session: string;
}

export interface DarkwindFishingFight {
  session: string;
  seed: number;
  params: {
    strength: number;
    erratic: number;
    stamina: number;
    barSize: number;
    progressRate: number;
    drainRate: number;
    tensionRise: number;
    tensionDecay: number;
    minFightMs: number;
    [key: string]: unknown;
  };
  fish: {
    tease: string;
    rarityHint: string;
    artUrl: string | null | 0;
    [key: string]: unknown;
  };
}

export interface DarkwindFishingResult {
  session: string;
  outcome: "caught" | "snap" | "slack";
  fightMs: number;
  accuracy: number;
  tensionPeak: number;
}

export interface DarkwindFishingCaught {
  session: string;
  fish: {
    id: string;
    name: string;
    short: string;
    rarity: string;
    sizePct: number;
    sizeCm: number;
    weightKg: number;
    quality: number;
    pristine: boolean | 0 | 1;
    artUrl: string | null | 0;
    [key: string]: unknown;
  };
  rewards: {
    skillup: boolean | 0 | 1;
    newSkill: number;
    reagent?: { name: string; amount: number; [key: string]: unknown };
    [key: string]: unknown;
  };
}

export interface DarkwindFishingEscaped {
  session: string;
  reason: string;
}

export interface DarkwindFishingArt {
  species: string;
  artUrl: string;
}

export type DarkwindFishingCancel = DarkwindFishingHook;

export interface DarkwindFishingEnd {
  session: string;
  reason: string;
  message?: string;
}

export interface InteractionWindow extends DarkwindWindowOpen {
  sourceId: string;
  updates: readonly DarkwindWindowLayoutNode[];
  revision: number;
  streetSamurai?: DarkwindStreetSamurai;
  streetSamuraiRevision?: number;
}

export interface InteractionSnoop extends DarkwindSnoopOpen {
  entries: readonly DarkwindSnoopAppend[];
}

export interface InteractionFishing {
  open: DarkwindFishingOpen | null;
  bite: DarkwindFishingBite | null;
  fight: DarkwindFishingFight | null;
  caught: DarkwindFishingCaught | null;
  escaped: DarkwindFishingEscaped | null;
  end: DarkwindFishingEnd | null;
  art: Readonly<Record<string, string>>;
}

export interface SessionInteractionSnapshot {
  windows: Readonly<Record<string, InteractionWindow>>;
  snoop: InteractionSnoop | null;
  announcements: DarkwindAnnouncementsList;
  giphy: DarkwindGiphyShow | null;
  broadcast: DarkwindBroadcastShow | null;
  linuxRescue: DarkwindLinuxRescueOpen | null;
  fishing: InteractionFishing;
}

export type { DarkwindWindowAction, DarkwindWindowSubmit };
