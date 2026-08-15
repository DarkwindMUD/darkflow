import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const PUBLIC_JS = path.resolve("public/js");
const STEP_6_OWNERS = Object.freeze({
  "client/runtime/connection-health.ts": ["Core.Ping", "Darkwind.Lag.Status"],
  "client/runtime/information.ts": [
    "Char.Vitals",
    "Char.Status",
    "Char.StatusVars",
    "Char.Stats",
    "Char.RealStats",
    "Char.Worth",
    "Char.Items.List",
    "Char.Items.Add",
    "Char.Items.Remove",
    "Char.Items.Update",
    "Char.Defences.List",
    "Char.Defences.Add",
    "Char.Defences.Remove",
    "Group",
    "Darkwind.Char.Avatar",
    "Darkwind.Divine",
    "Darkwind.Sky",
    "Darkwind.GuildVitals",
    "Darkwind.XPMon",
    "Darkwind.Quests.List",
    "Darkwind.Quests.Active",
    "Darkwind.Quests.Update",
    "Darkwind.Quests.Complete",
    "Darkwind.Achievements.List",
    "Darkwind.Achievements.Update",
    "Darkwind.Cyberware.List",
    "Darkwind.Cyberware.Details",
    "Darkwind.Cyberware.Image",
  ],
});
const EXPECTED_REGISTRATIONS = Object.freeze({
  "announcements-manager.js": 4,
  "app.js": 2,
  "broadcast-manager.js": 1,
  "combat-visual-manager.js": 3,
  "completion.js": 1,
  "fishing-manager.js": 7,
  "giphy-manager.js": 1,
  "ide-manager.js": 5,
  "lag-monitor.js": 2,
  "linux-rescue-manager.js": 1,
  "login-theme-manager.js": 3,
  "map-speedwalk.js": 2,
  "mention-picker.js": 2,
  "notification-manager.js": 3,
  "panel-manager.js": 47,
  "room-playlist-manager.js": 3,
  "snoop-manager.js": 4,
  "sound-panel.js": 4,
  "street-samurai-dashboard-manager.js": 1,
  "tutorial-manager.js": 3,
  "visual-effects-manager.js": 7,
  "window-manager.js": 3,
});

const REGISTRATION = /\b(?:gmcp|scopedGmcp|appGmcp)\.on\(/g;

test("all 109 legacy GMCP registrations declare session lifecycle ownership", async () => {
  const files = (await readdir(PUBLIC_JS)).filter((file) => file.endsWith(".js"));
  const sources = new Map(
    await Promise.all(
      files.map(async (file) => [file, await readFile(path.join(PUBLIC_JS, file), "utf8")]),
    ),
  );
  const discovered = files
    .filter((file) => (sources.get(file).match(REGISTRATION) || []).length > 0)
    .sort();

  assert.deepEqual(discovered, Object.keys(EXPECTED_REGISTRATIONS).sort());

  let total = 0;
  for (const [file, expected] of Object.entries(EXPECTED_REGISTRATIONS)) {
    const source = sources.get(file);
    const actual = (source.match(REGISTRATION) || []).length;
    assert.equal(actual, expected, `${file} registration count`);
    assert.match(source, /session-compat\/controllers\.js/, `${file} lifecycle import`);
    total += actual;
  }
  assert.equal(total, 109);
});

test("Step 6 families have Phase 2 owners while legacy rollback stays registered", async () => {
  const panelManager = await readFile(path.join(PUBLIC_JS, "panel-manager.js"), "utf8");
  const lagMonitor = await readFile(path.join(PUBLIC_JS, "lag-monitor.js"), "utf8");

  for (const [owner, packages] of Object.entries(STEP_6_OWNERS)) {
    const source = await readFile(path.resolve(owner), "utf8");
    const legacy = owner.endsWith("connection-health.ts") ? lagMonitor : panelManager;
    for (const packageName of packages) {
      assert.match(source, new RegExp(`["']${packageName.replaceAll(".", "\\.")}["']`));
      assert.match(legacy, new RegExp(`\\.on\\(["']${packageName.replaceAll(".", "\\.")}["']`));
    }
  }
});
