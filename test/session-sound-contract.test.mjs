import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadSoundContract(t) {
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
  return ssr.runner.import("/gmcp/contracts/sound.ts");
}

test("Darkwind.Sound normalizes valid tagged envelopes without retaining extras", async (t) => {
  const { DARKWIND_SOUND_CATEGORIES, normalizeDarkwindSound } = await loadSoundContract(t);

  assert.deepEqual(DARKWIND_SOUND_CATEGORIES, [
    "combat",
    "spell",
    "skill",
    "potion",
    "quest",
    "celebration",
    "discussion",
    "alert",
    "ambient",
    "ui",
  ]);
  for (const category of DARKWIND_SOUND_CATEGORIES) {
    assert.deepEqual(normalizeDarkwindSound({ type: "play", category, sound: " hit.mp3 " }), {
      type: "play",
      category,
      sound: "hit.mp3",
    });
  }
  assert.deepEqual(
    normalizeDarkwindSound({
      type: "play",
      category: "skill",
      sound: "bard/harp_C4",
      id: "optional-id",
      volume: 1,
      ignored: "extra",
    }),
    {
      type: "play",
      category: "skill",
      sound: "bard/harp_C4",
      id: "optional-id",
      volume: 1,
    },
  );
  assert.deepEqual(
    normalizeDarkwindSound({
      type: "loop",
      category: "ambient",
      sound: "rain",
      id: "room-ambience",
      volume: 0,
    }),
    {
      type: "loop",
      category: "ambient",
      sound: "rain",
      id: "room-ambience",
      volume: 0,
    },
  );
  assert.deepEqual(normalizeDarkwindSound({ type: "stop", category: "ambient" }), {
    type: "stop",
    category: "ambient",
  });
  assert.deepEqual(
    normalizeDarkwindSound({
      type: "stop",
      category: "ambient",
      sound: "   ",
      id: "room-ambience",
      volume: 0.5,
    }),
    {
      type: "stop",
      category: "ambient",
      sound: "",
      id: "room-ambience",
      volume: 0.5,
    },
  );
  assert.equal(
    normalizeDarkwindSound({ type: "play", category: "ui", sound: "a".repeat(120) })?.sound.length,
    120,
  );
});

test("Darkwind.Sound rejects malformed categories, tags, tokens, and volumes", async (t) => {
  const { normalizeDarkwindSound } = await loadSoundContract(t);
  const invalid = [
    null,
    [],
    { type: "unknown", category: "combat", sound: "hit" },
    { type: "play", category: "fishing", sound: "cast" },
    { type: "play", category: "unknown", sound: "hit" },
    { type: "play", category: "combat", sound: "" },
    { type: "play", category: "combat", sound: "   " },
    { type: "play", category: "combat", sound: "../secret" },
    { type: "play", category: "combat", sound: "audio/../secret" },
    { type: "play", category: "combat", sound: "/absolute" },
    { type: "play", category: "combat", sound: "hit?now" },
    { type: "play", category: "combat", sound: "a".repeat(121) },
    { type: "play", category: "combat", sound: "hit", id: "" },
    { type: "loop", category: "ambient", sound: "rain" },
    { type: "loop", category: "ambient", sound: "rain", id: "../loop" },
    { type: "stop", category: "ambient", sound: "rain" },
    { type: "stop", category: "ambient", id: "bad id" },
    { type: "play", category: "combat", sound: "hit", volume: Number.NaN },
    { type: "play", category: "combat", sound: "hit", volume: Number.POSITIVE_INFINITY },
    { type: "play", category: "combat", sound: "hit", volume: -0.01 },
    { type: "play", category: "combat", sound: "hit", volume: 1.01 },
    { type: "play", category: "combat", sound: "hit", volume: "0.5" },
  ];

  for (const payload of invalid) assert.equal(normalizeDarkwindSound(payload), null);
});
