export const DARKWIND_COMBAT_ACTOR_LIMIT = 16;
export const DARKWIND_COMBAT_EVENT_LIMIT = 12;

export type DarkwindCombatWireBoolean = boolean | 0 | 1;

export interface DarkwindCombatActor {
  id: string;
  name: string;
  role: string;
}

export interface DarkwindCombatState {
  epoch: string;
  encounter_id: string;
  seq: number;
  visual_enabled: boolean;
  effective: boolean;
  active: boolean;
  current_actor_id: string;
  current_target_id: string;
  actors: DarkwindCombatActor[];
  outcome: string;
  summary: string;
}

export type DarkwindCombatResult = "absorb" | "critical" | "dodge" | "hit" | "miss";
export type DarkwindCombatPerspective = "incoming" | "observed" | "outgoing";

export interface DarkwindCombatEvent {
  seq: number;
  kind: "attack";
  perspective: DarkwindCombatPerspective;
  actor_id: string;
  target_id: string;
  result: DarkwindCombatResult;
  damage?: number;
  absorbed?: number;
  summary: string;
}

export interface DarkwindCombatOverflow {
  omitted: number;
  hits: number;
  damage: number;
}

export interface DarkwindCombatEvents {
  epoch: string;
  encounter_id: string;
  first_seq: number;
  last_seq: number;
  events: DarkwindCombatEvent[];
  overflow: DarkwindCombatOverflow;
}

/** Compatibility shape for the retained singular Darkwind.Combat.Event package. */
export interface DarkwindCombatEventMessage extends DarkwindCombatEvent {
  epoch: string;
  encounter_id: string;
}

/** Darkwind.Combat.Resync is deliberately sent without a payload. */
export type DarkwindCombatResync = undefined;
export const DARKWIND_COMBAT_RESYNC: DarkwindCombatResync = undefined;

type NamedFields = Record<string, unknown>;

function record(input: unknown): NamedFields | null {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as NamedFields)
    : null;
}

function text(input: unknown, maximum: number, allowEmpty = false): string | null {
  if (typeof input !== "string") return null;
  // Match the retained core's terminal-safe text cleanup.
  // eslint-disable-next-line no-control-regex
  const value = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u001b]/g, "").trim();
  return value.length <= maximum && (allowEmpty || value.length > 0) ? value : null;
}

function integer(input: unknown): number | null {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0 ? input : null;
}

function protocolBoolean(input: unknown): boolean | null {
  if (input === true || input === 1) return true;
  if (input === false || input === 0) return false;
  return null;
}

function own(value: NamedFields, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Selects only State fields and caps actors before any actor is traversed. */
export function extractDarkwindCombatStateFields(input: unknown): NamedFields | null {
  const value = record(input);
  if (!value) return null;
  if (value.actors !== undefined && !Array.isArray(value.actors)) return null;
  return {
    epoch: value.epoch,
    encounter_id: value.encounter_id,
    seq: value.seq,
    visual_enabled: value.visual_enabled,
    effective: value.effective,
    active: value.active,
    current_actor_id: value.current_actor_id,
    current_target_id: value.current_target_id,
    actors: Array.isArray(value.actors) ? value.actors.slice(0, DARKWIND_COMBAT_ACTOR_LIMIT) : [],
    outcome: value.outcome,
    summary: value.summary,
  };
}

function normalizeActor(input: unknown): DarkwindCombatActor | null {
  const value = record(input);
  if (!value) return null;
  const id = text(value.id, 96);
  const name = text(value.name, 120);
  const role = text(value.role ?? "participant", 32);
  return id && name && role ? { id, name, role: role.toLowerCase() } : null;
}

/** Returns a clean, bounded Combat State or null for malformed retained fields. */
export function normalizeDarkwindCombatState(input: unknown): DarkwindCombatState | null {
  const value = extractDarkwindCombatStateFields(input);
  if (!value) return null;
  const epoch = text(value.epoch, 128);
  const encounterId = text(value.encounter_id, 128, true);
  const seq = integer(value.seq);
  const visualEnabled = protocolBoolean(value.visual_enabled);
  const effective = protocolBoolean(value.effective);
  const active = protocolBoolean(value.active);
  const currentActorId = text(value.current_actor_id ?? "", 96, true);
  const currentTargetId = text(value.current_target_id ?? "", 96, true);
  const outcome = text(value.outcome ?? "", 48, true);
  const summary = text(value.summary ?? "", 320, true);
  if (
    !epoch ||
    encounterId === null ||
    seq === null ||
    visualEnabled === null ||
    effective === null ||
    active === null ||
    currentActorId === null ||
    currentTargetId === null ||
    outcome === null ||
    summary === null ||
    (active && !encounterId)
  )
    return null;

  const actors: DarkwindCombatActor[] = [];
  for (const raw of value.actors as unknown[]) {
    const actor = normalizeActor(raw);
    if (!actor) return null;
    actors.push(actor);
  }
  return {
    epoch,
    encounter_id: encounterId,
    seq,
    visual_enabled: visualEnabled,
    effective,
    active,
    current_actor_id: currentActorId,
    current_target_id: currentTargetId,
    actors,
    outcome: outcome.toLowerCase(),
    summary,
  };
}

function normalizeEventRow(input: unknown): DarkwindCombatEvent | null {
  const value = record(input);
  if (!value) return null;
  const seq = integer(value.seq);
  const kind = text(value.kind, 32)?.toLowerCase();
  const perspective = text(value.perspective, 24)?.toLowerCase();
  const actorId = text(value.actor_id, 96);
  const targetId = text(value.target_id, 96);
  const result = text(value.result, 24)?.toLowerCase();
  const summary = text(value.summary ?? "", 320, true);
  if (
    seq === null ||
    seq < 1 ||
    kind !== "attack" ||
    !["incoming", "observed", "outgoing"].includes(perspective ?? "") ||
    !actorId ||
    !targetId ||
    !["absorb", "critical", "dodge", "hit", "miss"].includes(result ?? "") ||
    summary === null
  )
    return null;

  const event: DarkwindCombatEvent = {
    seq,
    kind,
    perspective: perspective as DarkwindCombatPerspective,
    actor_id: actorId,
    target_id: targetId,
    result: result as DarkwindCombatResult,
    summary,
  };
  for (const field of ["damage", "absorbed"] as const) {
    if (!own(value, field)) continue;
    const amount = integer(value[field]);
    if (amount === null) return null;
    event[field] = amount;
  }
  return event;
}

function normalizeOverflow(input: unknown): DarkwindCombatOverflow | null {
  if (input === undefined) return { omitted: 0, hits: 0, damage: 0 };
  const value = record(input);
  if (!value) return null;
  const omitted = integer(value.omitted);
  const hits = integer(value.hits);
  const damage = integer(value.damage);
  return omitted === null || hits === null || damage === null ? null : { omitted, hits, damage };
}

/** Selects only Events fields and caps events before any event is traversed. */
export function extractDarkwindCombatEventsFields(input: unknown): NamedFields | null {
  const value = record(input);
  if (!value || !Array.isArray(value.events)) return null;
  return {
    epoch: value.epoch,
    encounter_id: value.encounter_id,
    first_seq: value.first_seq,
    last_seq: value.last_seq,
    events: value.events.slice(0, DARKWIND_COMBAT_EVENT_LIMIT),
    overflow: value.overflow,
  };
}

/** Returns a clean, bounded Combat Events batch or null for malformed retained fields. */
export function normalizeDarkwindCombatEvents(input: unknown): DarkwindCombatEvents | null {
  const value = extractDarkwindCombatEventsFields(input);
  if (!value) return null;
  const epoch = text(value.epoch, 128);
  const encounterId = text(value.encounter_id, 128);
  const firstSeq = integer(value.first_seq);
  const lastSeq = integer(value.last_seq);
  const overflow = normalizeOverflow(value.overflow);
  if (
    !epoch ||
    !encounterId ||
    firstSeq === null ||
    firstSeq < 1 ||
    lastSeq === null ||
    lastSeq < firstSeq ||
    !overflow
  )
    return null;

  const events: DarkwindCombatEvent[] = [];
  for (const raw of value.events as unknown[]) {
    const event = normalizeEventRow(raw);
    if (!event || event.seq < firstSeq || event.seq > lastSeq) return null;
    events.push(event);
  }
  return {
    epoch,
    encounter_id: encounterId,
    first_seq: firstSeq,
    last_seq: lastSeq,
    events,
    overflow,
  };
}

/** Selects only singular Event fields before compatibility validation. */
export function extractDarkwindCombatEventFields(input: unknown): NamedFields | null {
  const value = record(input);
  if (!value) return null;
  return {
    epoch: value.epoch,
    encounter_id: value.encounter_id,
    seq: value.seq,
    kind: value.kind,
    perspective: value.perspective,
    actor_id: value.actor_id,
    target_id: value.target_id,
    result: value.result,
    ...(own(value, "damage") ? { damage: value.damage } : {}),
    ...(own(value, "absorbed") ? { absorbed: value.absorbed } : {}),
    summary: value.summary,
  };
}

/** Returns a clean retained singular Event compatibility payload. */
export function normalizeDarkwindCombatEvent(input: unknown): DarkwindCombatEventMessage | null {
  const value = extractDarkwindCombatEventFields(input);
  if (!value) return null;
  const epoch = text(value.epoch, 128);
  const encounterId = text(value.encounter_id, 128);
  const event = normalizeEventRow(value);
  return epoch && encounterId && event ? { epoch, encounter_id: encounterId, ...event } : null;
}
