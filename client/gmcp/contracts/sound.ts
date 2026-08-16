export const DARKWIND_SOUND_CATEGORIES = [
  "combat",
  "spell",
  "skill",
  "potion",
  "quest",
  "celebration",
  "discussion",
  "alert",
  "ambient",
  "ui",
] as const;

export type DarkwindSoundCategory = (typeof DARKWIND_SOUND_CATEGORIES)[number];

interface DarkwindSoundBase {
  category: DarkwindSoundCategory;
  volume?: number;
}

export interface DarkwindSoundPlay extends DarkwindSoundBase {
  type: "play";
  sound: string;
  id?: string;
}

export interface DarkwindSoundLoop extends DarkwindSoundBase {
  type: "loop";
  sound: string;
  id: string;
}

export interface DarkwindSoundStop extends DarkwindSoundBase {
  type: "stop";
  sound?: "";
  id?: string;
}

export type DarkwindSound = DarkwindSoundPlay | DarkwindSoundLoop | DarkwindSoundStop;

const categorySet = new Set<string>(DARKWIND_SOUND_CATEGORIES);
const tokenPattern = /^[A-Za-z0-9_./-]+$/;

function own(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length >= 1 &&
    token.length <= 120 &&
    !token.startsWith("/") &&
    !token.includes("..") &&
    tokenPattern.test(token)
    ? token
    : null;
}

/** Returns a clean, validated Darkwind.Sound payload or null for malformed input. */
export function normalizeDarkwindSound(input: unknown): DarkwindSound | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    typeof value.category !== "string" ||
    !categorySet.has(value.category) ||
    !["play", "loop", "stop"].includes(String(value.type))
  )
    return null;
  if (
    own(value, "volume") &&
    (typeof value.volume !== "number" ||
      !Number.isFinite(value.volume) ||
      value.volume < 0 ||
      value.volume > 1)
  )
    return null;

  const category = value.category as DarkwindSoundCategory;
  const optionalVolume = own(value, "volume") ? { volume: value.volume as number } : {};
  const hasId = own(value, "id");
  const id = hasId ? normalizeToken(value.id) : null;
  if (hasId && id === null) return null;

  if (value.type === "stop") {
    const hasSound = own(value, "sound");
    if (hasSound && (typeof value.sound !== "string" || value.sound.trim() !== "")) return null;
    return {
      type: "stop",
      category,
      ...(hasSound ? { sound: "" as const } : {}),
      ...(id === null ? {} : { id }),
      ...optionalVolume,
    };
  }

  const sound = normalizeToken(value.sound);
  if (sound === null || (value.type === "loop" && id === null)) return null;
  return {
    type: value.type,
    category,
    sound,
    ...(id === null ? {} : { id }),
    ...optionalVolume,
  } as DarkwindSoundPlay | DarkwindSoundLoop;
}
