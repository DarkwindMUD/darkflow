import type {
  CharDefence,
  CharRealStats,
  CharStats,
  CharStatus,
  CharStatusVars,
  CharVitals,
  CharWorth,
} from "./char.ts";

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
  holy_hour?: { god?: string; expires_at?: number; [key: string]: unknown };
  eclipse?: {
    active?: boolean;
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
  on?: boolean;
  flags?: Array<{ label: string; on?: boolean; tip?: string; [key: string]: unknown }>;
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
}
