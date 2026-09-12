import type {
  CharItem,
  CharDefence,
  CharRealStats,
  CharStats,
  CharStatus,
  CharStatusVars,
  CharVitals,
  CharWorth,
} from "./char";

export interface DarkwindQuestObjective {
  name: string;
  current: number;
  required: number;
  status?: string;
  [key: string]: unknown;
}

export interface DarkwindQuest {
  id?: string;
  questPath?: string;
  name: string;
  status: string;
  current?: number;
  total?: number;
  readyToTurnIn?: boolean;
  giverName?: string;
  giverArea?: string;
  objectives?: DarkwindQuestObjective[];
  [key: string]: unknown;
}

export interface DarkwindQuests {
  list: DarkwindQuest[];
  active: Record<string, unknown> | unknown[] | null;
  lastUpdate: DarkwindQuestsUpdate | null;
  lastComplete: Record<string, unknown> | null;
}

export type DarkwindQuestsActive = Record<string, unknown> | unknown[];

export interface DarkwindQuestsUpdate {
  questId: string;
  objective: string;
  current: number;
  required: number;
  questPath?: string;
  questName?: string;
  status?: string;
  readyToTurnIn?: boolean;
  giverArea?: string;
  [key: string]: unknown;
}

export interface DarkwindAchievementSummary {
  unlockedTierCount: number;
  totalTierCount: number;
  completedFamilyCount: number;
  totalFamilyCount: number;
  equippedTitle?: { id?: string; title?: string; [key: string]: unknown };
  leaderboardRank?: number | string;
  [key: string]: unknown;
}

export interface DarkwindAchievementFamily {
  id: string;
  name: string;
  currentValue: number;
  nextTierKey?: string;
  nextTierThreshold?: number;
  [key: string]: unknown;
}

export interface DarkwindAchievements {
  summary: DarkwindAchievementSummary;
  families: DarkwindAchievementFamily[];
  newlyUnlocked?: unknown[];
}

export interface DarkwindAchievementsUpdate {
  summary?: DarkwindAchievementSummary;
  families?: DarkwindAchievementFamily[];
  newlyUnlocked?: unknown[];
}

export interface DarkwindCyberwareItem {
  id: string;
  name?: string;
  grade?: string;
  locations?: string[];
  strain?: number;
  [key: string]: unknown;
}

export interface DarkwindCyberware {
  installed: DarkwindCyberwareItem[];
  strain: { used?: number; total?: number; [key: string]: unknown };
}

export interface DarkwindCyberwareDetails {
  id: string;
  name?: string;
  description?: string;
  scan?: string;
  image?: string;
  image_pending?: number | boolean;
  error?: string;
  [key: string]: unknown;
}

export interface DarkwindCyberwareImage {
  id: string;
  url: string;
}

/** Group roster supplied by the root Group package. */
export interface GroupMember {
  name: string;
  info?: CharVitals;
  [key: string]: unknown;
}

export interface GroupSnapshot {
  groupname?: string;
  leader?: string;
  count?: number;
  members: GroupMember[];
  [key: string]: unknown;
}

/** A blank Group payload represents the legacy not-in-a-group state. */
export type Group = GroupSnapshot | "";

export interface Game {
  game_name?: string;
  game_version?: string;
  game_uptime?: number;
  game_reboot?: number;
  [key: string]: unknown;
}

export interface DarkwindAvatar {
  url: string;
  name?: string;
  [key: string]: unknown;
}

export interface DarkwindDivine {
  patron?: string;
  patron_label?: string;
  rank?: number;
  rank_label?: string;
  modifier_pct?: number;
  state?: string;
  leader?: string;
  leader_label?: string;
  changed_at?: number;
  pressure_scale?: Record<string, number>;
  holy_hour?: { god?: string | 0; expires_at?: number; [key: string]: unknown };
  eclipse?: {
    active?: boolean | 0 | 1;
    expires_at?: number;
    seconds_left?: number;
    cooldown_left?: number;
    [key: string]: unknown;
  };
  summary?: string;
  [key: string]: unknown;
}

export interface DarkwindSky {
  server_time: number;
  game_now: number;
  day_since_beginning?: number;
  sync_interval?: number;
  time_of_day?: string;
  scale: Record<string, number>;
  time: Record<string, string | number>;
  almanac?: Record<string, number[]>;
  moons?: Array<Record<string, string | number>>;
  moon_light?: number;
  [key: string]: unknown;
}

export interface GuildVitalsItem {
  id: string;
  label: string;
  guild?: string;
  kind?: string;
  cur?: number;
  max?: number;
  pct?: number;
  severity?: string;
  tip?: string;
  on?: boolean | 0 | 1;
  flags?: Array<{ label: string; on?: boolean | 0 | 1; tip?: string; [key: string]: unknown }>;
  value?: string;
  display?: string;
  remaining?: number;
  [key: string]: unknown;
}

export interface DarkwindGuildVitals {
  items?: GuildVitalsItem[];
  bars?: GuildVitalsItem[];
  [key: string]: unknown;
}

export interface DarkwindXpMon {
  active: number;
  xp?: number;
  gold?: number;
  elapsed_seconds?: number;
  elapsed_minutes?: number;
  xp_per_hour?: number;
  gold_per_hour?: number;
  started_at?: number;
  [key: string]: unknown;
}

/** First Step 6 character-status read model, kept separate from deferred panel data. */
export interface SessionInformationSnapshot {
  game: Game | null;
  avatar: DarkwindAvatar | null;
  status: CharStatus | null;
  statusVars: CharStatusVars | null;
  vitals: CharVitals | null;
  guildVitals: DarkwindGuildVitals | null;
  xpmon: DarkwindXpMon | null;
  omens: DarkwindDivine | null;
  sky: (DarkwindSky & { receivedAt: number }) | null;
  stats: { current: CharStats | null; base: CharRealStats | null };
  worth: CharWorth | null;
  defences: CharDefence[];
  group: Group | null;
  inventory: CharItem[];
  quests: DarkwindQuests | null;
  achievements: DarkwindAchievements | null;
  cyberware: DarkwindCyberware | null;
  cyberwareDetail: DarkwindCyberwareDetails | null;
}
