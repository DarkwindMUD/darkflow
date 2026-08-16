import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadContracts(t) {
  const server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });
  t.after(async () => server.close());
  assert.ok(isRunnableDevEnvironment(server.environments.ssr));
  const [combat, tutorial] = await Promise.all([
    server.environments.ssr.runner.import("/gmcp/contracts/combat.ts"),
    server.environments.ssr.runner.import("/gmcp/contracts/tutorial.ts"),
  ]);
  return { ...combat, ...tutorial };
}

function actor(index) {
  return { id: `actor-${index}`, name: `Actor ${index}`, role: "threat" };
}

function combatState(overrides = {}) {
  return {
    epoch: "connection-7",
    encounter_id: "encounter-12",
    seq: 17,
    visual_enabled: 1,
    effective: true,
    active: true,
    current_actor_id: "self",
    current_target_id: "actor-2",
    actors: [
      { id: "self", name: "Acer", role: "self" },
      { id: "actor-2", name: "an ash drake", role: "target" },
    ],
    outcome: "",
    summary: "Combat begins against an ash drake.",
    ignored: { recursive: { mapping: true } },
    ...overrides,
  };
}

function combatEvent(seq, overrides = {}) {
  return {
    seq,
    kind: "attack",
    perspective: "outgoing",
    actor_id: "self",
    target_id: "actor-2",
    result: "hit",
    damage: 12,
    absorbed: 0,
    summary: "You hit an ash drake for 12 damage.",
    ...overrides,
  };
}

function tutorialState(overrides = {}) {
  return {
    epoch: "acer:1722109500",
    seq: 8,
    tutorial_version: 2,
    status: "active",
    awaiting_continue: 1,
    chapter: { id: "orientation", index: 1, total: 5, title: "Find your bearings" },
    step: {
      id: "look",
      index: 1,
      total: 21,
      title: "Look around",
      task: "Read the room description and exits.",
      hint: "Type look to see the room again.",
      help: "help look",
      example_command: "look",
      target: "command-input",
    },
    route: { place: "Erga", directions: ["north", "east"], text: "Follow the road." },
    actions: ["continue", "hint", "directions", "restart", "skip"],
    reason: "progress",
    hint_visible: 0,
    ignored: { recursive: { mapping: true } },
    ...overrides,
  };
}

test("Step 11 Combat and Tutorial contracts bound and clean every direction", async (t) => {
  const contracts = await loadContracts(t);

  await t.test("normalizes live Combat State, Events, and singular Event shapes", () => {
    const state = contracts.normalizeDarkwindCombatState(combatState());
    assert.deepEqual(state, {
      epoch: "connection-7",
      encounter_id: "encounter-12",
      seq: 17,
      visual_enabled: true,
      effective: true,
      active: true,
      current_actor_id: "self",
      current_target_id: "actor-2",
      actors: [
        { id: "self", name: "Acer", role: "self" },
        { id: "actor-2", name: "an ash drake", role: "target" },
      ],
      outcome: "",
      summary: "Combat begins against an ash drake.",
    });

    const batch = contracts.normalizeDarkwindCombatEvents({
      epoch: "connection-7",
      encounter_id: "encounter-12",
      first_seq: 18,
      last_seq: 18,
      events: [combatEvent(18)],
      overflow: { omitted: 0, hits: 0, damage: 0, ignored: true },
      ignored: true,
    });
    assert.equal(batch.events[0].damage, 12);
    assert.deepEqual(batch.overflow, { omitted: 0, hits: 0, damage: 0 });
    assert.deepEqual(
      contracts.normalizeDarkwindCombatEvent({
        epoch: "connection-7",
        encounter_id: "encounter-12",
        ...combatEvent(19),
        ignored: true,
      }),
      { epoch: "connection-7", encounter_id: "encounter-12", ...combatEvent(19), damage: 12 },
    );
    assert.equal(contracts.DARKWIND_COMBAT_RESYNC, undefined);
  });

  await t.test("caps Combat rows before ignoring malformed excess", () => {
    const state = contracts.normalizeDarkwindCombatState(
      combatState({ actors: [...Array.from({ length: 16 }, (_, index) => actor(index)), null] }),
    );
    assert.equal(state.actors.length, 16);
    assert.equal(
      contracts.normalizeDarkwindCombatState(
        combatState({ actors: [...Array.from({ length: 15 }, (_, index) => actor(index)), null] }),
      ),
      null,
    );

    const events = contracts.normalizeDarkwindCombatEvents({
      epoch: "connection-7",
      encounter_id: "encounter-12",
      first_seq: 1,
      last_seq: 12,
      events: [...Array.from({ length: 12 }, (_, index) => combatEvent(index + 1)), null],
      overflow: { omitted: 1, hits: 1, damage: 2 },
    });
    assert.equal(events.events.length, 12);
  });

  await t.test("rejects malformed, non-finite, and oversized retained Combat fields", () => {
    assert.equal(contracts.normalizeDarkwindCombatState(combatState({ seq: Infinity })), null);
    assert.equal(contracts.normalizeDarkwindCombatState(combatState({ seq: 1.9 })), null);
    assert.equal(contracts.normalizeDarkwindCombatState(combatState({ seq: "17" })), null);
    assert.equal(contracts.normalizeDarkwindCombatState(combatState({ effective: "true" })), null);
    assert.equal(
      contracts.normalizeDarkwindCombatState(combatState({ summary: "x".repeat(321) })),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindCombatEvent({
        epoch: "connection-7",
        encounter_id: "encounter-12",
        ...combatEvent(1, { damage: -1 }),
      }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindCombatEvents({
        epoch: "connection-7",
        encounter_id: "encounter-12",
        first_seq: 1,
        last_seq: 1,
        events: [combatEvent(1)],
        overflow: { omitted: 0, hits: 1.5, damage: 0 },
      }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindCombatEvents({
        epoch: "connection-7",
        encounter_id: "encounter-12",
        first_seq: 1,
        last_seq: 1,
        events: [combatEvent(1, { damage: NaN })],
        overflow: { omitted: 0, hits: 0, damage: 0 },
      }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindCombatEvent({
        epoch: "connection-7",
        encounter_id: "encounter-12",
        ...combatEvent(0),
      }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindCombatEvents({
        epoch: "connection-7",
        encounter_id: "encounter-12",
        first_seq: 2,
        last_seq: 1,
        events: [],
        overflow: { omitted: 0, hits: 0, damage: 0 },
      }),
      null,
    );
  });

  await t.test("normalizes Tutorial v2 State and caps route/actions before traversal", () => {
    const state = contracts.normalizeDarkwindTutorialState(
      tutorialState({
        route: {
          place: "Erga",
          directions: [...Array.from({ length: 24 }, () => "north"), null],
          text: "Follow the road.",
        },
        actions: ["continue", "directions", "hint", "restart", "skip", null],
      }),
    );
    assert.equal(state.tutorial_version, 2);
    assert.equal(state.seq, 8);
    assert.equal(state.awaiting_continue, true);
    assert.equal(state.hint_visible, false);
    assert.equal(state.route.directions.length, 24);
    assert.deepEqual(state.actions, ["continue", "directions", "hint", "restart", "skip"]);
    assert.equal(state.step.target, "command-input");

    const unknownTarget = contracts.normalizeDarkwindTutorialState(
      tutorialState({ step: { ...tutorialState().step, target: "body > input" } }),
    );
    assert.equal(unknownTarget.step.target, "");
    assert.equal(
      contracts.normalizeDarkwindTutorialState(
        tutorialState({ route: { place: "Erga", directions: [null], text: "Go." } }),
      ),
      null,
    );
  });

  await t.test("rejects malformed Tutorial fields and returns exact outbound payloads", () => {
    assert.equal(contracts.normalizeDarkwindTutorialState(tutorialState({ seq: NaN })), null);
    assert.equal(
      contracts.normalizeDarkwindTutorialState(tutorialState({ tutorial_version: 2.9 })),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialState(
        tutorialState({ chapter: { ...tutorialState().chapter, index: -1 } }),
      ),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialState(
        tutorialState({ step: { ...tutorialState().step, total: 4.5 } }),
      ),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialState(tutorialState({ awaiting_continue: "true" })),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialState(
        tutorialState({ step: { ...tutorialState().step, task: "x".repeat(601) } }),
      ),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialState(tutorialState({ actions: ["made-up"] })),
      null,
    );
    assert.deepEqual(
      contracts.normalizeDarkwindTutorialControl({
        visible: 0,
        reason: "screenreader",
        ignored: true,
      }),
      { visible: false, reason: "screenreader" },
    );
    assert.deepEqual(
      contracts.normalizeDarkwindTutorialAction({
        action: "hint",
        epoch: "acer:1722109500",
        seq: 8,
        step_id: "look",
        ignored: true,
      }),
      { action: "hint", epoch: "acer:1722109500", seq: 8, step_id: "look" },
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialAction({
        action: "hint",
        epoch: "acer:1722109500",
        seq: "8",
        step_id: "look",
      }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialAction({
        action: "made-up",
        epoch: "acer:1722109500",
        seq: 8,
        step_id: "look",
      }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialAction({
        action: "HINT",
        epoch: "acer:1722109500",
        seq: 8,
        step_id: "look",
      }),
      null,
    );
    assert.deepEqual(
      contracts.normalizeDarkwindTutorialResync({
        epoch: "",
        seq: 0,
        reason: "reconnect",
        ignored: true,
      }),
      { epoch: "", seq: 0, reason: "reconnect" },
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialResync({ epoch: "", seq: 0, reason: "made-up" }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialResync({
        epoch: "",
        seq: "0",
        reason: "reconnect",
      }),
      null,
    );
    assert.equal(
      contracts.normalizeDarkwindTutorialResync({
        epoch: "",
        seq: 0.5,
        reason: "reconnect",
      }),
      null,
    );
  });
});
