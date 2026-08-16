import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
let visual;
let street;

test.before(async () => {
  server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });
  const ssr = server.environments.ssr;
  assert.ok(isRunnableDevEnvironment(ssr));
  [visual, street] = await Promise.all([
    ssr.runner.import("/gmcp/contracts/visual-effects.ts"),
    ssr.runner.import("/gmcp/contracts/street-samurai.ts"),
  ]);
});

test.after(async () => server.close());

function processFixture(overrides = {}) {
  return {
    id: "targeting_suite",
    name: "Photon Targeting",
    grade: "military",
    family: "optical",
    load: 2,
    durability: 170,
    integrity: 100,
    fragmentation: 12,
    effectiveness: 100,
    alerts: [],
    patches: [],
    vulnerabilities: [],
    faults: [],
    state: "TARGET LOCK",
    state_severity: "healthy",
    ...overrides,
  };
}

function streetFixture(overrides = {}) {
  return {
    protocol_version: 1,
    maintenance_version: 3,
    cortex_version: "3.1",
    firmware_version: "Ronin-sama",
    grade: "ghost",
    active: true,
    guild_level: 16,
    guild_level_max: 16,
    cortex_rank: 42,
    cortex_rank_max: 200,
    guild_xp: 1930,
    guild_xp_needed: 7000,
    cortex_effect: "105%",
    edge: 5,
    edge_max: 10,
    heat: 2,
    heat_max: 10,
    heat_percent: 20,
    heat_band: "Clean",
    thermal_lockout: false,
    biological: { current: 920, max: 1000, percent: 92 },
    strain: {
      used: 32,
      total: 36,
      free: 4,
      percent: 88,
      breakdown: {
        base: 20,
        level: 8,
        source_total: 8,
        total: 36,
        sources: { street_samurai: 8 },
      },
    },
    target_locks: [{ name: "Test target", remaining: 21 }],
    target_lock_summary: "Test target",
    alerts: [
      {
        severity: "warning",
        marker: "!",
        code: "strain_high",
        message: "<b>Strain is high.</b>",
      },
    ],
    monitor_flags: { OC: 1, OD: false },
    active_firmware: ["Overclock"],
    automation_remaining: 120,
    processes: [processFixture()],
    updated_at: 1785180000,
    ...overrides,
  };
}

test("Visual contracts normalize live state, bounded batches, singular events, and previews", () => {
  assert.deepEqual(
    visual.normalizeDarkwindVisualState({
      epoch: " connection-7 ",
      seq: 18,
      reason: "move",
      planet: { id: "MARKAS" },
      terrain: ["outside", { terrain: { name: "dense forest and city road" } }],
      selector: "body",
    }),
    {
      epoch: "connection-7",
      seq: 18,
      reason: "move",
      planet: "markas",
      terrain: ["city", "road", "forest"],
    },
  );
  assert.deepEqual(
    visual.normalizeDarkwindVisualState({
      epoch: "connection-7",
      seq: 19,
      terrain: [...Array(16).fill("forest"), { id: { id: { id: "malicious" } } }],
    }).terrain,
    ["forest"],
  );
  assert.deepEqual(
    visual.normalizeDarkwindVisualState({
      epoch: "connection-7",
      seq: 20,
      terrain: ["open water", "rocky coast"],
    }).terrain,
    ["water", "coast"],
  );

  const ignoredInvalidPrefix = { seq: Number.NaN, kind: "server-css" };
  const validEvents = Array.from({ length: 12 }, (_, index) => ({
    seq: index + 1,
    kind: "damage",
    perspective: index % 2 ? "outgoing" : "incoming",
    cue: "impact",
    intensity: index + 1,
  }));
  const batch = visual.normalizeDarkwindVisualEvents({
    epoch: "connection-7",
    first_seq: 1,
    last_seq: 12,
    events: [ignoredInvalidPrefix, ...validEvents],
  });
  assert.equal(batch.events.length, 12);
  assert.equal(batch.events[0].intensity, 1);
  assert.equal(batch.events.at(-1).intensity, 3);
  assert.equal(
    visual.normalizeDarkwindVisualEvents({
      epoch: "connection-7",
      events: [...validEvents, { seq: Number.NaN, kind: "server-css" }],
    }),
    null,
  );
  assert.equal(
    visual.normalizeDarkwindVisualEvents({
      epoch: "connection-7",
      first_seq: 2,
      last_seq: 12,
      events: validEvents,
    }),
    null,
  );
  assert.deepEqual(
    visual.normalizeDarkwindVisualEvent({
      epoch: "connection-7",
      seq: 13,
      kind: "spell-cast",
      perspective: "self",
      cue: "cast",
      school: "frost",
      intensity: 2,
    }),
    {
      epoch: "connection-7",
      seq: 13,
      kind: "spell-cast",
      perspective: "self",
      cue: "cast",
      school: "cold",
      intensity: 2,
    },
  );
  assert.deepEqual(visual.normalizeDarkwindVisualPreview({ kind: "planet", value: "tekal" }), {
    kind: "planet",
    value: "tekal",
  });
  assert.deepEqual(visual.normalizeDarkwindVisualPreview({ kind: "clear" }), { kind: "clear" });
});

test("Visual preflight rejects retained malicious nesting and non-finite values", () => {
  assert.equal(
    visual.normalizeDarkwindVisualState({
      epoch: "world-a",
      seq: 1,
      terrain: { id: { id: { id: "forest" } } },
    }),
    null,
  );
  assert.equal(
    visual.normalizeDarkwindVisualEvents({
      epoch: "world-a",
      events: [
        { seq: 1, kind: "damage", perspective: "incoming", cue: "impact", intensity: Infinity },
      ],
    }),
    null,
  );
  assert.equal(visual.normalizeDarkwindVisualPreview({ kind: "low-health", value: "fire" }), null);
  assert.equal(visual.normalizeDarkwindVisualPreview({ kind: "terrain", value: "outside" }), null);
});

test("Street Samurai preserves bounded live fields and discards unknown maps", () => {
  const normalized = street.normalizeDarkwindStreetSamurai(
    streetFixture({
      monitor_flags: { OC: 1, OD: 0, UNKNOWN: { deeply: { nested: true } } },
      unknown_map: { deeply: { nested: true } },
      strain: {
        ...streetFixture().strain,
        breakdown: {
          ...streetFixture().strain.breakdown,
          unknown: { deeply: { nested: true } },
        },
      },
    }),
  );
  assert.equal(normalized.alerts[0].message, "<b>Strain is high.</b>");
  assert.equal(normalized.processes[0].name, "Photon Targeting");
  assert.deepEqual(normalized.monitor_flags, { OC: true, OD: false });
  assert.deepEqual(normalized.strain.breakdown.sources, { street_samurai: 8 });
  assert.equal("unknown" in normalized.strain.breakdown, false);
  assert.equal("unknown_map" in normalized, false);
  assert.equal(
    street.normalizeDarkwindStreetSamurai(
      streetFixture({ firmware_version: "Ronin\u001b[31m-sama\u0000" }),
    ).firmware_version,
    "Ronin[31m-sama",
  );
});

test("Street Samurai caps collections before rejecting malformed retained rows", () => {
  const processes = Array.from({ length: 15 }, (_, index) =>
    processFixture({ id: `process_${index}`, alerts: [...Array(32).fill("ok"), Number.NaN] }),
  );
  const sources = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`source_${index}`, index]));
  const normalized = street.normalizeDarkwindStreetSamurai(
    streetFixture({
      processes: [...processes, { id: Number.NaN }],
      alerts: [
        ...Array.from({ length: 64 }, (_, index) => ({
          severity: "healthy",
          marker: "!",
          code: `alert_${index}`,
          message: "ok",
        })),
        { severity: { malicious: true } },
      ],
      target_locks: [
        ...Array.from({ length: 64 }, (_, index) => ({ name: `target ${index}`, remaining: index })),
        { name: { malicious: true } },
      ],
      active_firmware: [...Array(64).fill("Overclock"), { malicious: true }],
      strain: {
        ...streetFixture().strain,
        breakdown: {
          base: 20,
          sources: { ...sources, ignored_invalid_source: Infinity },
        },
      },
    }),
  );
  assert.equal(normalized.processes.length, 15);
  assert.equal(normalized.processes[0].alerts.length, 32);
  assert.equal(normalized.alerts.length, 64);
  assert.equal(normalized.target_locks.length, 64);
  assert.equal(normalized.active_firmware.length, 64);
  assert.equal(Object.keys(normalized.strain.breakdown.sources).length, 32);

  assert.equal(
    street.normalizeDarkwindStreetSamurai(
      streetFixture({ processes: [processFixture({ faults: ["ok", Number.NaN] })] }),
    ),
    null,
  );
  assert.equal(
    street.normalizeDarkwindStreetSamurai(
      streetFixture({
        strain: {
          ...streetFixture().strain,
          breakdown: { sources: { "not-normalized": 1 } },
        },
      }),
    ),
    null,
  );
});

test("Street Samurai rejects unsupported versions, non-finite fields, and retained source bounds", () => {
  assert.equal(street.normalizeDarkwindStreetSamurai(streetFixture({ protocol_version: 2 })), null);
  assert.equal(street.normalizeDarkwindStreetSamurai(streetFixture({ heat: Number.NaN })), null);
  assert.equal(
    street.normalizeDarkwindStreetSamurai(
      streetFixture({
        strain: {
          ...streetFixture().strain,
          breakdown: { sources: { ["x".repeat(65)]: 1 } },
        },
      }),
    ),
    null,
  );
  assert.equal(
    street.normalizeDarkwindStreetSamurai(
      streetFixture({ processes: [processFixture({ id: "x".repeat(97) })] }),
    ),
    null,
  );
  assert.equal(
    street.normalizeDarkwindStreetSamurai(streetFixture({ firmware_version: "x".repeat(321) })),
    null,
  );
});
