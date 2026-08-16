export const STREET_SAMURAI_PACKAGE = 'Darkwind.StreetSamurai';

const VALID_TABS = new Set(['overview', 'implants', 'diagnostics']);
const VALID_SEVERITIES = new Set(['healthy', 'warning', 'danger']);
const TAB_LABELS = {
  overview: 'Overview',
  implants: 'Implants',
  diagnostics: 'Diagnostics',
};

let dashboardSequence = 0;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, finiteNumber(value)));
}

function textValue(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => entry !== undefined && entry !== null).map(String)
    : [];
}

function severityValue(value, fallback = 'healthy') {
  const severity = textValue(value).toLowerCase();
  return VALID_SEVERITIES.has(severity) ? severity : fallback;
}

function normalizeProcess(process, index) {
  const source = process && typeof process === 'object' ? process : {};
  const integrity = clampPercent(source.integrity);
  const fragmentation = clampPercent(source.fragmentation);
  const effectiveness = clampPercent(source.effectiveness);
  const durability = nonNegativeNumber(source.durability);

  return {
    id: textValue(source.id, 'process_' + (index + 1)),
    name: textValue(source.name, textValue(source.id, 'Unknown process')),
    grade: textValue(source.grade, 'unknown'),
    family: textValue(source.family, ''),
    load: nonNegativeNumber(source.load),
    durability,
    integrity,
    fragmentation,
    effectiveness,
    alerts: stringArray(source.alerts),
    patches: stringArray(source.patches),
    vulnerabilities: stringArray(source.vulnerabilities),
    faults: stringArray(source.faults),
    state: textValue(source.state, 'UNKNOWN'),
    stateSeverity: severityValue(source.state_severity,
      integrity <= 25 ? 'danger' : integrity <= 50 ? 'warning' : 'healthy'),
  };
}

function normalizeAlert(alert, index) {
  const source = alert && typeof alert === 'object' ? alert : {};
  return {
    code: textValue(source.code, 'alert_' + (index + 1)),
    marker: textValue(source.marker, '!').slice(0, 1) || '!',
    message: textValue(source.message, 'Unknown Cortex OS alert.'),
    process: textValue(source.process),
    severity: severityValue(source.severity, 'warning'),
  };
}

function normalizeTargetLock(lock) {
  const source = lock && typeof lock === 'object' ? lock : {};
  return {
    name: textValue(source.name, 'Unknown target'),
    remaining: nonNegativeNumber(source.remaining),
  };
}

export function normalizeStreetSamuraiState(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const biologicalSource = source.biological && typeof source.biological === 'object'
    ? source.biological
    : {};
  const strainSource = source.strain && typeof source.strain === 'object'
    ? source.strain
    : {};
  const breakdown = strainSource.breakdown && typeof strainSource.breakdown === 'object'
    ? strainSource.breakdown
    : {};
  const heatMax = Math.max(0, finiteNumber(source.heat_max));
  const heat = nonNegativeNumber(source.heat);
  const biologicalMax = Math.max(0, finiteNumber(biologicalSource.max));
  const biologicalCurrent = nonNegativeNumber(biologicalSource.current);
  const strainTotal = Math.max(0, finiteNumber(strainSource.total));
  const strainUsed = nonNegativeNumber(strainSource.used);
  const processes = Array.isArray(source.processes)
    ? source.processes.map(normalizeProcess)
    : [];
  const alerts = Array.isArray(source.alerts)
    ? source.alerts.map(normalizeAlert)
    : [];
  const targetLocks = Array.isArray(source.target_locks)
    ? source.target_locks.map(normalizeTargetLock)
    : [];
  const monitorFlags = source.monitor_flags && typeof source.monitor_flags === 'object'
    ? Object.fromEntries(Object.entries(source.monitor_flags)
      .map(([key, value]) => [String(key), !!value]))
    : {};

  return {
    protocolVersion: nonNegativeNumber(source.protocol_version, 1),
    maintenanceVersion: nonNegativeNumber(
      source.maintenance_version !== undefined
        ? source.maintenance_version
        : source.version
    ),
    cortexVersion: textValue(source.cortex_version, '3.1'),
    firmwareVersion: textValue(source.firmware_version, 'Unknown'),
    grade: textValue(source.grade, 'no-os'),
    active: source.active !== false,
    guildLevel: nonNegativeNumber(source.guild_level),
    guildLevelMax: nonNegativeNumber(source.guild_level_max, 16),
    cortexRank: nonNegativeNumber(source.cortex_rank),
    cortexRankMax: nonNegativeNumber(source.cortex_rank_max, 200),
    guildXp: nonNegativeNumber(source.guild_xp),
    guildXpNeeded: nonNegativeNumber(source.guild_xp_needed),
    cortexEffect: textValue(source.cortex_effect, '100%'),
    edge: nonNegativeNumber(source.edge),
    edgeMax: nonNegativeNumber(source.edge_max),
    heat,
    heatMax,
    heatPercent: clampPercent(
      source.heat_percent !== undefined
        ? source.heat_percent
        : heatMax > 0 ? heat * 100 / heatMax : 0
    ),
    heatBand: textValue(source.heat_band, 'Clean'),
    thermalLockout: !!source.thermal_lockout,
    biological: {
      current: biologicalCurrent,
      max: biologicalMax,
      percent: clampPercent(
        biologicalSource.percent !== undefined
          ? biologicalSource.percent
          : biologicalMax > 0 ? biologicalCurrent * 100 / biologicalMax : 0
      ),
    },
    strain: {
      used: strainUsed,
      total: strainTotal,
      free: Math.max(0, finiteNumber(
        strainSource.free,
        strainTotal - strainUsed
      )),
      percent: clampPercent(
        strainSource.percent !== undefined
          ? strainSource.percent
          : strainTotal > 0 ? strainUsed * 100 / strainTotal : 0
      ),
      breakdown,
    },
    targetLocks,
    targetLockSummary: textValue(
      source.target_lock_summary,
      targetLocks.length ? targetLocks.map((lock) => lock.name).join(', ') : 'none'
    ),
    alerts,
    monitorFlags,
    activeFirmware: stringArray(source.active_firmware),
    automationRemaining: nonNegativeNumber(source.automation_remaining),
    processes,
    updatedAt: nonNegativeNumber(source.updated_at),
    receivedAt: Date.now(),
  };
}

export function dashboardSeverity(kind, state) {
  if (kind === 'biological') {
    if (state.biological.percent <= 25) return 'danger';
    if (state.biological.percent <= 50) return 'warning';
    return 'healthy';
  }
  if (kind === 'thermal') {
    if (state.thermalLockout || state.heatBand.toLowerCase() === 'overheat') {
      return 'danger';
    }
    if (state.heatBand.toLowerCase() === 'redline') return 'warning';
    return 'healthy';
  }
  if (kind === 'strain') {
    if (state.strain.total < 1 || state.strain.used > state.strain.total) {
      return 'danger';
    }
    if (state.strain.percent >= 75) return 'warning';
    return 'healthy';
  }
  if (kind === 'edge') {
    return state.edge > 0 ? 'healthy' : 'warning';
  }
  return 'healthy';
}

export function worstAlertSeverity(alerts = []) {
  if (alerts.some((alert) => alert.severity === 'danger')) return 'danger';
  if (alerts.some((alert) => alert.severity === 'warning')) return 'warning';
  return 'healthy';
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function appendTextPair(parent, label, value, className = '') {
  const row = node('div', 'ss-data-row' + (className ? ' ' + className : ''));
  row.appendChild(node('span', 'ss-data-label', label));
  row.appendChild(node('span', 'ss-data-value', value));
  parent.appendChild(row);
  return row;
}

function formatRatio(current, maximum, maximumLabel = 'MAX') {
  return current + '/' + (maximum > 0 ? maximum : maximumLabel);
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(finiteNumber(totalSeconds)));
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + 'm ' + remainder + 's';
}

function buildMeter(label, value, detail, severity, compact = false) {
  const wrap = node('div', 'ss-meter ss-severity-' + severity +
    (compact ? ' ss-meter-compact' : ''));
  const heading = node('div', 'ss-meter-heading');
  heading.appendChild(node('span', 'ss-meter-label', label));
  heading.appendChild(node('span', 'ss-meter-value', detail));
  wrap.appendChild(heading);
  const track = node('div', 'ss-meter-track');
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(Math.round(clampPercent(value))));
  const fill = node('div', 'ss-meter-fill');
  fill.style.width = clampPercent(value) + '%';
  track.appendChild(fill);
  wrap.appendChild(track);
  return wrap;
}

function buildStatusDeck(state) {
  const deck = node('header', 'ss-status-deck');
  const identity = node('div', 'ss-identity');
  identity.appendChild(node('div', 'ss-identity-title',
    'CORTEX OS V' + state.cortexVersion));
  identity.appendChild(node('div', 'ss-identity-subtitle',
    state.grade.toUpperCase() + '-GRADE / ' +
    state.firmwareVersion.toUpperCase()));
  deck.appendChild(identity);

  const bio = node('div', 'ss-status-meter');
  bio.appendChild(buildMeter('BIO INTEGRITY', state.biological.percent,
    Math.round(state.biological.percent) + '%',
    dashboardSeverity('biological', state), true));
  deck.appendChild(bio);

  const thermal = node('div', 'ss-status-meter');
  thermal.appendChild(buildMeter('THERMAL', state.heatPercent,
    Math.round(state.heatPercent) + '% [' +
      (state.thermalLockout ? 'LOCKOUT' : state.heatBand.toUpperCase()) + ']',
    dashboardSeverity('thermal', state), true));
  deck.appendChild(thermal);

  const facts = [
    ['GL', formatRatio(state.guildLevel, state.guildLevelMax)],
    ['CR', formatRatio(state.cortexRank, state.cortexRankMax)],
    ['GXP', state.guildXpNeeded > 0
      ? formatRatio(state.guildXp, state.guildXpNeeded)
      : state.guildXp + '/MAX'],
    ['EDGE', formatRatio(state.edge, state.edgeMax)],
    ['CONTRACT', state.active ? 'ACTIVE' : 'INACTIVE'],
    ['TARGET LOCKS', state.targetLocks.length
      ? String(state.targetLocks.length)
      : 'NONE'],
  ];
  for (const [label, value] of facts) {
    const fact = node('div', 'ss-status-fact');
    fact.appendChild(node('span', 'ss-status-fact-label', label));
    fact.appendChild(node('strong', 'ss-status-fact-value', value));
    if (label === 'CONTRACT') {
      fact.classList.add(state.active ? 'ss-status-active' : 'ss-status-warning');
    }
    deck.appendChild(fact);
  }
  return deck;
}

function buildGauge(label, value, detail, severity) {
  const gauge = node('div', 'ss-gauge ss-severity-' + severity);
  gauge.style.setProperty('--ss-gauge-value', clampPercent(value) + '%');
  const dial = node('div', 'ss-gauge-dial');
  const dialValue = node('strong', 'ss-gauge-value', Math.round(value) + '%');
  dial.appendChild(dialValue);
  gauge.appendChild(dial);
  gauge.appendChild(node('div', 'ss-gauge-label', label));
  gauge.appendChild(node('div', 'ss-gauge-detail', detail));
  return gauge;
}

function buildCortexVisual(state, compact = false) {
  const visual = node('figure', 'ss-cortex-visual' +
    (compact ? ' ss-cortex-visual-compact' : ''));
  const frame = node('div', 'ss-cortex-frame');
  const image = document.createElement('img');
  image.src = '/assets/street-samurai-cortex.png';
  image.alt = 'Street Samurai cybernetic anatomy diagnostic';
  image.draggable = false;
  frame.appendChild(image);
  const scan = node('div', 'ss-cortex-scanline');
  scan.setAttribute('aria-hidden', 'true');
  frame.appendChild(scan);
  visual.appendChild(frame);

  const caption = node('figcaption', 'ss-cortex-caption');
  caption.appendChild(node('span', 'ss-cortex-link',
    state.active ? 'CORTEX LINK ONLINE' : 'CORTEX LINK PAUSED'));
  caption.appendChild(node('strong', '', state.processes.length + ' IMPLANTS'));
  visual.appendChild(caption);
  return visual;
}

function buildOverview(state) {
  const view = node('div', 'ss-overview');
  view.appendChild(buildCortexVisual(state));

  const main = node('div', 'ss-overview-main');
  main.appendChild(node('h2', 'ss-section-title', 'SYSTEM OVERVIEW'));
  const gauges = node('div', 'ss-gauge-grid');
  gauges.appendChild(buildGauge('BIO INTEGRITY', state.biological.percent,
    formatRatio(state.biological.current, state.biological.max) + ' HP',
    dashboardSeverity('biological', state)));
  gauges.appendChild(buildGauge('THERMAL', state.heatPercent,
    formatRatio(state.heat, state.heatMax) + ' ' +
      (state.thermalLockout ? 'LOCKOUT' : state.heatBand.toUpperCase()),
    dashboardSeverity('thermal', state)));
  gauges.appendChild(buildGauge('CYBERNETIC STRAIN', state.strain.percent,
    formatRatio(state.strain.used, state.strain.total),
    dashboardSeverity('strain', state)));
  gauges.appendChild(buildGauge('EDGE RESERVE',
    state.edgeMax > 0 ? state.edge * 100 / state.edgeMax : 0,
    formatRatio(state.edge, state.edgeMax),
    dashboardSeverity('edge', state)));
  main.appendChild(gauges);

  const details = node('div', 'ss-overview-details');
  const progression = node('section', 'ss-detail-block');
  progression.appendChild(node('h3', 'ss-detail-title', 'PROGRESSION'));
  appendTextPair(progression, 'Guild level',
    formatRatio(state.guildLevel, state.guildLevelMax));
  appendTextPair(progression, 'Cortex rank',
    formatRatio(state.cortexRank, state.cortexRankMax));
  appendTextPair(progression, 'Cortex throughput', state.cortexEffect);
  appendTextPair(progression, 'Guild XP', state.guildXpNeeded > 0
    ? formatRatio(state.guildXp, state.guildXpNeeded)
    : state.guildXp + ' / MAX');
  details.appendChild(progression);

  const firmware = node('section', 'ss-detail-block');
  firmware.appendChild(node('h3', 'ss-detail-title', 'ACTIVE FIRMWARE'));
  if (state.activeFirmware.length) {
    const list = node('div', 'ss-chip-list');
    for (const name of state.activeFirmware) {
      list.appendChild(node('span', 'ss-chip ss-chip-online', name));
    }
    firmware.appendChild(list);
  } else {
    firmware.appendChild(node('p', 'ss-empty', 'No active firmware routines.'));
  }
  details.appendChild(firmware);

  const locks = node('section', 'ss-detail-block');
  locks.appendChild(node('h3', 'ss-detail-title', 'TARGET LOCKS'));
  if (state.targetLocks.length) {
    for (const lock of state.targetLocks) {
      appendTextPair(locks, lock.name, formatDuration(lock.remaining),
        'ss-lock-row');
    }
  } else {
    locks.appendChild(node('p', 'ss-empty', 'No targets acquired.'));
  }
  details.appendChild(locks);
  main.appendChild(details);
  view.appendChild(main);
  return view;
}

function processIssueCount(process) {
  return process.patches.length + process.vulnerabilities.length +
    process.faults.length;
}

function buildImplantTable(state) {
  const table = node('div', 'ss-implant-table');
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', 'Installed Street Samurai implants');

  const heading = node('div', 'ss-implant-row ss-implant-heading');
  heading.setAttribute('role', 'row');
  for (const label of ['#', 'Process', 'Grade', 'Load', 'Frag',
    'Integrity', 'State']) {
    const cell = node('span', '', label);
    cell.setAttribute('role', 'columnheader');
    heading.appendChild(cell);
  }
  table.appendChild(heading);

  state.processes.forEach((process, index) => {
    const row = node('div', 'ss-implant-row ss-severity-' +
      process.stateSeverity);
    row.setAttribute('role', 'row');
    row.dataset.processId = process.id;

    const values = [
      String(index + 1),
      null,
      process.grade.toUpperCase(),
      String(process.load),
      Math.round(process.fragmentation) + '%',
      null,
      process.state,
    ];
    values.forEach((value, cellIndex) => {
      const cell = node('span', 'ss-implant-cell ss-implant-cell-' + cellIndex);
      cell.setAttribute('role', 'cell');
      if (cellIndex === 1) {
        cell.appendChild(node('strong', 'ss-process-name', process.name));
        cell.appendChild(node('small', 'ss-process-id', process.id));
      } else if (cellIndex === 5) {
        cell.appendChild(buildMeter('Integrity', process.integrity,
          Math.round(process.integrity) + '%',
          process.integrity <= 25 ? 'danger' :
            process.integrity <= 50 ? 'warning' : 'healthy', true));
      } else {
        cell.textContent = value;
      }
      row.appendChild(cell);
    });
    table.appendChild(row);
  });

  if (!state.processes.length) {
    table.appendChild(node('p', 'ss-empty ss-table-empty',
      'No Street Samurai implants detected.'));
  }
  return table;
}

function buildImplants(state) {
  const view = node('div', 'ss-implants');
  const rail = node('aside', 'ss-implant-rail');
  rail.appendChild(buildCortexVisual(state, true));
  const count = node('div', 'ss-implant-count');
  count.appendChild(node('span', '', 'IMPLANTS INSTALLED'));
  count.appendChild(node('strong', '', state.processes.length));
  rail.appendChild(count);
  view.appendChild(rail);

  const main = node('section', 'ss-implants-main');
  const heading = node('div', 'ss-section-heading');
  heading.appendChild(node('h2', 'ss-section-title',
    'INSTALLED IMPLANTS (' + state.processes.length + ')'));
  heading.appendChild(node('span', 'ss-section-meta',
    state.grade.toUpperCase() + '-GRADE HARDWARE'));
  main.appendChild(heading);
  main.appendChild(buildImplantTable(state));
  view.appendChild(main);
  return view;
}

function breakdownRows(breakdown) {
  const labels = {
    base: 'Base capacity',
    level: 'Level bonus',
    rank: 'Rank bonus',
    affinity: 'Cyber affinity',
    source_total: 'Guild systems',
    marks: 'Cyber marks',
    remort: 'Remort bonus',
    override: 'Override',
    total: 'Total capacity',
  };
  return Object.entries(labels)
    .filter(([key]) => key in breakdown)
    .map(([key, label]) => [label, finiteNumber(breakdown[key])]);
}

function buildAlertList(state) {
  const section = node('section', 'ss-diagnostic-section ss-alert-section');
  section.appendChild(node('h2', 'ss-section-title',
    'SYSTEM ALERTS (' + state.alerts.length + ')'));
  const list = node('div', 'ss-alert-list');
  if (!state.alerts.length) {
    const nominal = node('div', 'ss-alert ss-severity-healthy');
    nominal.appendChild(node('span', 'ss-alert-marker', 'OK'));
    nominal.appendChild(node('span', 'ss-alert-message',
      'All monitored systems nominal.'));
    list.appendChild(nominal);
  } else {
    for (const alert of state.alerts) {
      const item = node('div', 'ss-alert ss-severity-' + alert.severity);
      item.appendChild(node('span', 'ss-alert-marker', alert.marker));
      const text = node('div', 'ss-alert-copy');
      text.appendChild(node('span', 'ss-alert-message', alert.message));
      text.appendChild(node('small', 'ss-alert-code',
        alert.process ? alert.code + ' / ' + alert.process : alert.code));
      item.appendChild(text);
      list.appendChild(item);
    }
  }
  section.appendChild(list);
  return section;
}

function buildDiagnostics(state) {
  const view = node('div', 'ss-diagnostics');
  const top = node('div', 'ss-diagnostics-top');
  top.appendChild(buildAlertList(state));

  const health = node('section', 'ss-diagnostic-section');
  health.appendChild(node('h2', 'ss-section-title', 'SYSTEM HEALTH'));
  health.appendChild(buildMeter('Biological integrity',
    state.biological.percent,
    formatRatio(state.biological.current, state.biological.max),
    dashboardSeverity('biological', state)));
  health.appendChild(buildMeter('Thermal load', state.heatPercent,
    formatRatio(state.heat, state.heatMax) + ' ' +
      (state.thermalLockout ? 'LOCKOUT' : state.heatBand.toUpperCase()),
    dashboardSeverity('thermal', state)));
  health.appendChild(buildMeter('Cybernetic strain', state.strain.percent,
    formatRatio(state.strain.used, state.strain.total),
    dashboardSeverity('strain', state)));
  appendTextPair(health, 'Maintenance automation',
    state.automationRemaining > 0
      ? formatDuration(state.automationRemaining)
      : 'READY');
  top.appendChild(health);
  view.appendChild(top);

  const bottom = node('div', 'ss-diagnostics-bottom');
  const processes = node('section', 'ss-diagnostic-section ss-process-diagnostics');
  processes.appendChild(node('h2', 'ss-section-title',
    'PROCESS DIAGNOSTICS'));
  const rows = node('div', 'ss-diagnostic-process-list');
  for (const process of state.processes) {
    const row = node('div', 'ss-diagnostic-process ss-severity-' +
      process.stateSeverity);
    const title = node('div', 'ss-diagnostic-process-title');
    title.appendChild(node('strong', '', process.name));
    title.appendChild(node('span', '', process.state));
    row.appendChild(title);
    const values = node('div', 'ss-diagnostic-process-values');
    appendTextPair(values, 'Integrity', Math.round(process.integrity) + '%');
    appendTextPair(values, 'Durability', Math.round(process.durability) + '%');
    appendTextPair(values, 'Fragmentation',
      Math.round(process.fragmentation) + '%');
    appendTextPair(values, 'Effectiveness',
      Math.round(process.effectiveness) + '%');
    appendTextPair(values, 'Open issues', processIssueCount(process));
    row.appendChild(values);
    rows.appendChild(row);
  }
  if (!state.processes.length) {
    rows.appendChild(node('p', 'ss-empty',
      'No implant process diagnostics available.'));
  }
  processes.appendChild(rows);
  bottom.appendChild(processes);

  const resources = node('section', 'ss-diagnostic-section');
  resources.appendChild(node('h2', 'ss-section-title', 'STRAIN CAPACITY'));
  for (const [label, value] of breakdownRows(state.strain.breakdown)) {
    appendTextPair(resources, label, value);
  }
  if (!breakdownRows(state.strain.breakdown).length) {
    appendTextPair(resources, 'Used', state.strain.used);
    appendTextPair(resources, 'Free', state.strain.free);
    appendTextPair(resources, 'Total', state.strain.total);
  }

  resources.appendChild(node('h3', 'ss-detail-title ss-flags-title',
    'MONITOR FLAGS'));
  const flags = node('div', 'ss-flag-grid');
  for (const [label, active] of Object.entries(state.monitorFlags)) {
    const flag = node('span', 'ss-flag ' +
      (active ? 'ss-flag-online' : 'ss-flag-offline'), label);
    flag.title = active ? label + ' online' : label + ' offline';
    flags.appendChild(flag);
  }
  if (!Object.keys(state.monitorFlags).length) {
    flags.appendChild(node('span', 'ss-empty', 'No monitor data.'));
  }
  resources.appendChild(flags);
  bottom.appendChild(resources);
  view.appendChild(bottom);
  return view;
}

function buildTabs(root) {
  const tabs = node('div', 'ss-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Cortex dashboard views');

  for (const tab of VALID_TABS) {
    const button = node('button', 'ss-tab', TAB_LABELS[tab]);
    button.type = 'button';
    button.id = root.__ssDashboardId + '-tab-' + tab;
    button.dataset.tab = tab;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected',
      root.__ssActiveTab === tab ? 'true' : 'false');
    button.setAttribute('aria-controls', root.__ssDashboardId + '-panel');
    button.tabIndex = root.__ssActiveTab === tab ? 0 : -1;
    button.addEventListener('click', () => {
      root.__ssActiveTab = tab;
      renderDashboard(root);
      const activeButton = root.querySelector('[data-tab="' + tab + '"]');
      if (activeButton) activeButton.focus();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const tabsArray = Array.from(VALID_TABS);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const current = tabsArray.indexOf(root.__ssActiveTab);
      root.__ssActiveTab = tabsArray[
        (current + offset + tabsArray.length) % tabsArray.length
      ];
      renderDashboard(root);
      const activeButton = root.querySelector(
        '[data-tab="' + root.__ssActiveTab + '"]'
      );
      if (activeButton) activeButton.focus();
    });
    tabs.appendChild(button);
  }
  return tabs;
}

function buildAlertRail(state) {
  const severity = worstAlertSeverity(state.alerts);
  const rail = node('footer', 'ss-alert-rail ss-severity-' + severity);
  const label = node('div', 'ss-alert-rail-label');
  label.appendChild(node('span', 'ss-alert-rail-symbol',
    state.alerts.length ? '!' : 'OK'));
  label.appendChild(node('strong', '',
    'ALERTS (' + state.alerts.length + ')'));
  rail.appendChild(label);
  rail.appendChild(node('div', 'ss-alert-rail-message',
    state.alerts.length
      ? state.alerts[0].message +
        (state.alerts.length > 1
          ? ' +' + (state.alerts.length - 1) + ' additional'
          : '')
      : 'ALL MONITORED SYSTEMS NOMINAL'));
  return rail;
}

function renderDashboard(root) {
  const state = root.__ssState;
  root.replaceChildren();
  root.appendChild(buildStatusDeck(state));
  root.appendChild(buildTabs(root));

  const panel = node('div', 'ss-tab-panel');
  panel.id = root.__ssDashboardId + '-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby',
    root.__ssDashboardId + '-tab-' + root.__ssActiveTab);
  if (root.__ssActiveTab === 'overview') {
    panel.appendChild(buildOverview(state));
  } else if (root.__ssActiveTab === 'diagnostics') {
    panel.appendChild(buildDiagnostics(state));
  } else {
    panel.appendChild(buildImplants(state));
  }
  root.appendChild(panel);
  root.appendChild(buildAlertRail(state));
}

export function createStreetSamuraiDashboard(schema = {}) {
  const root = node('section', 'ss-dashboard');
  root.setAttribute('data-dw-id', schema.id || 'street-samurai-dashboard-root');
  root.setAttribute('aria-label', 'Street Samurai Cortex dashboard');
  root.__ssDashboardId = 'ss-dashboard-' + (++dashboardSequence);
  root.__ssDisposed = false;
  root.__ssActiveTab = VALID_TABS.has(schema.active_tab)
    ? schema.active_tab
    : 'implants';
  root.__ssState = normalizeStreetSamuraiState(schema.state);
  renderDashboard(root);
  return root;
}

export function renderStreetSamuraiDashboard(schema = {}) {
  const root = createStreetSamuraiDashboard(schema);
  streetSamuraiDashboardView.register(root);
  return root;
}

export function updateStreetSamuraiDashboard(root, payload) {
  if (!root || !root.__ssDashboardId || root.__ssDisposed) {
    return false;
  }
  root.__ssState = normalizeStreetSamuraiState(payload);
  renderDashboard(root);
  return true;
}

export function disposeStreetSamuraiDashboard(root) {
  if (!root || !root.__ssDashboardId || root.__ssDisposed) return false;
  streetSamuraiDashboardView.unregister(root);
  root.__ssDisposed = true;
  return true;
}

export const streetSamuraiDashboardView = {
  roots: new Set(),
  lastState: null,

  register(root) {
    root.__ssDisposed = false;
    this.roots.add(root);
    this.lastState = root.__ssState;
  },

  unregister(root) {
    if (!this.roots.delete(root)) return false;
    root.__ssDisposed = true;
    return true;
  },

  update(payload) {
    const state = normalizeStreetSamuraiState(payload);
    this.lastState = state;
    for (const root of Array.from(this.roots)) {
      if (root.isConnected === false) {
        this.unregister(root);
        continue;
      }
      root.__ssState = state;
      renderDashboard(root);
    }
  },

  reset() {
    for (const root of this.roots) root.__ssDisposed = true;
    this.roots.clear();
    this.lastState = null;
  },

  getSnapshot() {
    return this.lastState;
  },
};
