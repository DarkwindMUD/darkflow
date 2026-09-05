import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(t) {
  globalThis.document ??= {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.localStorage ??= {
    getItem: () => null,
    setItem() {},
  };
  const server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });
  t.after(() => server.close());
  const ssr = server.environments.ssr;
  assert.ok(isRunnableDevEnvironment(ssr));
  return ssr.runner.import("/runtime/terminal-processing.ts");
}

function createHarness(createTerminalProcessing) {
  const textListeners = new Set();
  const connectionListeners = new Set();
  const outputLines = [];
  const sent = [];
  const snapshot = {
    characterProfileId: "character-test",
    aliases: [],
    triggers: [],
    highlights: [],
    functions: [],
    keyMappings: [],
    timers: [],
  };
  const automation = {
    getAutomationVariables: () => ({}),
    setVariable() {},
    scheduleWait: () => Promise.resolve(),
    scheduleTimer() {},
    clearTimer() {},
    getTimerRuntimeState: () => null,
    reconcileTimers() {},
  };
  let connectionState = "connected";
  const session = {
    characterProfileId: snapshot.characterProfileId,
    terminal: {
      automation,
      sendCommand(text) {
        sent.push(text);
        return true;
      },
      subscribeConfiguration(listener) {
        listener(snapshot);
        return () => {};
      },
    },
    notifications: {
      recordOutputLine: (line) => outputLines.push(line),
      resetOutputLines() {},
    },
    audio: { playLocal: () => true },
    getEffectiveConfiguration: () => snapshot,
    getConnectionSnapshot: () => ({ state: connectionState }),
    subscribeConnection(listener) {
      connectionListeners.add(listener);
      listener({ state: connectionState });
      return () => connectionListeners.delete(listener);
    },
  };
  const processing = createTerminalProcessing(session, (listener) => {
    textListeners.add(listener);
    return () => textListeners.delete(listener);
  });

  return {
    processing,
    outputLines,
    sent,
    deliver(text) {
      for (const listener of [...textListeners]) listener(text);
    },
    setConnection(state) {
      connectionState = state;
      for (const listener of [...connectionListeners]) listener({ state });
    },
    get listenerCount() {
      return textListeners.size;
    },
  };
}

test("processing survives zero views and hydrates remounts without replay", async (t) => {
  const { createTerminalProcessing } = await loadModule(t);
  const harness = createHarness(createTerminalProcessing);

  harness.deliver("complete\nprompt");
  assert.deepEqual(harness.outputLines, [{ id: 1, text: "complete" }]);

  const first = [];
  const unsubscribe = harness.processing.subscribe((event) => first.push(event));
  assert.equal(first.length, 1);
  assert.equal(first[0].type, "reset");
  assert.deepEqual(first[0].records.map(({ text }) => text), ["complete", ""]);
  unsubscribe();

  harness.deliver(" finished\n");
  const remount = [];
  harness.processing.subscribe((event) => remount.push(event));
  assert.equal(remount.length, 1);
  assert.equal(remount[0].records.at(-1).text, "prompt finished");
  assert.deepEqual(harness.outputLines.map(({ text }) => text), ["complete", "prompt finished"]);
});

test("reconnect resets partial stream only and disposal stops delivery", async (t) => {
  const { createTerminalProcessing } = await loadModule(t);
  const harness = createHarness(createTerminalProcessing);

  harness.deliver("kept\n\x1b[31mpartial");
  harness.setConnection("disconnected");
  harness.setConnection("connected");
  harness.deliver("new\n");
  const events = [];
  harness.processing.subscribe((event) => events.push(event));
  assert.deepEqual(events[0].records.map(({ id, text }) => ({ id, text })), [
    { id: 1, text: "kept" },
    { id: 3, text: "new" },
  ]);
  assert.equal(events[0].records[1].fragments[0].style.fg, null);

  harness.processing.dispose();
  assert.equal(harness.listenerCount, 0);
  harness.deliver("late\n");
  assert.deepEqual(harness.outputLines.map(({ text }) => text), ["kept", "new"]);
});
