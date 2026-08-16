const MAX_IDENTIFIER_LENGTH = 96;
const MAX_DISPLAY_LENGTH = 320;
const MAX_PROCESSES = 15;
const MAX_MONITOR_FLAGS = 11;
const MAX_TOP_LEVEL_ROWS = 64;
const MAX_PROCESS_ISSUES = 32;
const MAX_SOURCES = 32;
const MAX_SOURCE_KEY_LENGTH = 64;

const SEVERITIES = new Set(["healthy", "warning", "danger"] as const);
const MONITOR_FLAGS = ["OC", "OD", "AW", "SM", "TB", "MW", "JF", "PS", "GS", "ZS", "TS"] as const;
const BREAKDOWN_FIELDS = [
  "base",
  "level",
  "rank",
  "affinity",
  "source_total",
  "marks",
  "remort",
  "cap",
  "override",
  "total",
] as const;

type StreetSamuraiSeverity = "healthy" | "warning" | "danger";

export interface DarkwindStreetSamuraiAlert {
  severity: StreetSamuraiSeverity;
  marker: string;
  code: string;
  message: string;
  process?: string;
}

export interface DarkwindStreetSamuraiProcess {
  id: string;
  name: string;
  grade: string;
  family: string;
  load: number;
  durability: number;
  integrity: number;
  fragmentation: number;
  effectiveness: number;
  alerts: string[];
  patches: string[];
  vulnerabilities: string[];
  faults: string[];
  state: string;
  state_severity: StreetSamuraiSeverity;
}

export interface DarkwindStreetSamurai {
  protocol_version: 1;
  version?: number;
  maintenance_version: number;
  cortex_version: string;
  firmware_version: string;
  grade: string;
  active: boolean;
  guild_level: number;
  guild_level_max: number;
  cortex_rank: number;
  cortex_rank_max: number;
  guild_xp: number;
  guild_xp_needed: number;
  cortex_effect: string;
  edge: number;
  edge_max: number;
  heat: number;
  heat_max: number;
  heat_percent: number;
  heat_band: string;
  thermal_lockout: boolean;
  biological: { current: number; max: number; percent: number };
  strain: {
    used: number;
    total: number;
    free: number;
    percent: number;
    breakdown: Record<string, number | Record<string, number>>;
  };
  target_locks: Array<{ name: string; remaining: number }>;
  target_lock_summary: string;
  alerts: DarkwindStreetSamuraiAlert[];
  monitor_flags: Record<string, boolean>;
  active_firmware: string[];
  automation_remaining: number;
  processes: DarkwindStreetSamuraiProcess[];
  updated_at: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function own(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function text(value: unknown, fallback: string, maxLength = MAX_DISPLAY_LENGTH): string | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return null;
  // Match the retained renderers' terminal-safe text cleanup.
  // eslint-disable-next-line no-control-regex
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u001b]/g, "");
  return normalized.length <= maxLength ? normalized : null;
}

function identifier(value: unknown, fallback: string): string | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= MAX_IDENTIFIER_LENGTH ? normalized : null;
}

function finite(value: unknown, fallback = 0): number | null {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegative(value: unknown, fallback = 0): number | null {
  const normalized = finite(value, fallback);
  return normalized === null ? null : Math.max(0, normalized);
}

function percent(value: unknown, fallback = 0): number | null {
  const normalized = finite(value, fallback);
  return normalized === null ? null : Math.max(0, Math.min(100, normalized));
}

function flag(value: unknown, fallback: boolean): boolean | null {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  return null;
}

function severity(value: unknown, fallback: StreetSamuraiSeverity): StreetSamuraiSeverity | null {
  if (value === undefined) return fallback;
  return typeof value === "string" && SEVERITIES.has(value as StreetSamuraiSeverity)
    ? (value as StreetSamuraiSeverity)
    : null;
}

function stringList(value: unknown, maximum: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const raw of value.slice(0, maximum)) {
    const normalized = text(raw, "");
    if (normalized === null) return null;
    result.push(normalized);
  }
  return result;
}

function normalizeAlert(input: unknown, index: number): DarkwindStreetSamuraiAlert | null {
  const value = record(input);
  if (!value) return null;
  const normalizedSeverity = severity(value.severity, "warning");
  const code = identifier(value.code, `alert_${index + 1}`);
  const message = text(value.message, "Unknown Cortex OS alert.");
  const process = identifier(value.process, "");
  const marker = text(value.marker, "!");
  if (
    normalizedSeverity === null ||
    code === null ||
    message === null ||
    process === null ||
    marker === null
  )
    return null;
  return {
    severity: normalizedSeverity,
    marker: marker.slice(0, 1) || "!",
    code,
    message,
    ...(process ? { process } : {}),
  };
}

function normalizeProcess(input: unknown, index: number): DarkwindStreetSamuraiProcess | null {
  const value = record(input);
  if (!value) return null;
  const id = identifier(value.id, `process_${index + 1}`);
  if (id === null) return null;
  const name = text(value.name, id);
  const grade = text(value.grade, "unknown");
  const family = identifier(value.family, "");
  const load = nonNegative(value.load);
  const durability = nonNegative(value.durability);
  const integrity = percent(value.integrity);
  const fragmentation = percent(value.fragmentation);
  const effectiveness = percent(value.effectiveness);
  const alerts = stringList(value.alerts, MAX_PROCESS_ISSUES);
  const patches = stringList(value.patches, MAX_PROCESS_ISSUES);
  const vulnerabilities = stringList(value.vulnerabilities, MAX_PROCESS_ISSUES);
  const faults = stringList(value.faults, MAX_PROCESS_ISSUES);
  const state = text(value.state, "UNKNOWN");
  const stateSeverity = severity(
    value.state_severity,
    integrity !== null && integrity <= 25
      ? "danger"
      : integrity !== null && integrity <= 50
        ? "warning"
        : "healthy",
  );
  if (
    name === null ||
    grade === null ||
    family === null ||
    load === null ||
    durability === null ||
    integrity === null ||
    fragmentation === null ||
    effectiveness === null ||
    alerts === null ||
    patches === null ||
    vulnerabilities === null ||
    faults === null ||
    state === null ||
    stateSeverity === null
  )
    return null;
  return {
    id,
    name,
    grade,
    family,
    load,
    durability,
    integrity,
    fragmentation,
    effectiveness,
    alerts,
    patches,
    vulnerabilities,
    faults,
    state,
    state_severity: stateSeverity,
  };
}

function normalizeBreakdown(
  input: unknown,
): Record<string, number | Record<string, number>> | null {
  if (input === undefined) return {};
  const value = record(input);
  if (!value) return null;
  const result: Record<string, number | Record<string, number>> = {};
  for (const key of BREAKDOWN_FIELDS) {
    if (!own(value, key)) continue;
    const normalized = finite(value[key]);
    if (normalized === null) return null;
    result[key] = normalized;
  }
  if (!own(value, "sources")) return result;
  const sources = record(value.sources);
  if (!sources) return null;
  const normalizedSources: Record<string, number> = {};
  let sourceCount = 0;
  for (const rawKey in sources) {
    if (!own(sources, rawKey)) continue;
    if (sourceCount >= MAX_SOURCES) break;
    sourceCount += 1;
    const key = rawKey.trim();
    const amount = finite(sources[rawKey]);
    if (!key || key.length > MAX_SOURCE_KEY_LENGTH || !/^[a-z0-9_]+$/.test(key) || amount === null)
      return null;
    normalizedSources[key] = amount;
  }
  result.sources = normalizedSources;
  return result;
}

/** Returns a clean, bounded full Street Samurai dashboard snapshot or null. */
export function normalizeDarkwindStreetSamurai(input: unknown): DarkwindStreetSamurai | null {
  const value = record(input);
  if (!value || value.protocol_version !== 1) return null;

  const biological = own(value, "biological") ? record(value.biological) : {};
  const strain = own(value, "strain") ? record(value.strain) : {};
  if (!biological || !strain) return null;

  const processesSource = own(value, "processes") ? value.processes : [];
  const alertsSource = own(value, "alerts") ? value.alerts : [];
  const locksSource = own(value, "target_locks") ? value.target_locks : [];
  const firmwareSource = own(value, "active_firmware") ? value.active_firmware : [];
  const flagsSource = own(value, "monitor_flags") ? record(value.monitor_flags) : {};
  if (
    !Array.isArray(processesSource) ||
    !Array.isArray(alertsSource) ||
    !Array.isArray(locksSource) ||
    !Array.isArray(firmwareSource) ||
    !flagsSource
  )
    return null;

  const processes: DarkwindStreetSamuraiProcess[] = [];
  for (const [index, raw] of processesSource.slice(0, MAX_PROCESSES).entries()) {
    const process = normalizeProcess(raw, index);
    if (!process) return null;
    processes.push(process);
  }
  const alerts: DarkwindStreetSamuraiAlert[] = [];
  for (const [index, raw] of alertsSource.slice(0, MAX_TOP_LEVEL_ROWS).entries()) {
    const alert = normalizeAlert(raw, index);
    if (!alert) return null;
    alerts.push(alert);
  }
  const targetLocks: Array<{ name: string; remaining: number }> = [];
  for (const raw of locksSource.slice(0, MAX_TOP_LEVEL_ROWS)) {
    const lock = record(raw);
    if (!lock) return null;
    const name = text(lock.name, "Unknown target");
    const remaining = nonNegative(lock.remaining);
    if (name === null || remaining === null) return null;
    targetLocks.push({ name, remaining });
  }
  const activeFirmware = stringList(firmwareSource, MAX_TOP_LEVEL_ROWS);
  if (activeFirmware === null) return null;

  const monitorFlags: Record<string, boolean> = {};
  for (const key of MONITOR_FLAGS.slice(0, MAX_MONITOR_FLAGS)) {
    if (!own(flagsSource, key)) continue;
    const normalized = flag(flagsSource[key], false);
    if (normalized === null) return null;
    monitorFlags[key] = normalized;
  }

  const breakdown = normalizeBreakdown(strain.breakdown);
  const maintenanceVersion = nonNegative(
    own(value, "maintenance_version") ? value.maintenance_version : value.version,
  );
  const version = own(value, "version") ? nonNegative(value.version) : undefined;
  const cortexVersion = text(value.cortex_version, "3.1");
  const firmwareVersion = text(value.firmware_version, "Unknown");
  const grade = identifier(value.grade, "no-os");
  const active = flag(value.active, true);
  const guildLevel = nonNegative(value.guild_level);
  const guildLevelMax = nonNegative(value.guild_level_max, 16);
  const cortexRank = nonNegative(value.cortex_rank);
  const cortexRankMax = nonNegative(value.cortex_rank_max, 200);
  const guildXp = nonNegative(value.guild_xp);
  const guildXpNeeded = nonNegative(value.guild_xp_needed);
  const cortexEffect = text(value.cortex_effect, "100%");
  const edge = nonNegative(value.edge);
  const edgeMax = nonNegative(value.edge_max);
  const heat = nonNegative(value.heat);
  const heatMax = nonNegative(value.heat_max);
  const heatPercent = percent(
    value.heat_percent,
    heat !== null && heatMax ? (heat * 100) / heatMax : 0,
  );
  const heatBand = text(value.heat_band, "Clean");
  const thermalLockout = flag(value.thermal_lockout, false);
  const biologicalCurrent = nonNegative(biological.current);
  const biologicalMax = nonNegative(biological.max);
  const biologicalPercent = percent(
    biological.percent,
    biologicalCurrent !== null && biologicalMax ? (biologicalCurrent * 100) / biologicalMax : 0,
  );
  const strainUsed = nonNegative(strain.used);
  const strainTotal = nonNegative(strain.total);
  const strainFree = nonNegative(
    strain.free,
    strainUsed !== null && strainTotal !== null ? Math.max(0, strainTotal - strainUsed) : 0,
  );
  const strainPercent = percent(
    strain.percent,
    strainUsed !== null && strainTotal ? (strainUsed * 100) / strainTotal : 0,
  );
  const targetLockSummary = text(
    value.target_lock_summary,
    targetLocks.length
      ? targetLocks
          .map(({ name }) => name)
          .join(", ")
          .slice(0, MAX_DISPLAY_LENGTH)
      : "none",
  );
  const automationRemaining = nonNegative(value.automation_remaining);
  const updatedAt = nonNegative(value.updated_at);

  if (
    breakdown === null ||
    maintenanceVersion === null ||
    version === null ||
    cortexVersion === null ||
    firmwareVersion === null ||
    grade === null ||
    active === null ||
    guildLevel === null ||
    guildLevelMax === null ||
    cortexRank === null ||
    cortexRankMax === null ||
    guildXp === null ||
    guildXpNeeded === null ||
    cortexEffect === null ||
    edge === null ||
    edgeMax === null ||
    heat === null ||
    heatMax === null ||
    heatPercent === null ||
    heatBand === null ||
    thermalLockout === null ||
    biologicalCurrent === null ||
    biologicalMax === null ||
    biologicalPercent === null ||
    strainUsed === null ||
    strainTotal === null ||
    strainFree === null ||
    strainPercent === null ||
    targetLockSummary === null ||
    automationRemaining === null ||
    updatedAt === null
  )
    return null;

  return {
    protocol_version: 1,
    ...(version === undefined ? {} : { version }),
    maintenance_version: maintenanceVersion,
    cortex_version: cortexVersion,
    firmware_version: firmwareVersion,
    grade,
    active,
    guild_level: guildLevel,
    guild_level_max: guildLevelMax,
    cortex_rank: cortexRank,
    cortex_rank_max: cortexRankMax,
    guild_xp: guildXp,
    guild_xp_needed: guildXpNeeded,
    cortex_effect: cortexEffect,
    edge,
    edge_max: edgeMax,
    heat,
    heat_max: heatMax,
    heat_percent: heatPercent,
    heat_band: heatBand,
    thermal_lockout: thermalLockout,
    biological: { current: biologicalCurrent, max: biologicalMax, percent: biologicalPercent },
    strain: {
      used: strainUsed,
      total: strainTotal,
      free: strainFree,
      percent: strainPercent,
      breakdown,
    },
    target_locks: targetLocks,
    target_lock_summary: targetLockSummary,
    alerts,
    monitor_flags: monitorFlags,
    active_firmware: activeFirmware,
    automation_remaining: automationRemaining,
    processes,
    updated_at: updatedAt,
  };
}
