import { extractTerrainTokens } from './terrain-semantics.mjs';

const MAX_VISUAL_EVENTS_PER_BATCH = 12;
const MAX_TERRAIN_TOKENS = 3;
const VISUAL_INTENSITY_MIN = 1;
const VISUAL_INTENSITY_MAX = 3;

const PLANET_ALIASES = new Map([
  ['darkwind', 'darkwind'],
  ['dailos', 'dailos'],
  ['markas', 'markas'],
  ['tekal', 'tekal'],
]);

const VISUAL_TERRAIN_BY_CANONICAL = new Map([
  ['city', 'city'],
  ['road', 'road'],
  ['path', 'road'],
  ['forest', 'forest'],
  ['jungle', 'jungle'],
  ['canopy', 'forest'],
  ['plains', 'plains'],
  ['farm', 'plains'],
  ['hills', 'mountain'],
  ['mountain', 'mountain'],
  ['desert', 'desert'],
  ['water', 'water'],
  ['sea', 'water'],
  ['lake', 'water'],
  ['river', 'water'],
  ['coast', 'coast'],
  ['beach', 'coast'],
  ['swamp', 'swamp'],
  ['arctic', 'arctic'],
  ['underground', 'underground'],
  ['inside', 'inside'],
  ['barren', 'desert'],
  ['underwater', 'underwater'],
]);

const SPELL_PALETTE_ALIASES = new Map([
  ['arcane', 'arcane'],
  ['magic', 'arcane'],
  ['mystic', 'arcane'],
  ['cold', 'cold'],
  ['frost', 'cold'],
  ['ice', 'cold'],
  ['divine', 'divine'],
  ['holy', 'divine'],
  ['sacred', 'divine'],
  ['fire', 'fire'],
  ['flame', 'fire'],
  ['healing', 'healing'],
  ['heal', 'healing'],
  ['restoration', 'healing'],
  ['lightning', 'lightning'],
  ['electric', 'lightning'],
  ['storm', 'lightning'],
  ['nature', 'nature'],
  ['earth', 'nature'],
  ['plant', 'nature'],
  ['shadow', 'shadow'],
  ['dark', 'shadow'],
  ['necromancy', 'shadow'],
]);

const VISUAL_PREVIEW_PLANETS = new Set([
  'darkwind', 'dailos', 'markas', 'tekal',
]);

const VISUAL_PREVIEW_TERRAINS = new Set([
  'arctic', 'city', 'coast', 'desert', 'forest', 'inside', 'jungle',
  'mountain', 'plains', 'road', 'swamp', 'underground', 'underwater', 'water',
]);

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEpoch(value) {
  return typeof value === 'string' ? value.trim().slice(0, 96) : '';
}

function normalizeSequence(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}

function normalizeIntensity(value) {
  const intensity = Number(value);
  if (!Number.isFinite(intensity)) return VISUAL_INTENSITY_MIN;
  return Math.max(
    VISUAL_INTENSITY_MIN,
    Math.min(VISUAL_INTENSITY_MAX, Math.round(intensity)),
  );
}

function normalizeWord(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
    : '';
}

function candidateWords(value) {
  if (Array.isArray(value)) return value.flatMap(candidateWords);
  if (isObject(value)) {
    return [
      ...candidateWords(value.id),
      ...candidateWords(value.key),
      ...candidateWords(value.name),
      ...candidateWords(value.type),
      ...candidateWords(value.theme),
    ];
  }
  if (typeof value !== 'string') return [];
  const normalized = normalizeWord(value);
  if (!normalized) return [];
  return [normalized, ...normalized.split(/[-_]+/).filter(Boolean)];
}

function firstAllowed(value, aliases) {
  for (const candidate of candidateWords(value)) {
    if (aliases.has(candidate)) return aliases.get(candidate);
  }
  return '';
}

function normalizeTerrainTokens(value) {
  const found = new Set();
  for (const token of extractTerrainTokens(value)) {
    const visualTerrain = VISUAL_TERRAIN_BY_CANONICAL.get(token);
    if (visualTerrain) found.add(visualTerrain);
    if (found.size >= MAX_TERRAIN_TOKENS) break;
  }
  const directTokens = new Set(candidateWords(value));
  for (const token of ['water', 'coast']) {
    if (!directTokens.has(token)) continue;
    const visualTerrain = VISUAL_TERRAIN_BY_CANONICAL.get(token);
    if (visualTerrain) found.add(visualTerrain);
    if (found.size >= MAX_TERRAIN_TOKENS) break;
  }
  return Array.from(found);
}

function normalizeText(value, maxLength) {
  if (typeof value === 'string') return value.trim().slice(0, maxLength);
  if (Number.isFinite(value)) return String(value).slice(0, maxLength);
  return '';
}

function firstFinite(source, keys) {
  if (!isObject(source)) return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const number = Number(source[key]);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function createVisualEffectsState(overrides = {}) {
  return {
    epoch: normalizeEpoch(overrides.epoch),
    lastSeq: normalizeSequence(overrides.lastSeq) ?? 0,
  };
}

export function normalizeVisualEffect(event) {
  if (!isObject(event)) return null;

  const seq = normalizeSequence(event.seq);
  if (seq === null) return null;

  if (event.kind === 'damage' && event.cue === 'impact') {
    const perspective = event.perspective === 'incoming'
      ? 'incoming'
      : event.perspective === 'outgoing' ? 'outgoing' : '';
    if (!perspective) return null;
    return {
      seq,
      kind: 'damage',
      perspective,
      cue: 'impact',
      intensity: normalizeIntensity(event.intensity),
    };
  }

  if (event.kind === 'spell-cast' && event.perspective === 'self') {
    const palette = firstAllowed(
      event.school || event.palette || event.cue,
      SPELL_PALETTE_ALIASES,
    );
    if (!palette) return null;
    return {
      seq,
      kind: 'spell-cast',
      perspective: 'self',
      cue: 'cast',
      palette,
      intensity: normalizeIntensity(event.intensity),
    };
  }

  return null;
}

// Kept as a focused compatibility export for callers that only need the
// original incoming-damage cue.
export function normalizeIncomingDamageEffect(event) {
  const effect = normalizeVisualEffect(event);
  return effect
    && effect.kind === 'damage'
    && effect.perspective === 'incoming'
    ? effect
    : null;
}

export function normalizeVisualPreview(payload) {
  if (!isObject(payload) || typeof payload.kind !== 'string') return null;

  if (payload.kind === 'planet') {
    return typeof payload.value === 'string' && VISUAL_PREVIEW_PLANETS.has(payload.value)
      ? { kind: 'planet', value: payload.value }
      : null;
  }

  if (payload.kind === 'terrain') {
    return typeof payload.value === 'string' && VISUAL_PREVIEW_TERRAINS.has(payload.value)
      ? { kind: 'terrain', value: payload.value }
      : null;
  }

  if (
    (payload.kind === 'low-health'
      || payload.kind === 'transition'
      || payload.kind === 'clear')
    && !Object.prototype.hasOwnProperty.call(payload, 'value')
  ) {
    return { kind: payload.kind };
  }

  return null;
}

export function reduceVisualEffectEvents(previous, payload) {
  const current = createVisualEffectsState(previous);
  if (!isObject(payload)) {
    return { state: current, effects: [] };
  }

  const epoch = normalizeEpoch(payload.epoch);
  if (!epoch) return { state: current, effects: [] };

  let lastSeq = epoch === current.epoch ? current.lastSeq : 0;
  const events = Array.isArray(payload.events)
    ? payload.events
      .filter(isObject)
      .slice(-MAX_VISUAL_EVENTS_PER_BATCH)
      .sort((left, right) => {
        const leftSeq = normalizeSequence(left.seq);
        const rightSeq = normalizeSequence(right.seq);
        return (leftSeq ?? Number.MAX_SAFE_INTEGER) - (rightSeq ?? Number.MAX_SAFE_INTEGER);
      })
    : [];
  const effects = [];

  for (const event of events) {
    const seq = normalizeSequence(event.seq);
    if (seq === null || seq <= lastSeq) continue;
    lastSeq = seq;

    const effect = normalizeVisualEffect(event);
    if (effect) effects.push(effect);
  }

  return {
    state: { epoch, lastSeq },
    effects,
  };
}

export function createVisualWorldState(overrides = {}) {
  return {
    epoch: normalizeEpoch(overrides.epoch),
    lastSeq: normalizeSequence(overrides.lastSeq) ?? 0,
    planet: firstAllowed(overrides.planet, PLANET_ALIASES),
    terrains: normalizeTerrainTokens(overrides.terrains),
    roomId: normalizeText(overrides.roomId, 160),
    area: normalizeText(overrides.area, 120),
    reason: ['snapshot', 'move', 'wayshard', 'refresh'].includes(overrides.reason)
      ? overrides.reason
      : 'snapshot',
  };
}

export function reduceVisualWorldState(previous, payload) {
  const current = createVisualWorldState(previous);
  if (!isObject(payload)) return { state: current, accepted: false, changed: false };

  const epoch = normalizeEpoch(payload.epoch);
  const seq = normalizeSequence(payload.seq);
  if (!epoch || seq === null) return { state: current, accepted: false, changed: false };
  if (epoch === current.epoch && seq <= current.lastSeq) {
    return { state: current, accepted: false, changed: false };
  }

  const next = createVisualWorldState({
    epoch,
    lastSeq: seq,
    planet: payload.planet,
    terrains: payload.terrains ?? payload.terrain ?? payload.environment,
    roomId: payload.room_id ?? payload.roomId ?? payload.num,
    area: payload.area,
    reason: payload.reason,
  });
  const changed = next.planet !== current.planet
    || next.terrains.join('|') !== current.terrains.join('|')
    || next.roomId !== current.roomId
    || next.area !== current.area;
  return { state: next, accepted: true, changed };
}

export function deriveRoomVisualContext(roomInfo) {
  if (!isObject(roomInfo)) return createVisualWorldState();
  return createVisualWorldState({
    planet: roomInfo.planet ?? roomInfo.world,
    terrains: roomInfo.terrains ?? roomInfo.terrain ?? roomInfo.environment ?? roomInfo.env,
    roomId: roomInfo.num ?? roomInfo.id,
    area: roomInfo.area ?? roomInfo.zone,
    reason: 'snapshot',
  });
}

export function reduceHealthState(previous = {}, vitals) {
  const priorHp = Number.isFinite(previous.hp) ? previous.hp : null;
  const priorMaxHp = Number.isFinite(previous.maxHp) ? previous.maxHp : null;
  const hp = firstFinite(vitals, ['hp', 'current_hp', 'currentHp']) ?? priorHp;
  const maxHp = firstFinite(vitals, ['maxhp', 'mhp', 'max_hp', 'maxHp']) ?? priorMaxHp;
  const valid = Number.isFinite(hp) && Number.isFinite(maxHp) && maxHp > 0;
  const ratio = valid ? Math.max(0, Math.min(1, hp / maxHp)) : null;
  return {
    hp,
    maxHp,
    ratio,
    alive: valid && hp > 0,
    lowHealth: valid && hp > 0 && ratio <= 0.4,
  };
}
