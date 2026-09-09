import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
let createTerminalAutomation;
let server;

test.before(async () => {
  const storage = new Map();
  globalThis.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };

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
  ({ createTerminalAutomation } = await ssr.runner.import("/terminal/automation.ts"));
});

test.after(async () => {
  await server?.close();
  globalThis.document = originalDocument;
  globalThis.localStorage = originalLocalStorage;
});

const entry = (definition) => ({ definition, source: { kind: "local" } });
const soundStep = (category, sound, volume = 1) => ({
  type: "play_sound",
  category,
  sound,
  volume,
});

function createHarness({
  aliases = [],
  triggers = [],
  functions = [],
  keyMappings = [],
  timers = [],
  play = true,
  scheduleWait = () => Promise.resolve(),
}) {
  const snapshot = {
    characterProfileId: "character-automation-audio",
    aliases: aliases.map(entry),
    triggers: triggers.map(entry),
    highlights: [],
    functions: functions.map(entry),
    keyMappings: keyMappings.map(entry),
    timers: timers.map(entry),
  };
  const played = [];
  const sent = [];
  const messages = [];
  const timerCallbacks = new Map();
  const runtime = {
    getAutomationVariables: () => ({}),
    setVariable() {},
    scheduleWait,
    scheduleTimer(id, _delayMs, callback) {
      timerCallbacks.set(id, callback);
    },
    clearTimer(id) {
      timerCallbacks.delete(id);
    },
    getTimerRuntimeState: (id) => (timerCallbacks.has(id) ? { running: true } : null),
    reconcileTimers(definitions, startTimer) {
      for (const timer of definitions) {
        if (timer.enabled !== false && timer.autoStart) startTimer(timer);
      }
    },
  };
  const session = {
    characterProfileId: snapshot.characterProfileId,
    audio: {
      playLocal(category, sound, volume) {
        played.push({ category, sound, volume });
        return typeof play === "function" ? play(category, sound, volume) : play;
      },
    },
    terminal: {
      automation: runtime,
      sendCommand(command) {
        sent.push(command);
        return true;
      },
      subscribeConfiguration(listener) {
        listener(snapshot);
        return () => {};
      },
    },
    getEffectiveConfiguration: () => snapshot,
  };

  return {
    automation: createTerminalAutomation({
      session,
      appendSystemMessage: (message) => messages.push(message),
    }),
    messages,
    played,
    sent,
    timerCallbacks,
  };
}

test("legacy symbolic key mappings remain compatible", () => {
  const harness = createHarness({
    keyMappings: [
      {
        id: "key-percent",
        enabled: true,
        code: "%",
        label: "%",
        legacyKey: "%",
        command: "percent-command",
      },
    ],
  });

  assert.equal(
    harness.automation.getMappedCommand({
      defaultPrevented: false,
      repeat: false,
      code: "Digit5",
      key: "%",
    }),
    "percent-command",
  );
  assert.equal(
    harness.automation.getMappedCommand({
      defaultPrevented: false,
      repeat: false,
      code: "Digit5",
      key: "5",
    }),
    null,
  );
});

test("known sounds use the public local audio capability across automation contexts", () => {
  const harness = createHarness({
    aliases: [
      {
        id: "alias-sound",
        enabled: true,
        trigger: "sound",
        description: "",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [soundStep("alert", "warning", 0.5)],
      },
      {
        id: "alias-function-sound",
        enabled: true,
        trigger: "function-sound",
        description: "",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [
          {
            type: "call_function",
            target: "Chime",
            targetId: "function-chime",
            template: "",
          },
        ],
      },
    ],
    triggers: [
      {
        id: "trigger-sound",
        enabled: true,
        pattern: "You are bleeding",
        description: "",
        group: "",
        isRegex: false,
        ignoreCase: false,
        gag: false,
        steps: [soundStep("alert", "incoming", 0.4)],
      },
    ],
    functions: [
      {
        id: "function-chime",
        enabled: true,
        name: "Chime",
        description: "",
        group: "",
        script: "play_sound ui/click 0.25",
      },
    ],
  });

  assert.equal(harness.automation.sendCommand("sound"), true);
  assert.equal(harness.automation.sendCommand("function-sound"), true);
  harness.automation.processLine("You are bleeding", [
    { text: "You are bleeding", style: {} },
  ]);

  assert.deepEqual(harness.played, [
    { category: "alert", sound: "warning", volume: 0.5 },
    { category: "ui", sound: "click", volume: 0.25 },
    { category: "alert", sound: "incoming", volume: 0.4 },
  ]);
  assert.deepEqual(harness.sent, []);
  assert.deepEqual(harness.messages, []);
});

test("unknown and rejected sounds warn without sending commands", () => {
  const unknown = createHarness({
    aliases: [
      {
        id: "unknown-sound",
        enabled: true,
        trigger: "unknown",
        description: "",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [soundStep("alert", "missing")],
      },
    ],
  });
  assert.equal(unknown.automation.sendCommand("unknown"), true);
  assert.deepEqual(unknown.played, []);
  assert.deepEqual(unknown.sent, []);
  assert.deepEqual(unknown.messages, ['Alias: Sound "alert/missing" is not defined.']);

  const rejected = createHarness({
    play: false,
    aliases: [
      {
        id: "rejected-sound",
        enabled: true,
        trigger: "rejected",
        description: "",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [soundStep("alert", "warning", 0.75)],
      },
    ],
  });
  assert.equal(rejected.automation.sendCommand("rejected"), true);
  assert.deepEqual(rejected.played, [{ category: "alert", sound: "warning", volume: 0.75 }]);
  assert.deepEqual(rejected.sent, []);
  assert.deepEqual(rejected.messages, ['Alias: Sound "alert/warning" is not defined.']);
});

test("disposed timer callbacks cannot play late sounds", () => {
  const harness = createHarness({
    timers: [
      {
        id: "timer-chime",
        enabled: true,
        name: "Chime",
        description: "",
        group: "",
        durationMs: 1000,
        recurring: false,
        autoStart: true,
        steps: [soundStep("ui", "click", 0.25)],
      },
    ],
  });
  const callback = harness.timerCallbacks.get("timer-chime");
  assert.equal(typeof callback, "function");

  harness.automation.dispose();
  callback();

  assert.deepEqual(harness.played, []);
  assert.deepEqual(harness.sent, []);
});

test("disposed automation ignores sounds resumed after a deferred wait", async () => {
  let resolveWait;
  const wait = new Promise((resolve) => {
    resolveWait = resolve;
  });
  const harness = createHarness({
    scheduleWait: () => wait,
    aliases: [
      {
        id: "deferred-sound",
        enabled: true,
        trigger: "deferred",
        description: "",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [{ type: "wait", seconds: 1 }, soundStep("alert", "warning", 0.5)],
      },
    ],
  });

  assert.equal(harness.automation.sendCommand("deferred"), true);
  harness.automation.dispose();
  resolveWait();
  await wait;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.played, []);
  assert.deepEqual(harness.sent, []);
});
