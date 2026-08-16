import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const effectKeys = [
  "planetAmbience",
  "terrainAmbience",
  "worldTransitions",
  "lowHealth",
  "incomingDamage",
  "outgoingDamage",
  "spellCasts",
];

async function loadModules(t) {
  const server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });
  t.after(async () => server.close());

  const ssr = server.environments.ssr;
  assert.ok(isRunnableDevEnvironment(ssr));
  const [visualEffects, bus, diagnostics, ids, scope, events] = await Promise.all([
    ssr.runner.import("/runtime/visual-effects.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
  ]);
  return { ...visualEffects, ...bus, ...diagnostics, ...ids, ...scope, ...events };
}

function createVisualEffects(modules, { now = () => 0 } = {}) {
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  const eventBus = modules.createSessionEventBus(sessionId, diagnostics);
  const sent = [];
  const decoder = new TextDecoder();
  const bus = modules.createSessionGmcpBus(
    sessionId,
    (bytes) => {
      sent.push(decoder.decode(bytes));
      return true;
    },
    diagnostics,
  );
  const visualEffects = modules.createSessionVisualEffects(bus, scope, eventBus, { now });
  return { bus, diagnostics, eventBus, scope, sent, visualEffects };
}

function connect(eventBus) {
  eventBus.publish("transport:reconnect-status", {
    status: "connected",
    attempt: 0,
    transport: "ws",
  });
}

function latestSubscription(sent) {
  const line = sent.filter((value) => value.startsWith("Darkwind.Client.Subscriptions ")).at(-1);
  assert.ok(line);
  return JSON.parse(line.slice("Darkwind.Client.Subscriptions ".length));
}

function preferences(enabledKeys = effectKeys) {
  return Object.fromEntries(effectKeys.map((key) => [key, enabledKeys.includes(key)]));
}

test("visual settings default off, stay deeply frozen, and publish exact subscriptions", async (t) => {
  const modules = await loadModules(t);
  const { bus, eventBus, scope, sent, visualEffects } = createVisualEffects(modules);

  const initial = visualEffects.getSnapshot();
  assert.equal(initial.enabled, false);
  assert.equal(initial.subscriptionEnabled, false);
  assert.deepEqual(initial.preferences, preferences());
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(initial.preferences), true);
  assert.equal(Object.isFrozen(initial.world), true);
  assert.equal(Object.isFrozen(initial.world.terrains), true);
  assert.equal(Object.isFrozen(initial.activeCues), true);
  assert.deepEqual(latestSubscription(sent).features.visualEffects, false);

  bus.dispatch("Core.Supports.Set", ["Darkwind.Visual 1"]);
  assert.equal(visualEffects.getSnapshot().supported, false);
  const reconnectSendsBeforeInitialConnect = sent.filter((line) =>
    line.includes('"reason":"reconnect"'),
  ).length;
  connect(eventBus);
  assert.equal(visualEffects.getSnapshot().connected, true);
  assert.equal(visualEffects.getSnapshot().supported, true);
  await Promise.resolve();
  assert.equal(
    sent.filter((line) => line.includes('"reason":"reconnect"')).length,
    reconnectSendsBeforeInitialConnect,
  );
  bus.dispatch("Core.Supports.Remove", ["Darkwind.Visual 1"]);
  assert.equal(visualEffects.getSnapshot().supported, false);
  bus.dispatch("Core.Supports.Add", ["Darkwind.Visual 1"]);
  assert.equal(visualEffects.getSnapshot().supported, true);

  visualEffects.configure({ visualEffectsEnabled: true });
  assert.equal(visualEffects.getSnapshot().subscriptionEnabled, true);
  assert.equal(latestSubscription(sent).reason, "visual-effects-setting");
  assert.equal(latestSubscription(sent).features.visualEffects, true);

  visualEffects.configure({
    visualEffectsEnabled: true,
    visualEffectPreferences: preferences(["lowHealth"]),
  });
  assert.equal(visualEffects.getSnapshot().subscriptionEnabled, false);
  assert.equal(latestSubscription(sent).features.visualEffects, false);
  scope.dispose();
});

test("authoritative world wins bounded fallback and health is alive-only at forty percent", async (t) => {
  const modules = await loadModules(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "error", () => {});
  const { bus, eventBus, scope, visualEffects } = createVisualEffects(modules);
  visualEffects.configure({ visualEffectsEnabled: true });
  connect(eventBus);

  bus.dispatch("Room.Info", {
    num: "fallback-room",
    area: "Fallback Area",
    planet: "Dailos",
    terrain: ["forest", "road"],
  });
  assert.deepEqual(
    {
      authoritative: visualEffects.getSnapshot().world.authoritative,
      planet: visualEffects.getSnapshot().world.planet,
      terrains: visualEffects.getSnapshot().world.terrains,
      roomId: visualEffects.getSnapshot().world.roomId,
    },
    {
      authoritative: false,
      planet: "dailos",
      terrains: ["road", "forest"],
      roomId: "fallback-room",
    },
  );
  bus.dispatch("Room.Info", { planet: "tekal", terrain: ["city", {}] });
  assert.equal(visualEffects.getSnapshot().world.planet, "dailos");

  bus.dispatch("Darkwind.Visual.State", {
    epoch: "world-1",
    seq: 2,
    reason: "wayshard",
    planet: "markas",
    terrain: ["desert", "water"],
    room_id: "authoritative-room",
    area: "Wastes",
  });
  assert.equal(visualEffects.getSnapshot().world.authoritative, true);
  assert.equal(visualEffects.getSnapshot().world.planet, "markas");
  assert.equal(visualEffects.getSnapshot().world.transitionActive, true);
  const transitionGeneration = visualEffects.getSnapshot().world.transitionGeneration;

  bus.dispatch("Room.Info", { planet: "tekal", terrain: "city" });
  bus.dispatch("Darkwind.Visual.State", {
    epoch: "world-1",
    seq: 1,
    reason: "move",
    planet: "tekal",
    terrain: ["city"],
  });
  assert.equal(visualEffects.getSnapshot().world.planet, "markas");
  assert.equal(visualEffects.getSnapshot().world.transitionGeneration, transitionGeneration);
  t.mock.timers.tick(1_250);
  assert.equal(visualEffects.getSnapshot().world.transitionActive, false);

  bus.dispatch("Char.Vitals", { hp: 40, maxhp: 100 });
  assert.deepEqual(visualEffects.getSnapshot().health, {
    hp: 40,
    maxHp: 100,
    ratio: 0.4,
    alive: true,
    lowHealth: true,
  });
  bus.dispatch("Char.Vitals", { hp: 41 });
  assert.equal(visualEffects.getSnapshot().health.lowHealth, false);
  bus.dispatch("Char.Vitals", { hp: 0 });
  assert.equal(visualEffects.getSnapshot().health.alive, false);
  assert.equal(visualEffects.getSnapshot().health.lowHealth, false);
  bus.dispatch("Char.Vitals", { hp: "20", maxhp: 100 });
  assert.equal(visualEffects.getSnapshot().health.hp, 0);

  scope.dispose();
});

test("event cues are bounded, deduplicated, rate-limited, visibility-safe, and timed", async (t) => {
  const modules = await loadModules(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0;
  const { bus, eventBus, scope, visualEffects } = createVisualEffects(modules, {
    now: () => clock,
  });
  visualEffects.configure({ visualEffectsEnabled: true });
  connect(eventBus);

  const events = [
    { invalid: true },
    ...Array.from({ length: 12 }, (_, index) => ({
      seq: index + 1,
      kind: "damage",
      perspective: "incoming",
      cue: "impact",
      intensity: index === 11 ? 3 : 1,
    })),
  ];
  bus.dispatch("Darkwind.Visual.Events", { epoch: "events-1", events });
  assert.deepEqual(visualEffects.getSnapshot().activeCues, [
    { slot: "incoming", seq: 12, intensity: 3, generation: 1 },
  ]);

  bus.dispatch("Darkwind.Visual.Event", {
    epoch: "events-1",
    seq: 12,
    kind: "damage",
    perspective: "incoming",
    cue: "impact",
    intensity: 1,
  });
  assert.equal(visualEffects.getSnapshot().activeCues[0].generation, 1);
  clock = 599;
  bus.dispatch("Darkwind.Visual.Event", {
    epoch: "events-1",
    seq: 13,
    kind: "damage",
    perspective: "incoming",
    cue: "impact",
    intensity: 2,
  });
  assert.equal(visualEffects.getSnapshot().activeCues[0].generation, 1);

  clock = 600;
  bus.dispatch("Darkwind.Visual.Events", {
    epoch: "events-1",
    events: [
      {
        seq: 14,
        kind: "damage",
        perspective: "incoming",
        cue: "impact",
        intensity: 2,
      },
      {
        seq: 15,
        kind: "damage",
        perspective: "outgoing",
        cue: "impact",
        intensity: 1,
      },
      {
        seq: 16,
        kind: "spell-cast",
        perspective: "self",
        cue: "cast",
        school: "cold",
        intensity: 3,
      },
    ],
  });
  assert.deepEqual(
    visualEffects.getSnapshot().activeCues.map((cue) => cue.slot),
    ["incoming", "outgoing", "spell"],
  );
  assert.equal(visualEffects.getSnapshot().activeCues[2].palette, "cold");
  t.mock.timers.tick(360);
  assert.deepEqual(
    visualEffects.getSnapshot().activeCues.map((cue) => cue.slot),
    ["incoming", "spell"],
  );
  t.mock.timers.tick(60);
  assert.deepEqual(
    visualEffects.getSnapshot().activeCues.map((cue) => cue.slot),
    ["spell"],
  );
  t.mock.timers.tick(1_030);
  assert.deepEqual(visualEffects.getSnapshot().activeCues, []);

  visualEffects.setReducedMotion(true);
  assert.equal(visualEffects.getSnapshot().reducedMotion, true);
  visualEffects.setPresentationVisible(false);
  clock = 2_000;
  bus.dispatch("Darkwind.Visual.Event", {
    epoch: "events-1",
    seq: 17,
    kind: "damage",
    perspective: "incoming",
    cue: "impact",
    intensity: 3,
  });
  visualEffects.setPresentationVisible(true);
  bus.dispatch("Darkwind.Visual.Event", {
    epoch: "events-1",
    seq: 17,
    kind: "damage",
    perspective: "incoming",
    cue: "impact",
    intensity: 3,
  });
  assert.deepEqual(visualEffects.getSnapshot().activeCues, []);
  scope.dispose();
});

test("previews, recovery, two sessions, and disposal cannot leak state or late timers", async (t) => {
  const modules = await loadModules(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = createVisualEffects(modules);
  const second = createVisualEffects(modules);
  first.visualEffects.configure({ visualEffectsEnabled: true });
  second.visualEffects.configure({ visualEffectsEnabled: true });
  connect(first.eventBus);
  connect(second.eventBus);

  first.bus.dispatch("Darkwind.Visual.Preview", { kind: "terrain", value: "arctic" });
  assert.deepEqual(first.visualEffects.getSnapshot().preview, {
    kind: "terrain",
    value: "arctic",
  });
  assert.equal(second.visualEffects.getSnapshot().preview, null);
  const previewGeneration = first.visualEffects.getSnapshot().previewGeneration;
  t.mock.timers.tick(4_999);
  assert.notEqual(first.visualEffects.getSnapshot().preview, null);
  t.mock.timers.tick(1);
  assert.equal(first.visualEffects.getSnapshot().preview, null);
  assert.equal(first.visualEffects.getSnapshot().previewGeneration, previewGeneration + 1);

  first.bus.dispatch("Darkwind.Visual.State", {
    epoch: "before-recovery",
    seq: 1,
    reason: "move",
    planet: "darkwind",
    terrain: ["city"],
  });
  first.bus.dispatch("Char.Vitals", { hp: 20, maxhp: 100 });
  first.bus.dispatch("Darkwind.Visual.Preview", { kind: "low-health" });
  first.bus.dispatch("Darkwind.Session.Recovered", { mode: "linkdead" });
  assert.equal(first.visualEffects.getSnapshot().world.planet, "");
  assert.equal(first.visualEffects.getSnapshot().health.hp, null);
  assert.equal(first.visualEffects.getSnapshot().preview, null);
  assert.equal(latestSubscription(first.sent).reason, "session-recovered");
  assert.equal(latestSubscription(first.sent).features.visualEffects, true);
  assert.equal(second.sent.some((line) => line.includes("session-recovered")), false);

  let calls = 0;
  first.visualEffects.subscribe(() => {
    calls += 1;
  });
  first.bus.dispatch("Darkwind.Visual.Preview", { kind: "transition" });
  const frozenAtDispose = first.visualEffects.getSnapshot();
  first.scope.dispose();
  first.bus.dispatch("Darkwind.Visual.Preview", { kind: "planet", value: "tekal" });
  t.mock.timers.tick(5_000);
  assert.equal(first.visualEffects.getSnapshot(), frozenAtDispose);
  assert.equal(calls, 2);

  second.bus.dispatch("Darkwind.Visual.Preview", { kind: "planet", value: "tekal" });
  assert.deepEqual(second.visualEffects.getSnapshot().preview, { kind: "planet", value: "tekal" });
  second.bus.dispatch("Darkwind.Visual.State", {
    epoch: "second-before-disconnect",
    seq: 1,
    reason: "move",
    planet: "tekal",
    terrain: ["coast"],
  });
  second.bus.dispatch("Char.Vitals", { hp: 30, maxhp: 100 });
  second.eventBus.publish("transport:reconnect-status", {
    status: "waiting",
    attempt: 1,
    transport: "ws",
  });
  assert.equal(second.visualEffects.getSnapshot().connected, false);
  assert.equal(second.visualEffects.getSnapshot().preview, null);
  assert.equal(second.visualEffects.getSnapshot().world.planet, "");
  assert.equal(second.visualEffects.getSnapshot().health.hp, null);
  second.bus.dispatch("Darkwind.Visual.Preview", { kind: "planet", value: "markas" });
  assert.equal(second.visualEffects.getSnapshot().preview, null);
  second.visualEffects.configure({
    visualEffectsEnabled: true,
    visualEffectPreferences: preferences(["lowHealth"]),
  });
  const reconnectSendsBefore = second.sent.filter((line) =>
    line.includes('"reason":"reconnect"'),
  ).length;
  connect(second.eventBus);
  assert.equal(
    second.sent.filter((line) => line.includes('"reason":"reconnect"')).length,
    reconnectSendsBefore,
  );
  await Promise.resolve();
  assert.equal(latestSubscription(second.sent).reason, "reconnect");
  assert.equal(latestSubscription(second.sent).features.visualEffects, false);
  assert.equal(second.visualEffects.getSnapshot().world.planet, "");
  assert.equal(second.visualEffects.getSnapshot().health.hp, null);
  connect(second.eventBus);
  await Promise.resolve();
  assert.equal(
    second.sent.filter((line) => line.includes('"reason":"reconnect"')).length,
    reconnectSendsBefore + 1,
  );
  second.eventBus.publish("transport:reconnect-status", {
    status: "waiting",
    attempt: 2,
    transport: "ws",
  });
  connect(second.eventBus);
  second.eventBus.publish("transport:reconnect-status", {
    status: "waiting",
    attempt: 3,
    transport: "ws",
  });
  await Promise.resolve();
  assert.equal(
    second.sent.filter((line) => line.includes('"reason":"reconnect"')).length,
    reconnectSendsBefore + 1,
  );
  connect(second.eventBus);
  second.scope.dispose();
  await Promise.resolve();
  assert.equal(
    second.sent.filter((line) => line.includes('"reason":"reconnect"')).length,
    reconnectSendsBefore + 1,
  );
});
