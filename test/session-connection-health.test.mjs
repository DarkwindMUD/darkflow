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
  const [health, bus, diagnostics, ids, scope, events] = await Promise.all([
    ssr.runner.import("/runtime/connection-health.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
  ]);
  return { ...health, ...bus, ...diagnostics, ...ids, ...scope, ...events };
}

function transportSnapshot() {
  return {
    url: "ws://127.0.0.1:4242",
    readyState: 1,
    readyStateName: "open",
    connectionPending: false,
    reconnectAttempts: 0,
    connectTime: 0,
    lastOpenAt: 0,
    lastInboundAt: 0,
    lastInboundTextAt: 0,
    lastInboundGmcpAt: 0,
    lastOutboundAt: 0,
    lastCommandAt: 0,
    lastErrorAt: null,
    lastCloseAt: null,
    lastHandlerErrorAt: null,
    bufferedAmount: 0,
    lastBufferedAmount: 0,
    maxBufferedAmount: 0,
    stalledAt: null,
    forcedReconnects: 0,
    recentCommandCount: 0,
    bytesSent: 12,
    bytesReceived: 34,
    events: [],
  };
}

test("connection health validates probes, diagnoses, and disposes owned resources", async (t) => {
  const modules = await loadModules(t);
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  t.after(() => {
    if (!scope.disposed) scope.dispose();
  });
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
  const visibilityListeners = new Set();
  const visibility = {
    hidden: false,
    addEventListener(_type, listener) {
      visibilityListeners.add(listener);
    },
    removeEventListener(_type, listener) {
      visibilityListeners.delete(listener);
    },
  };
  let now = 1_000;
  const transport = { getHealthSnapshot: transportSnapshot };
  const capability = modules.createSessionConnectionHealth(
    bus,
    transport,
    scope,
    eventBus,
    () => ({ host: "127.0.0.1", port: "4242", protocol: "ws" }),
    {
      now: () => now,
      wallNow: () => now,
      fetch: async () => {
        now += 20;
        return new Response(null, { status: 204 });
      },
      visibilityTarget: visibility,
      isOnline: () => true,
      webHostname: "127.0.0.1",
    },
  );

  const snapshots = [];
  capability.subscribe((snapshot) => snapshots.push(snapshot));
  assert.equal(capability.getSnapshot().diagnosis.verdict, "disconnected");
  assert.equal(Object.isFrozen(capability.getSnapshot()), true);

  bus.sendHandshake({ client: "test", version: "1", width: 80, height: 24 });
  bus.dispatch("Core.Supports.Set", ["Darkwind.Lag 1"]);
  eventBus.publish("transport:reconnect-status", { status: "connected", transport: "ws" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(sent.includes("Core.Ping"));
  assert.ok(sent.includes("Darkwind.Lag.Get"));

  now += 75;
  bus.dispatch("Core.Ping", "");
  assert.equal(capability.getSnapshot().latestRtt, 95);

  const legacy = [];
  const errorSpy = t.mock.method(console, "error", () => {});
  bus.on("Darkwind.Lag.Status", (data) => legacy.push(data));
  bus.dispatch("Darkwind.Lag.Status", { hb_drift_avg_ms: "wrong" });
  assert.equal(legacy.length, 1);
  assert.equal(capability.getSnapshot().inputs.server, null);
  assert.equal(errorSpy.mock.callCount(), 1);

  bus.dispatch("Darkwind.Lag.Status", {
    uptime_s: 100,
    window_s: 60,
    hb_interval_ms: 2_000,
    hb_drift_avg_ms: 4,
    hb_drift_max_ms: 35,
    hb_missed: 0,
    cmds_per_sec_x100: 145,
    lines_per_sec_x100: 820,
    hb_processed_pct: 100,
    obj_processed_pct: 100,
  });
  assert.equal(capability.getSnapshot().inputs.server?.window_s, 60);
  assert.equal(capability.getSnapshot().transport.bytesReceived, 34);
  assert.equal(capability.runFullCheck(), true);
  assert.equal(capability.runFullCheck(), false);

  visibility.hidden = true;
  for (const listener of visibilityListeners) listener();
  eventBus.publish("transport:reconnect-status", { status: "scheduled", transport: "ws" });
  assert.equal(capability.getSnapshot().inputs.server, null);

  const beforeDispose = snapshots.length;
  scope.dispose();
  bus.dispatch("Darkwind.Lag.Status", {
    uptime_s: 1,
    window_s: 1,
    hb_interval_ms: 1,
    hb_drift_avg_ms: 1,
    hb_drift_max_ms: 1,
    hb_missed: 0,
    cmds_per_sec_x100: 1,
    lines_per_sec_x100: 1,
    hb_processed_pct: 1,
    obj_processed_pct: 1,
  });
  assert.equal(snapshots.length, beforeDispose);
  assert.equal(diagnostics.snapshot().liveTimers, 0);
  assert.equal(diagnostics.snapshot().liveListeners, 0);
});
