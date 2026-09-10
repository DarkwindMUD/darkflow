const VALID_STATUSES = new Set(['not_started', 'active', 'skipped', 'finished']);
const VALID_ACTIONS = new Set(['continue', 'directions', 'hint', 'restart', 'skip']);

export const TUTORIAL_VERSION = 2;
export const TUTORIAL_TARGETS = Object.freeze([
  'terminal',
  'command-input',
  'panels-menu',
  'inventory-panel',
  'vitals-panel',
  'enemy-panel',
]);

const VALID_TARGETS = new Set(TUTORIAL_TARGETS);

function safeText(value, maxLength = 320) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u001b]/g, '')
    .trim()
    .slice(0, maxLength);
}
function boundedInteger(value, fallback = 0, minimum = 0, maximum = 10000) {
  if (value === null || value === '' || typeof value === 'boolean') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

function protocolBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

function normalizeChapter(value) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    id: safeText(value.id, 64),
    index: boundedInteger(value.index),
    total: boundedInteger(value.total),
    title: safeText(value.title, 120),
  };
}

function normalizeStep(value) {
  value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const target = safeText(value.target, 64).toLowerCase();
  return {
    id: safeText(value.id, 96),
    index: boundedInteger(value.index),
    total: boundedInteger(value.total),
    title: safeText(value.title, 160),
    task: safeText(value.task, 600),
    hint: safeText(value.hint, 600),
    help: safeText(value.help, 160),
    exampleCommand: safeText(
      value.example_command !== undefined ? value.example_command : value.exampleCommand,
      240,
    ),
    target: VALID_TARGETS.has(target) ? target : '',
  };
}

function normalizeRoute(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const directions = (Array.isArray(value.directions) ? value.directions : [])
    .map((direction) => safeText(direction, 120))
    .filter(Boolean)
    .slice(0, 24);
  const place = safeText(value.place, 160);
  const text = safeText(value.text, 600);
  if (!place && !text && directions.length === 0) return null;
  return { place, directions, text };
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  const actions = [];
  const seen = new Set();
  for (const item of value) {
    const raw = item && typeof item === 'object' ? item.id || item.action : item;
    const action = safeText(raw, 32).toLowerCase();
    if (!VALID_ACTIONS.has(action) || seen.has(action)) continue;
    seen.add(action);
    actions.push(action);
  }
  return actions;
}

export function createTutorialState() {
  return {
    epoch: '',
    seq: 0,
    tutorialVersion: TUTORIAL_VERSION,
    status: 'not_started',
    awaitingContinue: false,
    chapter: normalizeChapter(null),
    step: normalizeStep(null),
    route: null,
    actions: [],
    reason: '',
    hintVisible: false,
    receivedAt: 0,
  };
}

export function normalizeTutorialState(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const tutorialVersion = boundedInteger(
    payload.tutorial_version !== undefined
      ? payload.tutorial_version
      : payload.tutorialVersion,
  );
  const status = safeText(payload.status, 32).toLowerCase();
  const epoch = safeText(payload.epoch, 128);
  const step = normalizeStep(payload.step);

  if (tutorialVersion !== TUTORIAL_VERSION
      || !epoch
      || !VALID_STATUSES.has(status)
      || (status === 'active' && !step.id)) {
    return null;
  }

  return {
    epoch,
    seq: boundedInteger(payload.seq, 0, 0, Number.MAX_SAFE_INTEGER),
    tutorialVersion,
    status,
    awaitingContinue: protocolBoolean(
      payload.awaiting_continue !== undefined
        ? payload.awaiting_continue
        : payload.awaitingContinue,
    ),
    chapter: normalizeChapter(payload.chapter),
    step,
    route: normalizeRoute(payload.route),
    actions: normalizeActions(payload.actions),
    reason: safeText(payload.reason, 120),
    hintVisible: protocolBoolean(
      payload.hint_visible !== undefined
        ? payload.hint_visible
        : payload.hintVisible,
    ),
  };
}

export function reduceTutorialState(current, payload, receivedAt = Date.now()) {
  const normalized = normalizeTutorialState(payload);
  if (!normalized) return current || createTutorialState();

  const previous = current || createTutorialState();
  const sameEpoch = normalized.epoch === previous.epoch;
  if (sameEpoch && normalized.seq <= previous.seq) return previous;

  return {
    ...normalized,
    receivedAt,
  };
}

export function tutorialStateKey(state) {
  if (!state || !state.epoch) return '';
  return state.epoch + ':' + state.seq;
}

export function buildTutorialAction(state, action) {
  const normalizedAction = safeText(action, 32).toLowerCase();
  if (!state
      || !state.epoch
      || !VALID_ACTIONS.has(normalizedAction)
      || !state.actions.includes(normalizedAction)) {
    return null;
  }

  return {
    action: normalizedAction,
    epoch: state.epoch,
    seq: state.seq,
    step_id: state.step && state.step.id ? state.step.id : '',
  };
}

export function tutorialProgress(state) {
  const step = state && state.step ? state.step : {};
  const total = Math.max(1, boundedInteger(step.total, 1, 1));
  const value = Math.min(total, Math.max(0, boundedInteger(step.index)));
  return {
    value,
    total,
    percent: Math.round((value / total) * 100),
  };
}

export function tutorialAnnouncement(state) {
  if (!state || state.status === 'not_started') return '';
  if (state.status === 'finished') return 'Tutorial complete.';
  if (state.status === 'skipped') return 'Tutorial skipped.';

  const step = state.step || {};
  const progress = tutorialProgress(state);
  const pieces = [
    `Tutorial step ${progress.value} of ${progress.total}.`,
    step.title,
    step.task,
  ];
  if (state.awaitingContinue && state.actions.includes('continue')) {
    pieces.push('Choose Continue when you are ready.');
  }
  return pieces.filter(Boolean).join(' ');
}
