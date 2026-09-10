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
  const [tutorial, bus, diagnostics, ids, scope, events] = await Promise.all([
    ssr.runner.import("/runtime/tutorial.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
  ]);
  return { ...tutorial, ...bus, ...diagnostics, ...ids, ...scope, ...events };
}

function createHarness(modules) {
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  const eventBus = modules.createSessionEventBus(sessionId, diagnostics);
  const sent = [];
  const gmcp = modules.createSessionGmcpBus(sessionId, (bytes) => {
    sent.push(new TextDecoder().decode(bytes));
    return true;
  }, diagnostics);
  const tutorial = modules.createSessionTutorial(gmcp, scope, eventBus);
  const reconnect = (status) =>
    eventBus.publish("transport:reconnect-status", {
      status,
      attempt: 0,
      transport: "ws",
    });
  return { eventBus, gmcp, reconnect, scope, sent, tutorial };
}

function statePayload(overrides = {}) {
  return {
    epoch: "tutorial-1",
    seq: 4,
    tutorial_version: 2,
    status: "active",
    awaiting_continue: 0,
    chapter: { id: "orientation", index: 1, total: 5, title: "Orientation" },
    step: {
      id: "look",
      index: 1,
      total: 21,
      title: "Look around",
      task: "Read the room description.",
      hint: "Type look.",
      help: "help look",
      example_command: "look",
      target: "command-input",
    },
    route: null,
    actions: ["hint", "skip"],
    reason: "progress",
    hint_visible: 0,
    ...overrides,
  };
}

function framesFor(sent, packageName) {
  return sent.filter((frame) => frame === packageName || frame.startsWith(packageName + " "));
}

function payload(frame, packageName) {
  return JSON.parse(frame.slice(packageName.length + 1));
}

const flushMicrotasks = () => Promise.resolve();

test("tutorial readiness is shell health, ordered before resync, and independent of card state", async (t) => {
  const modules = await loadModules(t);
  const harness = createHarness(modules);
  t.after(() => harness.scope.dispose());
  const snapshots = [];
  harness.tutorial.subscribe((snapshot) => snapshots.push(snapshot));

  harness.tutorial.setPresentationReady(true);
  harness.reconnect("connected");
  assert.deepEqual(harness.sent, [], "readiness waits for the composed Session handshake");
  await flushMicrotasks();
  assert.deepEqual(harness.sent.map((frame) => frame.split(" ")[0]), [
    "Darkwind.Client.Subscriptions",
    "Darkwind.Tutorial.Resync",
  ]);
  assert.equal(
    payload(harness.sent[0], "Darkwind.Client.Subscriptions").features.tutorialPane,
    true,
  );
  assert.equal(payload(harness.sent[1], "Darkwind.Tutorial.Resync").reason, "tutorial-connected");

  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload());
  let snapshot = harness.tutorial.getSnapshot();
  assert.equal(snapshot.presentationReady, true);
  assert.equal(snapshot.state.step.exampleCommand, "look");
  assert.match(snapshot.announcement, /Tutorial step 1 of 21/);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.state.step), true);

  harness.gmcp.dispatch("Darkwind.Tutorial.Control", {
    visible: 0,
    reason: "screenreader",
  });
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({
    seq: 5,
    status: "finished",
    actions: ["restart"],
  }));
  snapshot = harness.tutorial.getSnapshot();
  assert.equal(snapshot.controlEnabled, true, "new authoritative State restores Control");
  assert.equal(snapshot.state.status, "finished");
  assert.equal(snapshot.presentationReady, true, "finished progress does not hide shell readiness");

  harness.sent.length = 0;
  harness.tutorial.setPresentationReady(false);
  harness.tutorial.setPresentationReady(true);
  assert.equal(payload(harness.sent.at(-1), "Darkwind.Tutorial.Resync").reason, "tutorial-render-recovered");
  assert.ok(snapshots.length > 4);

  const disconnected = createHarness(modules);
  disconnected.tutorial.setPresentationReady(true);
  disconnected.reconnect("connected");
  disconnected.reconnect("scheduled");
  await flushMicrotasks();
  assert.equal(framesFor(disconnected.sent, "Darkwind.Tutorial.Resync").length, 0);
  disconnected.scope.dispose();

  const rapid = createHarness(modules);
  rapid.tutorial.setPresentationReady(true);
  rapid.reconnect("connected");
  rapid.reconnect("scheduled");
  rapid.reconnect("connected");
  rapid.sent.length = 0;
  await flushMicrotasks();
  assert.deepEqual(rapid.sent.map((frame) => frame.split(" ")[0]), [
    "Darkwind.Client.Subscriptions",
    "Darkwind.Tutorial.Resync",
  ]);
  rapid.scope.dispose();

  const disposed = createHarness(modules);
  disposed.tutorial.setPresentationReady(true);
  disposed.reconnect("connected");
  disposed.scope.dispose();
  await flushMicrotasks();
  assert.deepEqual(disposed.sent, []);
});

test("tutorial actions are authorized, exact, timeout-resynced, and stale ordered", async (t) => {
  const modules = await loadModules(t);
  const timers = [];
  const cancelled = new Set();
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay) => {
    const id = timers.length;
    timers.push({ callback, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => cancelled.add(id);
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  const harness = createHarness(modules);
  t.after(() => harness.scope.dispose());
  harness.reconnect("connected");
  await flushMicrotasks();
  harness.tutorial.setPresentationReady(true);
  harness.sent.length = 0;
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload());

  assert.equal(harness.tutorial.perform("directions"), false);
  assert.equal(harness.tutorial.perform("hint"), true);
  assert.deepEqual(payload(harness.sent.at(-1), "Darkwind.Tutorial.Action"), {
    action: "hint",
    epoch: "tutorial-1",
    seq: 4,
    step_id: "look",
  });
  assert.equal(harness.tutorial.perform("skip"), false, "one action remains pending");
  assert.equal(timers[0].delay, modules.TUTORIAL_ACTION_TIMEOUT_MS);

  timers[0].callback();
  assert.equal(harness.tutorial.getSnapshot().pendingAction, null);
  assert.equal(payload(harness.sent.at(-1), "Darkwind.Tutorial.Resync").reason, "action-timeout");

  assert.equal(harness.tutorial.perform("skip"), true);
  const lateTimer = timers[1].callback;
  harness.gmcp.dispatch("Darkwind.Tutorial.Control", {
    visible: 0,
    reason: "screenreader",
  });
  assert.equal(harness.tutorial.getSnapshot().pendingAction, null);
  const resyncCount = framesFor(harness.sent, "Darkwind.Tutorial.Resync").length;
  lateTimer();
  assert.equal(framesFor(harness.sent, "Darkwind.Tutorial.Resync").length, resyncCount);
  assert.ok(cancelled.has(1));

  const beforeStale = harness.tutorial.getSnapshot();
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({ reason: "stale" }));
  assert.equal(harness.tutorial.getSnapshot(), beforeStale);
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({ seq: 5, reason: "newer" }));
  assert.equal(harness.tutorial.getSnapshot().pendingAction, null);
  assert.equal(harness.tutorial.getSnapshot().controlEnabled, true);

  harness.sent.length = 0;
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({
    epoch: "tutorial-2",
    seq: 10_001,
    awaiting_continue: 1,
    actions: ["continue", "hint"],
  }));
  assert.equal(framesFor(harness.sent, "Darkwind.Tutorial.Action").length, 1);
  assert.equal(payload(harness.sent.at(-1), "Darkwind.Tutorial.Action").seq, 10_001);
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({
    epoch: "tutorial-2",
    seq: 10_001,
    awaiting_continue: 1,
    actions: ["continue", "hint"],
  }));
  assert.equal(framesFor(harness.sent, "Darkwind.Tutorial.Action").length, 1);
});

test("reconnect and Session.Recovered republish readiness with exact resync state", async (t) => {
  const modules = await loadModules(t);
  const harness = createHarness(modules);
  t.after(() => harness.scope.dispose());
  harness.reconnect("connected");
  await flushMicrotasks();
  harness.tutorial.setPresentationReady(true);
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload());

  harness.sent.length = 0;
  harness.gmcp.dispatch("Darkwind.Session.Recovered", { mode: "linkdead" });
  assert.deepEqual(harness.sent.map((frame) => frame.split(" ")[0]), [
    "Darkwind.Client.Subscriptions",
    "Darkwind.Tutorial.Resync",
  ]);
  assert.deepEqual(payload(harness.sent[1], "Darkwind.Tutorial.Resync"), {
    epoch: "tutorial-1",
    seq: 4,
    reason: "tutorial-session-recovered",
  });

  harness.sent.length = 0;
  harness.reconnect("scheduled");
  assert.equal(harness.tutorial.getSnapshot().presentationReady, false);
  assert.equal(harness.tutorial.getSnapshot().state.epoch, "");
  const disconnected = harness.tutorial.getSnapshot();
  harness.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({
    epoch: "late",
    seq: 99,
  }));
  harness.gmcp.dispatch("Darkwind.Tutorial.Control", {
    visible: 0,
    reason: "late",
  });
  assert.equal(harness.tutorial.getSnapshot(), disconnected);
  harness.reconnect("connected");
  await flushMicrotasks();
  assert.equal(harness.tutorial.getSnapshot().presentationReady, true);
  assert.deepEqual(payload(harness.sent.at(-1), "Darkwind.Tutorial.Resync"), {
    epoch: "",
    seq: 0,
    reason: "reconnect",
  });
});

test("tutorial sessions, disposal, and late action timers remain isolated", async (t) => {
  const modules = await loadModules(t);
  const timers = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  globalThis.clearTimeout = () => {};
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  const first = createHarness(modules);
  const second = createHarness(modules);
  t.after(() => {
    if (!first.scope.disposed) first.scope.dispose();
    if (!second.scope.disposed) second.scope.dispose();
  });
  for (const harness of [first, second]) {
    harness.reconnect("connected");
    await flushMicrotasks();
    harness.tutorial.setPresentationReady(true);
    harness.sent.length = 0;
  }
  first.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({ epoch: "first" }));
  second.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({ epoch: "second" }));
  assert.equal(first.tutorial.getSnapshot().state.epoch, "first");
  assert.equal(second.tutorial.getSnapshot().state.epoch, "second");

  assert.equal(first.tutorial.perform("hint"), true);
  assert.equal(framesFor(second.sent, "Darkwind.Tutorial.Action").length, 0);
  const lateTimer = timers[0].callback;
  first.scope.dispose();
  const sentAtDispose = first.sent.length;
  assert.equal(first.tutorial.getSnapshot().presentationReady, false);
  assert.equal(first.tutorial.perform("skip"), false);
  first.gmcp.dispatch("Darkwind.Tutorial.State", statePayload({ epoch: "late", seq: 9 }));
  lateTimer();
  assert.equal(first.tutorial.getSnapshot().state.epoch, "first");
  assert.equal(first.sent.length, sentAtDispose);
  assert.equal(second.tutorial.getSnapshot().presentationReady, true);
});
