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
  const [notifications, bus, diagnostics, ids, scope, events] = await Promise.all([
    ssr.runner.import("/runtime/notifications.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
  ]);
  return { ...notifications, ...bus, ...diagnostics, ...ids, ...scope, ...events };
}

function createInformation(name = "Nacho") {
  let snapshot = { status: name ? { name } : null };
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    get listenerCount() {
      return listeners.size;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    setName(nextName) {
      snapshot = { status: nextName ? { name: nextName } : null };
      for (const listener of [...listeners]) listener(snapshot);
    },
  };
}

function createNotifications(modules, { name = "Nacho", now = () => 0 } = {}) {
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  const eventBus = modules.createSessionEventBus(sessionId, diagnostics);
  const sent = [];
  const bus = modules.createSessionGmcpBus(
    sessionId,
    (bytes) => {
      sent.push(new TextDecoder().decode(bytes));
      return true;
    },
    diagnostics,
  );
  const information = createInformation(name);
  const notifications = modules.createSessionNotifications(bus, scope, eventBus, information, {
    now,
  });
  return { bus, diagnostics, eventBus, information, notifications, scope, sent };
}

function mention(text = "hello @Nacho", overrides = {}) {
  return { channel: "gossip", talker: "Alice", text, ...overrides };
}

test("notifications publishes frozen bounded channel and roster snapshots", async (t) => {
  const modules = await loadModules(t);
  const { bus, notifications, scope } = createNotifications(modules);
  let removeSecond = () => {};
  let armed = false;
  let secondCalls = 0;
  notifications.subscribe(() => {
    if (armed) removeSecond();
  });
  removeSecond = notifications.subscribe(() => {
    secondCalls += 1;
  });
  armed = true;

  bus.dispatch("Comm.Channel.List", [
    { name: "Gossip", ignored: "not retained" },
    { name: "tell" },
    { name: "Trade" },
  ]);
  bus.dispatch("Comm.Channel.Players", [
    {
      name: "ALICE",
      displayName: "Alice Example",
      channels: ["GOSSIP", "tell", "gossip"],
      ignored: "not retained",
    },
  ]);

  const snapshot = notifications.getSnapshot();
  assert.deepEqual(snapshot.channelNames, ["gossip", "trade"]);
  assert.deepEqual(snapshot.roster, [
    { name: "alice", displayName: "Alice Example", channels: ["gossip"] },
  ]);
  assert.equal(snapshot.playerName, "Nacho");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.channelNames), true);
  assert.equal(Object.isFrozen(snapshot.roster[0]), true);
  assert.equal(Object.isFrozen(snapshot.roster[0].channels), true);
  assert.equal(secondCalls, 1);

  bus.dispatch("Comm.Channel.Players", [{ name: "NoChannels" }]);
  assert.deepEqual(notifications.getSnapshot().roster, []);
  scope.dispose();
});

test("notifications rejects malformed modeled frames and enforces collection limits", async (t) => {
  const modules = await loadModules(t);
  const { bus, notifications, scope } = createNotifications(modules);
  const errorSpy = t.mock.method(console, "error", () => {});

  bus.dispatch("Comm.Channel.List", [{ name: "gossip" }]);
  bus.dispatch("Comm.Channel.List", [{ name: 42 }]);
  assert.deepEqual(notifications.getSnapshot().channelNames, ["gossip"]);

  const channels = Object.fromEntries(
    Array.from({ length: 130 }, (_, index) => [`channel-${index}`, 1]),
  );
  bus.dispatch("Comm.Channel.List", channels);
  assert.equal(notifications.getSnapshot().channelNames.length, 128);

  const arrayWithInvalidExcess = Array.from({ length: 128 }, (_, index) => ({
    name: `array-${index}`,
  }));
  arrayWithInvalidExcess.push({ name: 42 });
  bus.dispatch("Comm.Channel.List", arrayWithInvalidExcess);
  assert.equal(notifications.getSnapshot().channelNames.length, 128);
  assert.equal(notifications.getSnapshot().channelNames[0], "array-0");

  const mappingWithInvalidExcess = Object.fromEntries(
    Array.from({ length: 128 }, (_, index) => [`mapping-${index}`, 1]),
  );
  mappingWithInvalidExcess.invalid = "yes";
  bus.dispatch("Comm.Channel.List", mappingWithInvalidExcess);
  assert.equal(notifications.getSnapshot().channelNames.length, 128);
  assert.equal(notifications.getSnapshot().channelNames[0], "mapping-0");

  const roster = Array.from({ length: 513 }, (_, index) => ({
    name: `player-${index}`,
    displayName: `Player ${index}`,
    channels: Array.from({ length: 66 }, (_unused, channel) => `chan-${channel}`),
  }));
  bus.dispatch("Comm.Channel.Players", roster);
  assert.equal(notifications.getSnapshot().roster.length, 512);
  assert.equal(notifications.getSnapshot().roster[0].channels.length, 64);

  const rosterWithInvalidExcess = roster.slice(0, 512);
  rosterWithInvalidExcess[0] = { ...rosterWithInvalidExcess[0], name: "replacement-0" };
  rosterWithInvalidExcess.push({ name: 42, channels: "gossip" });
  bus.dispatch("Comm.Channel.Players", rosterWithInvalidExcess);
  assert.equal(notifications.getSnapshot().roster.length, 512);
  assert.equal(notifications.getSnapshot().roster[0].name, "replacement-0");

  bus.dispatch("Comm.Channel.Players", [{ name: "Alice", channels: "gossip" }]);
  assert.equal(notifications.getSnapshot().roster.length, 512);

  notifications.recordOutputLine({ id: 1, text: "Alice: hello @Nacho" });
  bus.dispatch("Comm.Channel.Text", mention("x".repeat(4090) + " @Nacho"));
  bus.dispatch("Comm.Channel.Text", mention("hello @Nacho", { talker: "x".repeat(81) }));
  assert.equal(notifications.getSnapshot().notifications.length, 0);
  assert.equal(errorSpy.mock.callCount() > 0, true);
  scope.dispose();
});

test("notifications correlates before and after output, dedupes, and ignores gagged lines", async (t) => {
  const modules = await loadModules(t);
  let clock = 100;
  const { bus, notifications, scope } = createNotifications(modules, { now: () => clock });

  notifications.recordOutputLine({ id: 1, text: "oldest @Nacho" });
  for (let id = 2; id <= 251; id += 1) {
    notifications.recordOutputLine({ id, text: `unmatched line ${id}` });
  }
  bus.dispatch("Comm.Channel", mention("oldest @Nacho"));
  assert.equal(notifications.getSnapshot().notifications.length, 0);

  bus.dispatch("Comm.Channel", mention("first @Nacho"));
  assert.equal(notifications.getSnapshot().notifications.length, 0);
  notifications.recordOutputLine({ id: 11, text: "[gossip] Alice: first @Nacho" });
  assert.equal(notifications.getSnapshot().notifications[0].type, "mention");
  assert.equal(notifications.getSnapshot().notifications[0].lineId, 11);

  bus.dispatch("Comm.Channel.Text", mention("first   @NACHO"));
  assert.equal(notifications.getSnapshot().notifications.length, 1);

  clock += 10_001;
  notifications.recordOutputLine({ id: 12, text: "[gossip] Alice: second @Nacho" });
  bus.dispatch("Comm.Channel.Text", mention("second @Nacho"));
  assert.equal(notifications.getSnapshot().notifications[0].lineId, 12);

  notifications.recordOutputLine({ id: 15, text: "bare @Nacho" });
  bus.dispatch("Comm.Channel", "bare @Nacho");
  assert.equal(notifications.getSnapshot().notifications[0].lineId, 15);
  assert.equal(notifications.getSnapshot().notifications[0].channel, "");
  assert.equal(notifications.getSnapshot().notifications[0].talker, "");

  bus.dispatch("Comm.Channel.Text", mention("gagged @Nacho"));
  clock += 10_001;
  notifications.recordOutputLine({ id: 13, text: "[gossip] Alice: unrelated" });
  assert.equal(notifications.getSnapshot().notifications.length, 3);

  bus.dispatch("Comm.Channel.Text", mention("oversize-output @Nacho"));
  notifications.recordOutputLine({ id: 14, text: "x".repeat(4097) });
  assert.equal(notifications.getSnapshot().notifications.length, 3);
  scope.dispose();
});

test("notifications caps rows and supports activation, expiration, reset, and clear", async (t) => {
  const modules = await loadModules(t);
  let clock = 0;
  const { bus, notifications, scope } = createNotifications(modules, { now: () => clock });

  for (let index = 0; index < 101; index += 1) {
    const text = `message-${index} @Nacho`;
    notifications.recordOutputLine({ id: index + 1, text: `Alice: ${text}` });
    bus.dispatch("Comm.Channel.Text", mention(text));
    clock += 1;
  }
  let snapshot = notifications.getSnapshot();
  assert.equal(snapshot.notifications.length, 100);
  assert.equal(snapshot.unreadCount, 100);
  const newest = snapshot.notifications[0];

  assert.equal(notifications.activate(newest.id), newest.lineId);
  snapshot = notifications.getSnapshot();
  assert.equal(snapshot.notifications[0].read, true);
  assert.equal(snapshot.unreadCount, 99);
  notifications.markExpired(newest.id);
  assert.equal(notifications.activate(newest.id), null);

  notifications.resetOutputLines();
  assert.equal(
    notifications.getSnapshot().notifications.every((item) => item.lineId === null),
    true,
  );
  assert.equal(
    notifications.getSnapshot().notifications.every((item) => item.expired),
    true,
  );
  notifications.clear();
  assert.equal(notifications.getSnapshot().notifications.length, 0);
  assert.equal(notifications.getSnapshot().unreadCount, 0);
  scope.dispose();
});

test("roster requests use the named send, rate limit, response, and timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const modules = await loadModules(t);
  let clock = 0;
  const { bus, notifications, scope, sent } = createNotifications(modules, {
    now: () => clock,
  });

  assert.equal(notifications.requestRoster(), true);
  assert.deepEqual(sent, ["Comm.Channel.Players {}"]);
  assert.equal(notifications.getSnapshot().rosterRequestPending, true);
  clock = 999;
  assert.equal(notifications.requestRoster(), false);

  bus.dispatch("Comm.Channel.Players", [{ name: "Alice", channels: ["gossip"] }]);
  assert.equal(notifications.getSnapshot().rosterRequestPending, false);
  clock = 1000;
  assert.equal(notifications.requestRoster(), true);
  t.mock.timers.tick(2499);
  assert.equal(notifications.getSnapshot().rosterRequestPending, true);
  t.mock.timers.tick(1);
  assert.equal(notifications.getSnapshot().rosterRequestPending, false);
  scope.dispose();
});

test("notifications isolates sessions and resets on identity, reconnect, and disposal", async (t) => {
  const modules = await loadModules(t);
  const first = createNotifications(modules);
  const second = createNotifications(modules, { name: "Raven" });
  let firstCalls = 0;
  first.notifications.subscribe(() => {
    firstCalls += 1;
  });

  first.notifications.recordOutputLine({ id: 1, text: "Alice: hi @Nacho" });
  first.bus.dispatch("Comm.Channel", mention("hi @Nacho"));
  second.notifications.recordOutputLine({ id: 1, text: "Alice: hi @Raven" });
  second.bus.dispatch("Comm.Channel", mention("hi @Raven"));
  assert.equal(first.notifications.getSnapshot().notifications.length, 1);
  assert.equal(second.notifications.getSnapshot().notifications.length, 1);

  first.information.setName("Other");
  assert.deepEqual(first.notifications.getSnapshot(), {
    playerName: "Other",
    channelNames: [],
    roster: [],
    rosterRequestPending: false,
    notifications: [],
    unreadCount: 0,
  });

  first.bus.dispatch("Comm.Channel.List", [{ name: "gossip" }]);
  first.eventBus.publish("transport:reconnect-status", {
    status: "scheduled",
    attempt: 1,
    transport: "wss",
  });
  assert.equal(first.notifications.getSnapshot().playerName, "");
  assert.deepEqual(first.notifications.getSnapshot().channelNames, []);

  const beforeDispose = firstCalls;
  first.scope.dispose();
  assert.equal(first.information.listenerCount, 0);
  first.bus.dispatch("Comm.Channel.List", [{ name: "trade" }]);
  first.information.setName("Late");
  assert.equal(firstCalls, beforeDispose);
  assert.equal(first.notifications.requestRoster(), false);
  assert.deepEqual(first.notifications.getSnapshot(), {
    playerName: "",
    channelNames: [],
    roster: [],
    rosterRequestPending: false,
    notifications: [],
    unreadCount: 0,
  });
  assert.equal(second.notifications.getSnapshot().notifications.length, 1);
  second.scope.dispose();
});
