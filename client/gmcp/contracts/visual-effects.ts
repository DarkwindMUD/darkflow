const MAX_EVENTS = 12;
const MAX_TERRAIN_CANDIDATES = 16;
const MAX_IDENTIFIER_LENGTH = 96;
const MAX_DISPLAY_LENGTH = 320;

const PLANETS = new Set(["darkwind", "dailos", "markas", "tekal"] as const);
const PREVIEW_TERRAINS = new Set([
  "arctic",
  "city",
  "coast",
  "desert",
  "forest",
  "inside",
  "jungle",
  "mountain",
  "plains",
  "road",
  "swamp",
  "underground",
  "underwater",
  "water",
] as const);
const TERRAIN_PRIORITY = [
  "city",
  "road",
  "path",
  "forest",
  "jungle",
  "canopy",
  "plains",
  "farm",
  "hills",
  "mountain",
  "desert",
  "sea",
  "lake",
  "river",
  "water",
  "beach",
  "coast",
  "swamp",
  "arctic",
  "underground",
  "inside",
  "barren",
  "underwater",
] as const;
const TERRAIN_ALIASES: Readonly<Record<string, VisualTerrain>> = {
  city: "city",
  road: "road",
  path: "road",
  forest: "forest",
  jungle: "jungle",
  canopy: "forest",
  plains: "plains",
  farm: "plains",
  hills: "mountain",
  mountain: "mountain",
  desert: "desert",
  sea: "water",
  lake: "water",
  river: "water",
  water: "water",
  beach: "coast",
  coast: "coast",
  swamp: "swamp",
  arctic: "arctic",
  underground: "underground",
  inside: "inside",
  barren: "desert",
  underwater: "underwater",
};
const SPELL_ALIASES: Readonly<Record<string, VisualSpellSchool>> = {
  arcane: "arcane",
  magic: "arcane",
  mystic: "arcane",
  cold: "cold",
  frost: "cold",
  ice: "cold",
  divine: "divine",
  holy: "divine",
  sacred: "divine",
  fire: "fire",
  flame: "fire",
  healing: "healing",
  heal: "healing",
  restoration: "healing",
  lightning: "lightning",
  electric: "lightning",
  storm: "lightning",
  nature: "nature",
  earth: "nature",
  plant: "nature",
  shadow: "shadow",
  dark: "shadow",
  necromancy: "shadow",
};
const NAMED_CANDIDATE_FIELDS = [
  "id",
  "key",
  "name",
  "type",
  "theme",
  "terrain",
  "environment",
] as const;

type VisualPlanet = "darkwind" | "dailos" | "markas" | "tekal";
type VisualTerrain =
  | "arctic"
  | "city"
  | "coast"
  | "desert"
  | "forest"
  | "inside"
  | "jungle"
  | "mountain"
  | "plains"
  | "road"
  | "swamp"
  | "underground"
  | "underwater"
  | "water";
type VisualSpellSchool =
  "arcane" | "cold" | "divine" | "fire" | "healing" | "lightning" | "nature" | "shadow";

export interface DarkwindVisualState {
  epoch: string;
  seq: number;
  reason: "snapshot" | "move" | "wayshard" | "refresh";
  planet: VisualPlanet | "";
  terrain: VisualTerrain[];
  room_id?: string | number;
  area?: string;
}

export type DarkwindVisualEffect =
  | {
      seq: number;
      kind: "damage";
      perspective: "incoming" | "outgoing";
      cue: "impact";
      intensity: number;
    }
  | {
      seq: number;
      kind: "spell-cast";
      perspective: "self";
      cue: "cast";
      school: VisualSpellSchool;
      intensity: number;
    };

export interface DarkwindVisualEvents {
  epoch: string;
  events: DarkwindVisualEffect[];
  first_seq?: number;
  last_seq?: number;
}

export type DarkwindVisualEvent = DarkwindVisualEffect & { epoch: string };

export type DarkwindVisualPreview =
  | { kind: "planet"; value: VisualPlanet }
  | { kind: "terrain"; value: VisualTerrain }
  | { kind: "low-health" | "transition" | "clear" };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function own(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function identifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= MAX_IDENTIFIER_LENGTH ? normalized : null;
}

function sequence(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function intensity(value: unknown, present: boolean): number | null {
  if (!present) return 1;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(3, Math.round(value)));
}

function collectNamedCandidate(value: unknown, depth: number, output: string[]): boolean {
  if (typeof value === "string") {
    if (value.length > MAX_DISPLAY_LENGTH) return false;
    output.push(value.toLowerCase());
    return true;
  }
  const source = record(value);
  if (!source || depth >= 2) return false;
  for (const key of NAMED_CANDIDATE_FIELDS) {
    if (own(source, key) && !collectNamedCandidate(source[key], depth + 1, output)) return false;
  }
  return true;
}

function namedCandidates(value: unknown): string[] | null {
  const values: string[] = [];
  return collectNamedCandidate(value, 0, values) ? values : null;
}

function normalizePlanet(value: unknown): VisualPlanet | "" | null {
  if (value === undefined) return "";
  const candidates = namedCandidates(value);
  if (candidates === null) return null;
  for (const candidate of candidates) {
    const words = candidate
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split(/[-_]+/);
    for (const word of words) {
      if (PLANETS.has(word as VisualPlanet)) return word as VisualPlanet;
    }
  }
  return "";
}

function normalizeTerrain(value: unknown): VisualTerrain[] | null {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value.slice(0, MAX_TERRAIN_CANDIDATES) : [value];
  const candidates: string[] = [];
  for (const candidate of raw) {
    if (!collectNamedCandidate(candidate, 0, candidates)) return null;
  }

  const found = new Set<VisualTerrain>();
  for (const terrain of TERRAIN_PRIORITY) {
    const pattern = new RegExp(`(?:^|[^a-z])${terrain}(?:$|[^a-z])`);
    if (candidates.some((candidate) => pattern.test(candidate))) {
      found.add(TERRAIN_ALIASES[terrain]!);
    }
    if (found.size >= 3) break;
  }
  return [...found];
}

function normalizeEffect(input: unknown): DarkwindVisualEffect | null {
  const value = record(input);
  if (!value) return null;
  const seq = sequence(value.seq);
  const normalizedIntensity = intensity(value.intensity, own(value, "intensity"));
  if (seq === null || normalizedIntensity === null) return null;

  if (
    value.kind === "damage" &&
    value.cue === "impact" &&
    (value.perspective === "incoming" || value.perspective === "outgoing")
  ) {
    return {
      seq,
      kind: "damage",
      perspective: value.perspective,
      cue: "impact",
      intensity: normalizedIntensity,
    };
  }

  if (value.kind !== "spell-cast" || value.perspective !== "self" || value.cue !== "cast") {
    return null;
  }
  const rawSchool = own(value, "school") ? value.school : value.palette;
  if (typeof rawSchool !== "string" || rawSchool.length > MAX_IDENTIFIER_LENGTH) return null;
  const school = SPELL_ALIASES[rawSchool.trim().toLowerCase()];
  return school
    ? {
        seq,
        kind: "spell-cast",
        perspective: "self",
        cue: "cast",
        school,
        intensity: normalizedIntensity,
      }
    : null;
}

/** Returns a clean, bounded Darkwind.Visual.State payload or null. */
export function normalizeDarkwindVisualState(input: unknown): DarkwindVisualState | null {
  const value = record(input);
  if (!value) return null;
  const epoch = identifier(value.epoch);
  const seq = sequence(value.seq);
  const planet = normalizePlanet(value.planet);
  const terrainSource = own(value, "terrains")
    ? value.terrains
    : own(value, "terrain")
      ? value.terrain
      : value.environment;
  const terrain = normalizeTerrain(terrainSource);
  const reason = own(value, "reason") ? value.reason : "snapshot";
  if (
    epoch === null ||
    seq === null ||
    planet === null ||
    terrain === null ||
    typeof reason !== "string" ||
    !["snapshot", "move", "wayshard", "refresh"].includes(reason)
  ) {
    return null;
  }

  const result: DarkwindVisualState = {
    epoch,
    seq,
    reason: reason as DarkwindVisualState["reason"],
    planet,
    terrain,
  };
  if (own(value, "room_id")) {
    if (!(
      (typeof value.room_id === "string" && value.room_id.length <= 160) ||
      (typeof value.room_id === "number" && Number.isFinite(value.room_id))
    ))
      return null;
    result.room_id = value.room_id;
  }
  if (own(value, "area")) {
    if (typeof value.area !== "string" || value.area.length > 120) return null;
    result.area = value.area;
  }
  return result;
}

/** Returns a clean, bounded Darkwind.Visual.Events payload or null. */
export function normalizeDarkwindVisualEvents(input: unknown): DarkwindVisualEvents | null {
  const value = record(input);
  if (!value || !Array.isArray(value.events)) return null;
  const epoch = identifier(value.epoch);
  if (epoch === null) return null;

  const events: DarkwindVisualEffect[] = [];
  for (const rawEvent of value.events.slice(-MAX_EVENTS)) {
    const event = normalizeEffect(rawEvent);
    if (!event) return null;
    events.push(event);
  }
  const result: DarkwindVisualEvents = { epoch, events };
  const hasFirst = own(value, "first_seq");
  const hasLast = own(value, "last_seq");
  if (hasFirst !== hasLast) return null;
  if (hasFirst) {
    const first = sequence(value.first_seq);
    const last = sequence(value.last_seq);
    if (
      first === null ||
      last === null ||
      first > last ||
      events.some(({ seq }) => seq < first || seq > last)
    )
      return null;
    result.first_seq = first;
    result.last_seq = last;
  }
  return result;
}

/** Returns a clean singular compatibility event payload or null. */
export function normalizeDarkwindVisualEvent(input: unknown): DarkwindVisualEvent | null {
  const value = record(input);
  if (!value) return null;
  const epoch = identifier(value.epoch);
  const event = normalizeEffect(value);
  return epoch && event ? { epoch, ...event } : null;
}

/** Returns one of the fixed Darkwind.Visual.Preview shapes or null. */
export function normalizeDarkwindVisualPreview(input: unknown): DarkwindVisualPreview | null {
  const value = record(input);
  if (!value || typeof value.kind !== "string") return null;
  if (value.kind === "planet") {
    return typeof value.value === "string" && PLANETS.has(value.value as VisualPlanet)
      ? { kind: "planet", value: value.value as VisualPlanet }
      : null;
  }
  if (value.kind === "terrain") {
    return typeof value.value === "string" && PREVIEW_TERRAINS.has(value.value as VisualTerrain)
      ? { kind: "terrain", value: value.value as VisualTerrain }
      : null;
  }
  return (value.kind === "low-health" || value.kind === "transition" || value.kind === "clear") &&
    !own(value, "value")
    ? { kind: value.kind }
    : null;
}
