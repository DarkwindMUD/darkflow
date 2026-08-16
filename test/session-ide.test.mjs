import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadIdeModules(t) {
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

  const [ide, scope, eventBus, diagnostics, bus, ids] = await Promise.all([
    ssr.runner.import("/runtime/ide.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/model/ids.ts"),
  ]);
  return { ...ide, ...scope, ...eventBus, ...diagnostics, ...bus, ...ids };
}

function createHarness(modules, t, options = {}) {
  const uuidFactory = modules.createSequentialUuidFactory();
  const sessionId = modules.createSessionId(uuidFactory);
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  const eventBus = modules.createSessionEventBus(sessionId, diagnostics);
  const calls = [];
  const sink = (bytes) => {
    const frame = new TextDecoder().decode(bytes);
    calls.push(frame);
    return options.sendResult?.(frame, calls.length) ?? true;
  };
  const gmcp = modules.createSessionGmcpBus(sessionId, sink, diagnostics);
  const transport = {
    state: "disconnected",
    getHealthSnapshot: () => ({ bufferedAmount: options.getBufferedAmount?.() ?? 0 }),
  };
  const ide = modules.createSessionIde(gmcp, scope, eventBus, transport, {
    createTransferId: options.createTransferId ?? (() => "save-transfer"),
    ...(options.sha1Hex ? { sha1Hex: options.sha1Hex } : {}),
  });
  const reconnect = (status, extra = {}) => {
    transport.state = status === "connected" ? "connected" : "disconnected";
    eventBus.publish("transport:reconnect-status", {
      status,
      attempt: 0,
      transport: "ws",
      ...extra,
    });
  };
  t.after(() => {
    if (!scope.disposed) scope.dispose();
    if (!eventBus.disposed) eventBus.dispose();
  });
  return { calls, diagnostics, eventBus, gmcp, ide, reconnect, scope, transport };
}

async function waitFor(predicate, message = "condition") {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function openWritable(harness, pathName = "/domains/test.c") {
  harness.reconnect("connected");
  harness.gmcp.dispatch("Darkwind.IDE.Open", {
    path: pathName,
    content: "initial",
    title: "Test file",
    language: "c",
    readOnly: 1,
    editable: 1,
  });
}

test("IDE normalizes live flags, freezes snapshots, and ignores malformed advisory ingress", async (t) => {
  const modules = await loadIdeModules(t);
  const harness = createHarness(modules, t);
  const advisory = [];
  harness.gmcp.on("Darkwind.IDE.Open", (data) => advisory.push(data));
  t.mock.method(console, "error", () => {});

  harness.reconnect("connected");
  harness.gmcp.dispatch("Darkwind.IDE.Open", { path: 7, content: "bad" });
  assert.equal(advisory.length, 1);
  assert.equal(harness.ide.getSnapshot().document, null);

  harness.gmcp.dispatch("Darkwind.IDE.Open", {
    path: "/a.c",
    title: "A",
    content: "alpha",
    readOnly: 1,
    editable: 1,
  });
  const snapshot = harness.ide.getSnapshot();
  assert.deepEqual(snapshot.document, {
    path: "/a.c",
    title: "A",
    content: "alpha",
    language: "text",
    readOnly: false,
    stale: false,
  });
  assert.equal(snapshot.openVersion, 1);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.document));

  harness.reconnect("scheduled");
  harness.gmcp.dispatch("Darkwind.IDE.Open", { path: "/offline.c", content: "offline" });
  assert.equal(harness.ide.getSnapshot().document.stale, true);

  let publishing = false;
  const seen = [];
  harness.ide.subscribe(() => {
    if (!publishing) return;
    seen.push("first");
    stopSecond();
  });
  const stopSecond = harness.ide.subscribe(() => {
    if (publishing) seen.push("second");
  });
  publishing = true;
  harness.reconnect("connected");
  assert.deepEqual(seen, ["first"]);
});

test("IDE reassembles bounded out-of-order chunks once and rejects broken transfers", async (t) => {
  const modules = await loadIdeModules(t);
  const harness = createHarness(modules, t);
  harness.reconnect("connected");

  for (const chunks of [-1, 0, 1.5, 513]) {
    harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
      session: `bad-${chunks}`,
      path: "/bad.c",
      content: "",
      chunks,
      totalLength: 1,
    });
    assert.equal(harness.ide.getSnapshot().transfer, null);
  }
  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "oversize",
    path: "/bad.c",
    content: "",
    chunks: 1,
    totalLength: 4 * 1024 * 1024 + 1,
  });
  assert.equal(harness.ide.getSnapshot().transfer, null);
  for (const totalLength of [-1, 1.5]) {
    harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
      session: `bad-length-${totalLength}`,
      path: "/bad.c",
      content: "",
      chunks: 1,
      totalLength,
    });
    assert.equal(harness.ide.getSnapshot().transfer, null);
  }

  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "accumulated-oversize",
    path: "/bad.c",
    content: "",
    chunks: 1,
    totalLength: 4 * 1024 * 1024,
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", {
    session: "accumulated-oversize",
    index: 0,
    content: "a".repeat(4 * 1024 * 1024 + 1),
  });
  assert.match(harness.ide.getSnapshot().transferFailure, /limit/i);

  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "open-1",
    path: "/chunked.c",
    title: "Chunked",
    content: "",
    chunks: 3,
    totalLength: 5,
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", { session: "open-1", index: 2, content: "e" });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", { session: "open-1", index: 0, content: "ab" });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", { session: "open-1", index: 0, content: "XX" });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", { session: "open-1", index: 1, content: "cd" });
  harness.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "open-1" });
  assert.equal(harness.ide.getSnapshot().document.content, "XXcde");
  assert.equal(harness.ide.getSnapshot().openVersion, 1);

  harness.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "open-1" });
  assert.equal(harness.ide.getSnapshot().openVersion, 1);

  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "superseded",
    path: "/superseded.c",
    content: "",
    chunks: 1,
    totalLength: 3,
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", {
    session: "superseded",
    index: 0,
    content: "old",
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "current",
    path: "/current.c",
    content: "",
    chunks: 1,
    totalLength: 3,
  });
  assert.equal(harness.ide.getSnapshot().transfer.session, "current");
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", {
    session: "superseded",
    index: 0,
    content: "late",
  });
  assert.equal(harness.ide.getSnapshot().transfer.receivedChunks, 0);
  harness.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "superseded" });
  assert.equal(harness.ide.getSnapshot().document.path, "/chunked.c");
  assert.equal(harness.ide.getSnapshot().transfer.session, "current");
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", {
    session: "current",
    index: 0,
    content: "new",
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "current" });
  assert.equal(harness.ide.getSnapshot().document.path, "/current.c");
  assert.equal(harness.ide.getSnapshot().openVersion, 2);

  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "before-direct-open",
    path: "/stale.c",
    content: "",
    chunks: 1,
    totalLength: 5,
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", {
    session: "before-direct-open",
    index: 0,
    content: "stale",
  });
  harness.gmcp.dispatch("Darkwind.IDE.Open", { path: "/authoritative.c", content: "direct" });
  assert.equal(harness.ide.getSnapshot().transfer, null);
  harness.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "before-direct-open" });
  assert.equal(harness.ide.getSnapshot().document.path, "/authoritative.c");
  assert.equal(harness.ide.getSnapshot().openVersion, 3);

  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "missing",
    path: "/missing.c",
    content: "",
    chunks: 2,
    totalLength: 2,
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", { session: "missing", index: 0, content: "a" });
  harness.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "missing" });
  assert.match(harness.ide.getSnapshot().transferFailure, /missing/i);
  assert.equal(harness.ide.getSnapshot().document.path, "/authoritative.c");

  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "bad-index",
    path: "/bad.c",
    content: "",
    chunks: 1,
    totalLength: 1,
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", {
    session: "bad-index",
    index: -1,
    content: "a",
  });
  assert.match(harness.ide.getSnapshot().transferFailure, /index/i);

  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "bad-length",
    path: "/bad.c",
    content: "",
    chunks: 1,
    totalLength: 2,
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenChunk", {
    session: "bad-length",
    index: 0,
    content: "a",
  });
  harness.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "bad-length" });
  assert.match(harness.ide.getSnapshot().transferFailure, /length/i);
});

test("same transfer id remains isolated between two Session.ide capabilities", async (t) => {
  const modules = await loadIdeModules(t);
  const first = createHarness(modules, t);
  const second = createHarness(modules, t);
  first.reconnect("connected");
  second.reconnect("connected");

  for (const harness of [first, second]) {
    harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
      session: "shared",
      path: harness === first ? "/first.c" : "/second.c",
      content: "",
      chunks: 1,
      totalLength: 1,
    });
  }
  first.gmcp.dispatch("Darkwind.IDE.OpenChunk", { session: "shared", index: 0, content: "a" });
  first.gmcp.dispatch("Darkwind.IDE.OpenFinish", { session: "shared" });
  assert.equal(first.ide.getSnapshot().document.path, "/first.c");
  assert.equal(second.ide.getSnapshot().document, null);
  assert.equal(second.ide.getSnapshot().transfer.receivedChunks, 0);
});

test("IDE uses inline boundary then ordered chunks with UTF-8 SHA1", async (t) => {
  const modules = await loadIdeModules(t);
  const harness = createHarness(modules, t);
  openWritable(harness);

  const inline = "a".repeat(262_144);
  assert.equal(harness.ide.save(inline), true);
  assert.equal(harness.calls.at(-1), `Darkwind.IDE.Save {"path":"/domains/test.c","content":"${inline}"}`);
  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", { success: 1, message: "saved inline" });
  assert.equal(harness.ide.getSnapshot().save.status, "saved");

  const chunked = `é${"a".repeat(262_144)}`;
  assert.equal(harness.ide.save(chunked), true);
  await waitFor(() => harness.calls.some((frame) => frame.startsWith("Darkwind.IDE.SaveFinish ")), "save finish");

  const start = JSON.parse(
    harness.calls.find((frame) => frame.startsWith("Darkwind.IDE.SaveStart ")).slice("Darkwind.IDE.SaveStart ".length),
  );
  const chunks = harness.calls
    .filter((frame) => frame.startsWith("Darkwind.IDE.SaveChunk "))
    .map((frame) => JSON.parse(frame.slice("Darkwind.IDE.SaveChunk ".length)));
  assert.equal(start.chunks, 9);
  assert.equal(start.totalLength, 262_145);
  assert.equal(start.hash, createHash("sha1").update(chunked, "utf8").digest("hex"));
  assert.deepEqual(chunks.map((chunk) => chunk.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(chunks.map((chunk) => chunk.content).join(""), chunked);
  assert.equal(harness.ide.save("re-entry"), false);

  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", { path: "/wrong.c", success: true });
  assert.equal(harness.ide.getSnapshot().save.status, "saving");
  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", {
    path: "/domains/test.c",
    success: 0,
    message: "compile failed",
    errors: [{ line: 4, column: 0, message: "missing semicolon" }],
  });
  assert.equal(harness.ide.getSnapshot().save.status, "error");
  assert.deepEqual(harness.ide.getSnapshot().save.diagnostics, [
    { line: 4, column: 0, message: "missing semicolon" },
  ]);
});

test("SaveResult cannot complete a save while its digest is preparing", async (t) => {
  const modules = await loadIdeModules(t);
  let resolveHash;
  const harness = createHarness(modules, t, {
    sha1Hex: () =>
      new Promise((resolve) => {
        resolveHash = resolve;
      }),
  });
  openWritable(harness);

  assert.equal(harness.ide.save("a".repeat(262_145)), true);
  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", { success: true });
  assert.equal(harness.ide.getSnapshot().save.status, "saving");
  assert.equal(harness.ide.save("re-entry"), false);

  resolveHash("hash");
  await waitFor(
    () => harness.calls.some((frame) => frame.startsWith("Darkwind.IDE.SaveFinish ")),
    "save finish",
  );
  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", { success: true });
  assert.equal(harness.ide.getSnapshot().save.status, "saved");
});

test("backpressure delays later chunks and send failure aborts once", async (t) => {
  const modules = await loadIdeModules(t);
  let bufferedAmount = 0;
  let failChunk = true;
  let failFinish = false;
  const harness = createHarness(modules, t, {
    getBufferedAmount: () => bufferedAmount,
    sendResult(frame) {
      if (frame.startsWith("Darkwind.IDE.SaveChunk ")) {
        const index = JSON.parse(frame.slice("Darkwind.IDE.SaveChunk ".length)).index;
        if (index === 0 && failChunk) bufferedAmount = 65_536;
        if (index === 1 && failChunk) return false;
      }
      if (frame.startsWith("Darkwind.IDE.SaveFinish ") && failFinish) return false;
      return true;
    },
  });
  openWritable(harness);
  assert.equal(harness.ide.save("a".repeat(262_145)), true);
  await waitFor(
    () => harness.calls.filter((frame) => frame.startsWith("Darkwind.IDE.SaveChunk ")).length === 1,
    "first save chunk",
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.filter((frame) => frame.startsWith("Darkwind.IDE.SaveChunk ")).length, 1);
  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", { success: true });
  assert.equal(harness.ide.getSnapshot().save.status, "saving");
  assert.equal(harness.ide.save("re-entry"), false);
  bufferedAmount = 0;
  await waitFor(() => harness.calls.some((frame) => frame.startsWith("Darkwind.IDE.SaveAbort ")), "save abort");
  assert.equal(harness.calls.filter((frame) => frame.startsWith("Darkwind.IDE.SaveAbort ")).length, 1);
  assert.match(harness.calls.find((frame) => frame.startsWith("Darkwind.IDE.SaveAbort ")), /send-failed/);
  assert.equal(harness.ide.getSnapshot().save.status, "error");

  failChunk = false;
  failFinish = true;
  bufferedAmount = 0;
  assert.equal(harness.ide.save("b".repeat(262_145)), true);
  await waitFor(
    () =>
      harness.calls.filter((frame) => frame.startsWith("Darkwind.IDE.SaveAbort ")).length === 2,
    "finish failure abort",
  );
  assert.match(harness.calls.filter((frame) => frame.startsWith("Darkwind.IDE.SaveAbort ")).at(-1), /finish-failed/);
});

test("replacement and close cancel started saves with exact lifecycle frames", async (t) => {
  const modules = await loadIdeModules(t);
  let bufferedAmount = 0;
  const harness = createHarness(modules, t, {
    getBufferedAmount: () => bufferedAmount,
    sendResult(frame) {
      if (frame.startsWith("Darkwind.IDE.SaveChunk ")) bufferedAmount = 65_536;
      return true;
    },
  });
  openWritable(harness, "/first.c");
  harness.ide.save("a".repeat(262_145));
  await waitFor(() => harness.calls.some((frame) => frame.startsWith("Darkwind.IDE.SaveChunk ")));
  harness.gmcp.dispatch("Darkwind.IDE.Open", { path: "/second.c", content: "second" });
  assert.equal(harness.ide.getSnapshot().document.path, "/second.c");
  assert.equal(harness.calls.filter((frame) => frame.includes("SaveAbort")).length, 1);
  assert.equal(harness.calls.filter((frame) => frame.includes("IDE.Close")).length, 0);
  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", { path: "/first.c", success: true });
  assert.equal(harness.ide.getSnapshot().save.status, "idle");

  bufferedAmount = 0;
  harness.ide.save("b".repeat(262_145));
  await waitFor(
    () => harness.calls.filter((frame) => frame.startsWith("Darkwind.IDE.SaveChunk ")).length >= 2,
  );
  assert.equal(harness.ide.close(), true);
  assert.deepEqual(harness.calls.slice(-2), [
    'Darkwind.IDE.SaveAbort {"session":"save-transfer","reason":"closed"}',
    'Darkwind.IDE.Close {"path":"/second.c"}',
  ]);
  assert.equal(harness.ide.getSnapshot().document, null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.filter((frame) => frame.includes("SaveFinish")).length, 0);
});

test("disconnect preserves stale document, clears work, and disposal stays silent", async (t) => {
  const modules = await loadIdeModules(t);
  let resolveHash;
  const hash = new Promise((resolve) => {
    resolveHash = resolve;
  });
  const harness = createHarness(modules, t, { sha1Hex: () => hash });
  openWritable(harness);
  harness.gmcp.dispatch("Darkwind.IDE.OpenStart", {
    session: "incoming",
    path: "/incoming.c",
    content: "",
    chunks: 1,
    totalLength: 1,
  });
  assert.equal(harness.ide.save("a".repeat(262_145)), true);
  harness.reconnect("scheduled");
  const disconnected = harness.ide.getSnapshot();
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.document.stale, true);
  assert.equal(disconnected.transfer, null);
  assert.equal(disconnected.save.status, "error");
  assert.equal(harness.ide.save("no"), false);

  resolveHash("late-hash");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(harness.calls.some((frame) => frame.includes("SaveStart")), false);
  harness.reconnect("connected");
  assert.equal(harness.ide.getSnapshot().document.stale, true);
  assert.equal(harness.ide.save("still stale"), false);
  harness.gmcp.dispatch("Darkwind.IDE.Open", { path: "/fresh.c", content: "fresh" });
  assert.equal(harness.ide.getSnapshot().document.stale, false);
  assert.equal(harness.ide.save("fresh edit"), true);
  harness.gmcp.dispatch("Darkwind.IDE.SaveResult", { success: true });
  assert.equal(harness.ide.getSnapshot().save.status, "saved");

  const callCount = harness.calls.length;
  harness.scope.dispose();
  harness.gmcp.dispatch("Darkwind.IDE.Open", { path: "/late.c", content: "late" });
  assert.equal(harness.calls.length, callCount);
  assert.equal(harness.ide.close(), false);
  assert.equal(harness.diagnostics.snapshot().liveTimers, 0);
  assert.equal(harness.diagnostics.snapshot().liveListeners, 0);
  assert.equal(harness.diagnostics.snapshot().liveSubscriptions, 0);
});
