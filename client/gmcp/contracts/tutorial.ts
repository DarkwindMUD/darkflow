export const DARKWIND_TUTORIAL_ROUTE_LIMIT = 24;
export const DARKWIND_TUTORIAL_ACTION_LIMIT = 5;
export const DARKWIND_TUTORIAL_VERSION = 2;

export const DARKWIND_TUTORIAL_ACTIONS = [
  "continue",
  "directions",
  "hint",
  "restart",
  "skip",
] as const;
export type DarkwindTutorialActionName = (typeof DARKWIND_TUTORIAL_ACTIONS)[number];

export const DARKWIND_TUTORIAL_RESYNC_REASONS = [
  "action-timeout",
  "handshake-retry",
  "login",
  "reconnect",
  "tutorial-connected",
  "tutorial-manager-init",
  "tutorial-render-recovered",
  "tutorial-resync",
  "tutorial-session-recovered",
] as const;
export type DarkwindTutorialResyncReason = (typeof DARKWIND_TUTORIAL_RESYNC_REASONS)[number];

export const DARKWIND_TUTORIAL_TARGETS = [
  "terminal",
  "command-input",
  "panels-menu",
  "inventory-panel",
  "vitals-panel",
  "enemy-panel",
] as const;
export type DarkwindTutorialTarget = (typeof DARKWIND_TUTORIAL_TARGETS)[number] | "";
export type DarkwindTutorialStatus = "active" | "finished" | "not_started" | "skipped";

export interface DarkwindTutorialChapter {
  id: string;
  index: number;
  total: number;
  title: string;
}

export interface DarkwindTutorialStep {
  id: string;
  index: number;
  total: number;
  title: string;
  task: string;
  hint: string;
  help: string;
  example_command: string;
  target: DarkwindTutorialTarget;
}

export interface DarkwindTutorialRoute {
  place: string;
  directions: string[];
  text: string;
}

export interface DarkwindTutorialState {
  epoch: string;
  seq: number;
  tutorial_version: 2;
  status: DarkwindTutorialStatus;
  awaiting_continue: boolean;
  chapter: DarkwindTutorialChapter;
  step: DarkwindTutorialStep;
  route: DarkwindTutorialRoute | null;
  actions: DarkwindTutorialActionName[];
  reason: string;
  hint_visible: boolean;
}

export interface DarkwindTutorialControl {
  visible: boolean;
  reason: string;
}

export interface DarkwindTutorialAction {
  action: DarkwindTutorialActionName;
  epoch: string;
  seq: number;
  step_id: string;
}

export interface DarkwindTutorialResync {
  epoch: string;
  seq: number;
  reason: DarkwindTutorialResyncReason;
}

type NamedFields = Record<string, unknown>;
const actions = new Set<string>(DARKWIND_TUTORIAL_ACTIONS);
const resyncReasons = new Set<string>(DARKWIND_TUTORIAL_RESYNC_REASONS);
const targets = new Set<string>(DARKWIND_TUTORIAL_TARGETS);
const statuses = new Set<string>(["active", "finished", "not_started", "skipped"]);

function record(input: unknown): NamedFields | null {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as NamedFields)
    : null;
}

function text(input: unknown, maximum = 320, allowEmpty = false): string | null {
  if (typeof input !== "string") return null;
  // Match the retained core's terminal-safe text cleanup.
  // eslint-disable-next-line no-control-regex
  const value = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u001b]/g, "").trim();
  return value.length <= maximum && (allowEmpty || value.length > 0) ? value : null;
}

function integer(input: unknown, minimum = 0, maximum = 10_000): number | null {
  return typeof input === "number" &&
    Number.isSafeInteger(input) &&
    input >= minimum &&
    input <= maximum
    ? input
    : null;
}

function sequence(input: unknown): number | null {
  return typeof input === "number" && Number.isInteger(input) && input >= 0 ? input : null;
}

function protocolBoolean(input: unknown): boolean | null {
  if (input === true || input === 1) return true;
  if (input === false || input === 0) return false;
  return null;
}

function normalizeChapter(input: unknown): DarkwindTutorialChapter | null {
  const value = record(input);
  if (!value) return null;
  const id = text(value.id, 64);
  const index = integer(value.index);
  const total = integer(value.total);
  const title = text(value.title ?? "", 120, true);
  return !id || index === null || total === null || title === null
    ? null
    : { id, index, total, title };
}

function normalizeStep(input: unknown): DarkwindTutorialStep | null {
  const value = record(input);
  if (!value) return null;
  const id = text(value.id ?? "", 96, true);
  const index = integer(value.index);
  const total = integer(value.total);
  const title = text(value.title ?? "", 160, true);
  const task = text(value.task ?? "", 600, true);
  const hint = text(value.hint ?? "", 600, true);
  const help = text(value.help ?? "", 160, true);
  const exampleCommand = text(value.example_command ?? value.exampleCommand ?? "", 240, true);
  const targetText = text(value.target ?? "", 64, true)?.toLowerCase();
  if (
    id === null ||
    index === null ||
    total === null ||
    title === null ||
    task === null ||
    hint === null ||
    help === null ||
    exampleCommand === null ||
    targetText === undefined ||
    targetText === null
  )
    return null;
  return {
    id,
    index,
    total,
    title,
    task,
    hint,
    help,
    example_command: exampleCommand,
    target: (targets.has(targetText) ? targetText : "") as DarkwindTutorialTarget,
  };
}

function normalizeRoute(input: unknown): DarkwindTutorialRoute | null | false {
  if (input === null || input === 0 || input === undefined) return null;
  const value = record(input);
  if (!value || !Array.isArray(value.directions)) return false;
  const place = text(value.place ?? "", 160, true);
  const routeText = text(value.text ?? "", 600, true);
  if (place === null || routeText === null) return false;
  const directions: string[] = [];
  for (const raw of value.directions.slice(0, DARKWIND_TUTORIAL_ROUTE_LIMIT)) {
    const direction = text(raw, 120);
    if (!direction) return false;
    directions.push(direction);
  }
  return { place, directions, text: routeText };
}

function normalizeActions(input: unknown): DarkwindTutorialActionName[] | null {
  if (!Array.isArray(input)) return null;
  const normalized: DarkwindTutorialActionName[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, DARKWIND_TUTORIAL_ACTION_LIMIT)) {
    const row = record(raw);
    const action = text(row ? (row.id ?? row.action) : raw, 32)?.toLowerCase();
    if (!action || !actions.has(action)) return null;
    if (!seen.has(action)) normalized.push(action as DarkwindTutorialActionName);
    seen.add(action);
  }
  return normalized;
}

/** Selects only State fields and caps directions/actions before row traversal. */
export function extractDarkwindTutorialStateFields(input: unknown): NamedFields | null {
  const value = record(input);
  if (!value) return null;
  const route =
    value.route === null || value.route === 0 || value.route === undefined
      ? value.route
      : record(value.route);
  if (route === null && value.route !== null && value.route !== 0 && value.route !== undefined)
    return null;
  if (route && !Array.isArray(route.directions)) return null;
  if (!Array.isArray(value.actions)) return null;
  return {
    epoch: value.epoch,
    seq: value.seq,
    tutorial_version: value.tutorial_version ?? value.tutorialVersion,
    status: value.status,
    awaiting_continue: value.awaiting_continue ?? value.awaitingContinue,
    chapter: value.chapter,
    step: value.step,
    route: route
      ? {
          place: route.place,
          directions: (route.directions as unknown[]).slice(0, DARKWIND_TUTORIAL_ROUTE_LIMIT),
          text: route.text,
        }
      : route,
    actions: value.actions.slice(0, DARKWIND_TUTORIAL_ACTION_LIMIT),
    reason: value.reason,
    hint_visible: value.hint_visible ?? value.hintVisible,
  };
}

/** Returns a clean, bounded Tutorial v2 State or null for malformed retained fields. */
export function normalizeDarkwindTutorialState(input: unknown): DarkwindTutorialState | null {
  const value = extractDarkwindTutorialStateFields(input);
  if (!value) return null;
  const epoch = text(value.epoch, 128);
  const seq = integer(value.seq);
  const version = integer(value.tutorial_version);
  const status = text(value.status, 32)?.toLowerCase();
  const awaitingContinue = protocolBoolean(value.awaiting_continue);
  const chapter = normalizeChapter(value.chapter);
  const step = normalizeStep(value.step);
  const route = normalizeRoute(value.route);
  const stateActions = normalizeActions(value.actions);
  const reason = text(value.reason ?? "", 120, true);
  const hintVisible = protocolBoolean(value.hint_visible ?? false);
  if (
    !epoch ||
    seq === null ||
    version !== DARKWIND_TUTORIAL_VERSION ||
    !status ||
    !statuses.has(status) ||
    awaitingContinue === null ||
    !chapter ||
    !step ||
    route === false ||
    !stateActions ||
    reason === null ||
    hintVisible === null ||
    (status === "active" && !step.id)
  )
    return null;
  return {
    epoch,
    seq,
    tutorial_version: DARKWIND_TUTORIAL_VERSION,
    status: status as DarkwindTutorialStatus,
    awaiting_continue: awaitingContinue,
    chapter,
    step,
    route,
    actions: stateActions,
    reason,
    hint_visible: hintVisible,
  };
}

/** Selects only Control fields before validation. */
export function extractDarkwindTutorialControlFields(input: unknown): NamedFields | null {
  const value = record(input);
  return value ? { visible: value.visible, reason: value.reason } : null;
}

export function normalizeDarkwindTutorialControl(input: unknown): DarkwindTutorialControl | null {
  const value = extractDarkwindTutorialControlFields(input);
  if (!value) return null;
  const visible = protocolBoolean(value.visible);
  const reason = text(value.reason ?? "", 120, true);
  return visible === null || reason === null ? null : { visible, reason };
}

/** Selects only Action fields before validation. */
export function extractDarkwindTutorialActionFields(input: unknown): NamedFields | null {
  const value = record(input);
  return value
    ? { action: value.action, epoch: value.epoch, seq: value.seq, step_id: value.step_id }
    : null;
}

export function normalizeDarkwindTutorialAction(input: unknown): DarkwindTutorialAction | null {
  const value = extractDarkwindTutorialActionFields(input);
  if (!value) return null;
  const action = text(value.action, 32);
  const epoch = text(value.epoch, 128);
  const seq = sequence(value.seq);
  const stepId = text(value.step_id ?? "", 96, true);
  return !action || !actions.has(action) || !epoch || seq === null || stepId === null
    ? null
    : { action: action as DarkwindTutorialActionName, epoch, seq, step_id: stepId };
}

/** Selects only Resync fields before validation. */
export function extractDarkwindTutorialResyncFields(input: unknown): NamedFields | null {
  const value = record(input);
  return value ? { epoch: value.epoch, seq: value.seq, reason: value.reason } : null;
}

export function normalizeDarkwindTutorialResync(input: unknown): DarkwindTutorialResync | null {
  const value = extractDarkwindTutorialResyncFields(input);
  if (!value) return null;
  const epoch = text(value.epoch ?? "", 128, true);
  const seq = sequence(value.seq);
  const reason = text(value.reason, 120);
  return epoch === null || seq === null || !reason || !resyncReasons.has(reason)
    ? null
    : { epoch, seq, reason: reason as DarkwindTutorialResyncReason };
}
