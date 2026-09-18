import assert from "node:assert/strict";
import test from "node:test";

import { avatarMeterState } from "../public/js/core-information-panel-renderers.mjs";

test("Avatar meter state is deterministic across charge and active boundaries", () => {
  assert.deepEqual(avatarMeterState(null, 0), null);
  assert.deepEqual(
    avatarMeterState({ avatar_charge: 25, avatar_charge_max: 100, receivedAt: 1_000 }, 1_000),
    {
      mode: "charge",
      label: "Wrathful Avatar 25%",
      fillPct: 25,
      patronClass: "",
      full: false,
      ariaValueMax: 100,
      ariaValueNow: 25,
    },
  );

  const active = {
    avatar_charge: 0,
    avatar_charge_max: 100,
    avatar_charge_rate_pct: 100,
    avatar_active_remaining: 10,
    avatar_active_max: 20,
    divine_patron: "gaea",
    receivedAt: 1_000,
  };
  assert.deepEqual(avatarMeterState(active, 6_000), {
    mode: "active",
    label: "Wrathful Avatar ACTIVE 0:05",
    fillPct: 25,
    patronClass: "patron-gaea",
    full: false,
    ariaValueMax: null,
    ariaValueNow: null,
  });
  assert.equal(avatarMeterState(active, 11_000)?.ariaValueNow, 0);
  assert.equal(avatarMeterState(active, 13_000)?.ariaValueNow, 1);
  assert.equal(
    avatarMeterState({ avatar_charge_pct: 100, divine_patron: "set" }, 0)?.full,
    true,
  );
});
