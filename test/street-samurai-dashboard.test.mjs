import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.classList = { add: (...names) => {
      this.className = [this.className, ...names].filter(Boolean).join(' ');
    } };
    this.isConnected = true;
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this._textContent = '';
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  click() {
    this.listeners.get('click')?.({});
  }

  focus() {}

  querySelector(selector) {
    const tab = selector.match(/^\[data-tab="([^"]+)"\]$/)?.[1];
    if (tab && this.dataset.tab === tab) return this;
    for (const child of this.children) {
      const match = child.querySelector(selector);
      if (match) return match;
    }
    return null;
  }
}

globalThis.document = {
  hidden: false,
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
  createElement(tagName) { return new FakeElement(tagName); },
  body: {
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
  },
};

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
};

const {
  clampPercent,
  createStreetSamuraiDashboard,
  dashboardSeverity,
  normalizeStreetSamuraiState,
  disposeStreetSamuraiDashboard,
  renderStreetSamuraiDashboard,
  STREET_SAMURAI_PACKAGE,
  streetSamuraiDashboardView,
  updateStreetSamuraiDashboard,
  worstAlertSeverity,
} = await import('../public/js/street-samurai-dashboard.js');
const { DISPLAY_TYPES } = await import('../public/js/window-types.js');

function dashboardFixture(overrides = {}) {
  return normalizeStreetSamuraiState({
    protocol_version: 1,
    cortex_version: '3.1',
    firmware_version: 'Ronin-sama',
    grade: 'ghost',
    active: true,
    guild_level: 16,
    guild_level_max: 16,
    cortex_rank: 42,
    cortex_rank_max: 200,
    guild_xp: 1930,
    guild_xp_needed: 7000,
    cortex_effect: '105%',
    edge: 5,
    edge_max: 10,
    heat: 2,
    heat_max: 10,
    heat_band: 'Clean',
    biological: { current: 920, max: 1000, percent: 92 },
    strain: {
      used: 32,
      total: 36,
      free: 4,
      percent: 89,
      breakdown: { base: 20, level: 10, total: 36 },
    },
    target_locks: [{ name: 'Test target', remaining: 21 }],
    alerts: [{
      severity: 'warning',
      marker: '!',
      code: 'strain_high',
      message: 'Strain is high.',
    }],
    monitor_flags: { OC: 1, OD: 0 },
    active_firmware: ['Overclock'],
    processes: [{
      id: 'cortex_os',
      name: 'Cortex OS',
      grade: 'ghost',
      family: 'neural',
      load: 4,
      durability: 170,
      integrity: 100,
      fragmentation: 6,
      effectiveness: 100,
      patches: [],
      vulnerabilities: [],
      faults: [],
      state: 'RONIN KERNEL',
      state_severity: 'healthy',
    }],
    ...overrides,
  });
}

test('Street Samurai dashboard is an advertised custom window node', () => {
  assert.equal(STREET_SAMURAI_PACKAGE, 'Darkwind.StreetSamurai');
  assert.equal(DISPLAY_TYPES.has('street_samurai_dashboard'), true);
});

test('dashboard payload normalization preserves live game state', () => {
  const state = dashboardFixture();

  assert.equal(state.cortexVersion, '3.1');
  assert.equal(state.firmwareVersion, 'Ronin-sama');
  assert.equal(state.guildLevel, 16);
  assert.equal(state.strain.free, 4);
  assert.equal(state.targetLocks[0].name, 'Test target');
  assert.equal(state.monitorFlags.OC, true);
  assert.equal(state.monitorFlags.OD, false);
  assert.equal(state.processes[0].id, 'cortex_os');
  assert.equal(state.processes[0].state, 'RONIN KERNEL');
  assert.equal(state.processes[0].durability, 170);
  assert.equal(state.alerts[0].code, 'strain_high');
});

test('normalization clamps percentages and tolerates malformed collections', () => {
  const state = normalizeStreetSamuraiState({
    heat_percent: 140,
    biological: { percent: -12 },
    strain: { used: 5, total: 0, percent: 'not-a-number' },
    processes: 'not-an-array',
    alerts: null,
    monitor_flags: [],
  });

  assert.equal(clampPercent(140), 100);
  assert.equal(clampPercent(-1), 0);
  assert.equal(state.heatPercent, 100);
  assert.equal(state.biological.percent, 0);
  assert.equal(state.strain.percent, 0);
  assert.deepEqual(state.processes, []);
  assert.deepEqual(state.alerts, []);
  assert.deepEqual(state.monitorFlags, {});
});

test('dashboard severity follows the server-facing health thresholds', () => {
  const healthy = dashboardFixture();
  assert.equal(dashboardSeverity('biological', healthy), 'healthy');
  assert.equal(dashboardSeverity('thermal', healthy), 'healthy');
  assert.equal(dashboardSeverity('strain', healthy), 'warning');

  const critical = dashboardFixture({
    thermal_lockout: true,
    biological: { current: 20, max: 100, percent: 20 },
    strain: { used: 40, total: 36, percent: 100 },
  });
  assert.equal(dashboardSeverity('biological', critical), 'danger');
  assert.equal(dashboardSeverity('thermal', critical), 'danger');
  assert.equal(dashboardSeverity('strain', critical), 'danger');
});

test('alert rail uses the highest active severity', () => {
  assert.equal(worstAlertSeverity([]), 'healthy');
  assert.equal(worstAlertSeverity([{ severity: 'warning' }]), 'warning');
  assert.equal(worstAlertSeverity([
    { severity: 'warning' },
    { severity: 'danger' },
  ]), 'danger');
});

test('instance updates stay root-local, preserve the active tab, and render literal text', () => {
  streetSamuraiDashboardView.reset();
  const first = createStreetSamuraiDashboard({
    active_tab: 'overview',
    state: { firmware_version: 'First firmware' },
  });
  const second = createStreetSamuraiDashboard({
    active_tab: 'implants',
    state: { firmware_version: 'Second firmware' },
  });
  assert.equal(streetSamuraiDashboardView.roots.size, 0);

  first.querySelector('[data-tab="diagnostics"]').click();
  const literal = '<img src=x onerror=alert(1)>';
  assert.equal(updateStreetSamuraiDashboard(first, {
    alerts: [{ message: literal }],
  }), true);

  assert.equal(first.__ssActiveTab, 'diagnostics');
  assert.equal(first.querySelector('[data-tab="diagnostics"]').getAttribute('aria-selected'), 'true');
  assert.match(first.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(second.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(second.textContent, /SECOND FIRMWARE/);
  assert.equal(streetSamuraiDashboardView.getSnapshot(), null);

  const firstSnapshot = first.textContent;
  const secondSnapshot = second.textContent;
  streetSamuraiDashboardView.update({ firmware_version: 'Legacy broadcast' });
  assert.equal(first.textContent, firstSnapshot);
  assert.equal(second.textContent, secondSnapshot);

  streetSamuraiDashboardView.reset();
  assert.equal(updateStreetSamuraiDashboard(second, {
    firmware_version: 'Still instance owned',
  }), true);
  assert.match(second.textContent, /STILL INSTANCE OWNED/);
});

test('explicit unregister and reset prevent retained global updates', () => {
  streetSamuraiDashboardView.reset();
  const disposed = createStreetSamuraiDashboard({
    state: { firmware_version: 'Disposed firmware' },
  });
  const retained = renderStreetSamuraiDashboard({
    state: { firmware_version: 'Retained firmware' },
  });

  assert.equal(disposeStreetSamuraiDashboard(disposed), true);
  assert.equal(disposeStreetSamuraiDashboard(disposed), false);
  assert.equal(streetSamuraiDashboardView.roots.size, 1);
  assert.equal(updateStreetSamuraiDashboard(disposed, {
    firmware_version: 'Should not render',
  }), false);

  streetSamuraiDashboardView.update({
    firmware_version: 'Legacy broadcast',
  });
  assert.match(disposed.textContent, /DISPOSED FIRMWARE/);
  assert.doesNotMatch(disposed.textContent, /LEGACY BROADCAST/);
  assert.match(retained.textContent, /LEGACY BROADCAST/);
  assert.equal(streetSamuraiDashboardView.getSnapshot().firmwareVersion, 'Legacy broadcast');

  streetSamuraiDashboardView.reset();
  assert.equal(streetSamuraiDashboardView.roots.size, 0);
  assert.equal(streetSamuraiDashboardView.getSnapshot(), null);
  assert.equal(updateStreetSamuraiDashboard(retained, {}), false);
});
