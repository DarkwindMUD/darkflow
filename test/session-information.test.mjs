import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const [information, bus, diagnostics, ids, scope, events] = await Promise.all([
    ssr.runner.import("/runtime/information.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
  ]);
  return { ...information, ...bus, ...diagnostics, ...ids, ...scope, ...events };
}

function createInformation(modules) {
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  const eventBus = modules.createSessionEventBus(sessionId, diagnostics);
  const sent = [];
  const bus = modules.createSessionGmcpBus(sessionId, (bytes) => {
    sent.push(new TextDecoder().decode(bytes));
    return true;
  }, diagnostics);
  return {
    bus,
    eventBus,
    information: modules.createSessionInformation(bus, scope, eventBus),
    scope,
    sent,
  };
}

test("information snapshots accept valid frames, merge deltas, and stay frozen", async (t) => {
  const modules = await loadModules(t);
  const { bus, information, sent } = createInformation(modules);
  const snapshots = [];
  information.subscribe((snapshot) => snapshots.push(snapshot));

  bus.dispatch("Char.Status", { name: "Nacho", gold: 100 });
  bus.dispatch("Char.Status", { level: 42 });
  bus.dispatch("Char.Vitals", { hp: 90, maxhp: 100, sp: 50, maxsp: 60 });
  bus.dispatch("Char.Stats", { str: 15 });
  bus.dispatch("Char.RealStats", { realstr: 12 });
  bus.dispatch("Char.Defences.List", [{ name: "stoneskin", kind: "buff" }]);
  bus.dispatch("Char.Defences.Add", { name: "shield", kind: "buff" });
  bus.dispatch("Char.Defences.Remove", { name: "stoneskin" });
  bus.dispatch("Group", { groupname: "Expedition", members: [{ name: "Nacho", info: { hp: 90 } }] });
  bus.dispatch("Darkwind.Char.Avatar", { url: "/assets/avatar.png", name: "Nacho" });
  bus.dispatch("Darkwind.Divine", { patron: "mitra", summary: "Bright." });
  bus.dispatch("Darkwind.Sky", { server_time: 1, game_now: 2, scale: { second: 1 }, time: { hour: 1 } });
  bus.dispatch("Darkwind.GuildVitals", { items: [{ id: "heat", label: "Heat", cur: 1, max: 10 }] });
  bus.dispatch("Darkwind.XPMon", { active: 1, xp: 25 });

  const snapshot = information.getSnapshot();
  assert.deepEqual(snapshot.status, { name: "Nacho", gold: 100, level: 42 });
  assert.equal(snapshot.vitals?.divine_patron, "mitra");
  assert.deepEqual(snapshot.stats, { current: { str: 15 }, base: { realstr: 12 } });
  assert.deepEqual(snapshot.defences, [{ name: "shield", kind: "buff" }]);
  assert.equal(snapshot.group?.groupname, "Expedition");
  assert.equal(snapshot.avatar?.url, "/assets/avatar.png");
  assert.equal(snapshot.sky?.receivedAt !== undefined, true);
  assert.equal(snapshot.guildVitals?.items?.[0]?.id, "heat");
  assert.equal(snapshot.xpmon?.xp, 25);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.defences), true);
  assert.ok(snapshots.length > 1);

  information.setVisiblePanels(["avatar", "buffs"]);
  const subscription = JSON.parse(sent.at(-1).slice("Darkwind.Client.Subscriptions ".length));
  assert.equal(subscription.panels.avatar, true);
  assert.equal(subscription.panels.buffs, true);
  assert.equal(subscription.panels.status, true);
  assert.equal(subscription.panels.vitals, true);
});

test("divine patron attaches to vitals regardless of frame order", async (t) => {
  const modules = await loadModules(t);

  const early = createInformation(modules);
  early.bus.dispatch("Darkwind.Divine", { patron: "mitra" });
  early.bus.dispatch("Char.Vitals", { hp: 1, maxhp: 2 });
  assert.equal(early.information.getSnapshot().vitals?.divine_patron, "mitra");

  const late = createInformation(modules);
  late.bus.dispatch("Char.Vitals", { hp: 1, maxhp: 2 });
  late.bus.dispatch("Darkwind.Divine", { patron: "mitra" });
  assert.equal(late.information.getSnapshot().vitals?.divine_patron, "mitra");
});

test("information ignores malformed frames while compatibility handlers still receive them", async (t) => {
  const modules = await loadModules(t);
  const { bus, information } = createInformation(modules);
  const legacy = [];
  const errorSpy = t.mock.method(console, "error", () => {});
  bus.on("Char.Vitals", (data) => legacy.push(data));

  bus.dispatch("Char.Vitals", { hp: "wrong" });
  assert.equal(legacy.length, 1);
  assert.equal(information.getSnapshot().vitals, null);
  assert.equal(errorSpy.mock.callCount(), 1);

  bus.dispatch("Char.Vitals", { hp: 1, maxhp: 2 });
  assert.equal(legacy.length, 2);
  assert.equal(information.getSnapshot().vitals?.hp, 1);
});

test("information resets on disconnect and stays isolated after disposal", async (t) => {
  const modules = await loadModules(t);
  const first = createInformation(modules);
  const second = createInformation(modules);

  first.bus.dispatch("Char.Status", { name: "First" });
  assert.equal(first.information.getSnapshot().status?.name, "First");
  assert.equal(second.information.getSnapshot().status, null);

  first.eventBus.publish("transport:reconnect-status", { status: "scheduled", attempt: 1, transport: "wss" });
  assert.equal(first.information.getSnapshot().status, null);

  first.scope.dispose();
  first.bus.dispatch("Char.Status", { name: "Late" });
  assert.equal(first.information.getSnapshot().status, null);
});
