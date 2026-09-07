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
  const [diagnostics, bus, ids, scope, gmcpDiagnostics] = await Promise.all([
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/gmcp-diagnostics.ts"),
  ]);
  return { ...diagnostics, ...bus, ...ids, ...scope, ...gmcpDiagnostics };
}

function createDiagnostics(modules) {
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const runtimeDiagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, runtimeDiagnostics);
  const bus = modules.createSessionGmcpBus(sessionId, () => true, runtimeDiagnostics);
  const map = { summaryCalls: 0, exportCalls: 0, clearCalls: 0 };
  let now = 0;
  const diagnostics = modules.createSessionGmcpDiagnostics(
    bus,
    scope,
    {
      mapSummary: () => {
        map.summaryCalls += 1;
        return "summary";
      },
      mapExport: () => {
        map.exportCalls += 1;
        return "export";
      },
      clearMap: () => {
        map.clearCalls += 1;
        return true;
      },
    },
    { now: () => ++now },
  );
  return { bus, diagnostics, map, scope };
}

test("GMCP diagnostics retain canonical, redacted, bounded frozen entries", async (t) => {
  const modules = await loadModules(t);
  const { bus, diagnostics, scope } = createDiagnostics(modules);

  bus.dispatch("Fixture.Ping", {
    nested: { Authorization: "Bearer secret", token: "private", visible: "safe" },
  });
  for (let index = 0; index < 205; index += 1) bus.dispatch("Fixture.Message", { index });
  bus.dispatch("Fixture.Large", { value: "x".repeat(20_000) });
  bus.dispatch("Fixture.Unmodeled", undefined);

  const entries = diagnostics.getSnapshot().entries;
  assert.equal(entries.length, modules.GMCP_DIAGNOSTIC_LIMIT);
  assert.equal(entries.at(-2).packageName, "Fixture.Large");
  assert.equal(entries.at(-2).payload.length, modules.GMCP_DIAGNOSTIC_PAYLOAD_LIMIT);
  assert.match(entries.at(-2).payload, /\[truncated\]$/);
  assert.equal(entries.at(-1).payload, "undefined");
  assert.equal(Object.isFrozen(diagnostics.getSnapshot()), true);
  assert.equal(Object.isFrozen(entries), true);
  const ping = diagnostics.getSnapshot().entries.find(({ packageName }) => packageName === "Fixture.Ping");
  assert.equal(ping, undefined);

  const direct = createDiagnostics(modules);
  direct.bus.dispatch("Fixture.Ping", { nested: { Authorization: "Bearer secret", visible: "safe" } });
  assert.equal(direct.diagnostics.getSnapshot().entries[0].packageName, "Fixture.Ping");
  assert.match(direct.diagnostics.getSnapshot().entries[0].payload, /\[redacted\]/);
  assert.doesNotMatch(direct.diagnostics.getSnapshot().entries[0].payload, /Bearer secret/);
  direct.scope.dispose();
  scope.dispose();
});

test("GMCP diagnostics own subscriptions and forward only named map actions", async (t) => {
  const modules = await loadModules(t);
  const { bus, diagnostics, map, scope } = createDiagnostics(modules);
  let calls = 0;
  const unsubscribe = diagnostics.subscribe(() => {
    calls += 1;
  });
  bus.dispatch("Fixture.One", { ok: true });
  unsubscribe();
  bus.dispatch("Fixture.Two", { ok: true });
  assert.equal(calls, 2);

  assert.equal(diagnostics.appendMapSummary(), true);
  assert.equal(diagnostics.copyMapExport(), "export");
  assert.equal(diagnostics.clearMap(), true);
  assert.deepEqual(map, { summaryCalls: 1, exportCalls: 1, clearCalls: 1 });
  assert.equal(diagnostics.getSnapshot().entries.at(-2).packageName, "Map Summary");
  assert.equal(diagnostics.getSnapshot().entries.at(-1).packageName, "Map Clear");

  const length = diagnostics.getSnapshot().entries.length;
  scope.dispose();
  bus.dispatch("Fixture.Late", { ignored: true });
  assert.equal(diagnostics.getSnapshot().entries.length, length);
  assert.equal(diagnostics.appendMapSummary(), false);
  assert.equal(diagnostics.copyMapExport(), null);
  assert.equal(diagnostics.clearMap(), false);
});
