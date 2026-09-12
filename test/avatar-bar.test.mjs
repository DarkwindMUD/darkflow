import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(t) {
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
  return ssr.runner.import("/workspace/avatar-bar.ts");
}

test("the avatar bar predicts charge from the last sync, counts an active window down, and colours by patron", async (t) => {
  const m = await loadModule(t);
  const t0 = 1_000_000;

  const charging = m.avatarBarReading({ hp: 1, maxhp: 1, avatar_charge: 25, avatar_charge_max: 100, avatar_charge_rate_pct: 200, divine_patron: "mitra", receivedAt: t0 }, t0);
  assert.deepEqual(
    [charging.mode, charging.known, charging.percent, charging.text, charging.patron, charging.full, charging.ticking],
    ["charging", true, 25, "25%", "mitra", false, true],
  );
  assert.equal(charging.background, "linear-gradient(90deg, #8f6b18, #f2cc60)", "resting mitra gold");
  const later = m.avatarBarReading({ avatar_charge: 25, avatar_charge_max: 100, avatar_charge_rate_pct: 200, receivedAt: t0 }, t0 + 10_000);
  assert.equal(later.percent, 35, "ten seconds at 200% gains ten points (one per two seconds at 100%)");
  assert.equal(later.patron, "", "no patron reads as the default");
  assert.equal(later.background, "linear-gradient(90deg, #7a1822, #f85149)");
  const defaultRate = m.avatarBarReading({ avatar_charge: 10, avatar_charge_max: 100, receivedAt: t0 }, t0 + 20_000);
  assert.equal(defaultRate.percent, 20, "a missing rate counts as 100%");

  const full = m.avatarBarReading({ avatar_charge: 100, avatar_charge_max: 100, divine_patron: "SET", receivedAt: t0 }, t0);
  assert.deepEqual([full.full, full.text, full.percent, full.ticking, full.patron], [true, "READY", 100, false, "set"], "full stops ticking and says so");
  assert.equal(full.background, "linear-gradient(90deg, #b083e6, #f0dcff)", "lit colours when full");
  const overfull = m.avatarBarReading({ avatar_charge: 90, avatar_charge_max: 100, receivedAt: t0 }, t0 + 60_000);
  assert.equal(overfull.percent, 100, "prediction clamps at the maximum");

  const active = m.avatarBarReading({ avatar_charge: 0, avatar_charge_max: 100, avatar_active_remaining: 61, avatar_active_max: 120, divine_patron: "gaea", receivedAt: t0 }, t0);
  assert.deepEqual([active.mode, active.text, Math.round(active.percent), active.activeSeconds, active.ticking], ["active", "ACTIVE 1:01", 51, 61, true]);
  assert.equal(active.background, "linear-gradient(90deg, #56d364, #aff5b4)", "lit gaea while active");
  const activeLater = m.avatarBarReading({ avatar_active_remaining: 61, avatar_active_max: 120, receivedAt: t0 }, t0 + 30_000);
  assert.deepEqual([activeLater.text, activeLater.activeSeconds], ["ACTIVE 0:31", 31]);
  const expired = m.avatarBarReading({ avatar_charge: 5, avatar_charge_max: 100, avatar_active_remaining: 10, receivedAt: t0 }, t0 + 15_000);
  assert.equal(expired.mode, "charging", "an elapsed window falls back to the charge");
  const legacyActive = m.avatarBarReading({ avatar_active: 30, receivedAt: t0 }, t0);
  assert.deepEqual([legacyActive.mode, legacyActive.percent], ["active", 100], "the legacy active field with no max fills the bar");

  const none = m.avatarBarReading({ hp: 50, maxhp: 100 }, t0);
  assert.deepEqual([none.mode, none.known, none.text, none.percent, none.ticking], ["none", false, "--", 0, false]);
  assert.equal(m.avatarBarReading(null, t0).known, false);
  assert.equal(m.avatarBarReading({ avatar_charge: 10, avatar_charge_max: 0 }, t0).known, false, "a zero maximum is no charge");
  assert.equal(m.avatarBarReading({ avatar_charge: 10, avatar_charge_max: 100 }, t0 + 5000).percent, 10, "without a receipt stamp nothing is predicted");
  assert.equal(m.formatActive(125), "2:05");
  assert.equal(m.AVATAR_BAR_PANEL_ID, "avatarBar");
});
