# Phase 2 Step 6 Implementation Plan

## Planning selection

- Mode: detailed implementation plan
- Complexity: 5/10 — the work crosses the public session, GMCP validation,
  retained panel presentation, Dockview hosting, and diagnostics, but it stays on
  the non-production `/phase2/` path and has legacy rollback owners.
- Hard triggers: none; the panel families are sequential slices of one
  one-session migration outcome, not independently deployed products
- Current planning horizon: Step 6 only — core information panels, connection
  health, RFC 2549 debug, their typed ingress, and replacement evidence
- Evidence horizon: the frozen Phase 1 GMCP policy, deferred-owner inventory,
  Step 1 parity rows, current public `Session`, legacy panel reducers/renderers,
  lag controller, workspace registry, and browser fixtures
- Adversarial review: focused — public-boundary leakage, GMCP direction and
  validation, duplicated Step 8 ownership, reconnect reset, disposal, and
  rollback

## Planning status

Planning only. This document does not authorize runtime implementation. The
checkout was clean on `story/multi-connections-phase2` at `50b28b4` when this
plan was written.

Steps 2-3 are locally complete, the current workspace accepts Svelte renderers
behind a vendor-neutral registry, and `/phase2/` still mounts a placeholder next
to the real terminal (`client/workspace/WorkspaceHost.svelte:17-29,90-107`). The
public `Session` exposes connection, terminal, and configuration capabilities,
but no GMCP bus or panel data (`client/runtime/session.ts:37-66`).

Phase 1 intentionally leaves compatibility delivery advisory: invalid modeled
payloads are diagnosed and still reach legacy handlers. A Phase 2 port may
enforce validated-only delivery only after representative fixtures cover its
consumer contract
(`docs/plans/phase-1/multi-connection-ui-phase-1-step-16-decision.md:22-24,44-51`).

## Goal

Make the named core information and diagnostics panels real one-session
`/phase2/` workspace surfaces without importing legacy layout, GMCP, socket,
resource-scope, or compatibility handles into Svelte.

Success means one session-owned information read model hydrates and incrementally
updates the character, vitals, guild, XP, group, inventory, quest, achievement,
and cyberware panels; one connection-health owner drives lag and RFC 2549
diagnostics; malformed owned frames cannot mutate the new UI; and reconnect,
mobile, keyboard, theme, and disposal evidence replaces all three `P2-6-*` rows.

## Must-haves

- [MH1] Add only the public capabilities the real Step 6 ports require —
  acceptance: Svelte receives `Session.information` and
  `Session.connectionHealth`; it does not import `SessionFacadeHandles`,
  `SessionGmcpBus`, transport, event bus, resource scope, raw sockets, legacy
  state, or controller facades.
- [MH2] Preserve Phase 1 compatibility semantics while making the new owners
  validated-only — acceptance: a malformed owned payload is still diagnosed and
  available to the legacy compatibility path, but it does not change a Step 6
  snapshot or render; the next valid frame still updates normally.
- [MH3] Type every newly owned unmodeled family from representative wire values —
  acceptance: `Group`, `Darkwind.Char.Avatar`, `Darkwind.Divine`, `Darkwind.Sky`,
  `Darkwind.GuildVitals`, `Darkwind.XPMon`, `Darkwind.Quests.*`,
  `Darkwind.Achievements.*`, `Darkwind.Cyberware.*`, `Core.Ping`, and
  `Darkwind.Lag.Status` have positive and malformed fixtures registered at
  ingress. Existing modeled `Char.*` contracts remain the source for status,
  stats, worth, inventory, and defences
  (`client/gmcp/contracts/validators.ts:49-61,92-109,146-212`).
- [MH4] Preserve initial hydration and incremental semantics — acceptance: full
  frames replace the relevant collection or snapshot; deltas merge by their
  existing stable keys; disconnect/reconnect clears stale live data before the
  new session hydrates; one session never observes another session's frames.
- [MH5] Preserve the useful existing presentation rather than rewrite it —
  acceptance: the Step 6 renderer functions and styles are reused through a
  small DOM-targeted shared module, legacy `panel-renderers.js` delegates to the
  same functions, and the new module imports no GMCP singleton, legacy state,
  layout manager, settings manager, or compatibility facade.
- [MH6] Add concrete workspace panels without creating a generic panel framework
  — acceptance: a closed union of Step 6 panel IDs maps to the existing workspace
  renderer; desktop controls and the mobile sheet can open, activate, and close
  each panel; saved Dockview layouts restore; the terminal island keeps its
  identity and focus.
- [MH7] Synchronize server panel visibility from real workspace state —
  acceptance: open/close/layout callbacks derive the known Step 6 panel set using
  `Workspace.hasPanel()` and send the existing subscription payload; reconnect
  resends the current set once without a second visibility store or timer. The
  legacy behavior currently sends visible panel flags after character data
  (`public/js/panel-manager.js:2522-2531`).
- [MH8] Keep interactions direction-correct — acceptance: XP Monitor actions use
  `Session.terminal.sendCommand`; cyberware detail activation uses one typed
  `Darkwind.Cyberware.Details` request helper; inbound Details/Image frames only
  update the requested accessible dialog; no inbound-only contract is reused as
  an unchecked outbound object (`public/js/panel-renderers.js:1610-1675`).
- [MH9] Port lag monitoring through a session-owned controller — acceptance:
  `Core.Ping` correlation, `/ping`, server drift polling, local drift, full check,
  visibility pause/resume, reconnect gaps, and the existing `lag-core.mjs`
  diagnosis remain intact without document events or legacy globals
  (`public/js/lag-monitor.js:1-12,58-140,168-213,235-340`).
- [MH10] Keep RFC 2549 a debug visualization, not transport policy — acceptance:
  URL/local-setting enablement, health events, route, bytes, QoS override, RED
  marks, keyboard-close behavior, and cleanup work from public snapshots; the
  panel never mutates the transport
  (`public/js/rfc2549-debug.js:24-39,68-105,120-183,190-246`).
- [MH11] Meet the visible-port acceptance boundary — acceptance: representative
  panels prove loading/empty/error states, accessible names and controls, both
  a dark and a light theme, desktop Dockview, 390x844 mobile sheet, reconnect,
  repeated open/close, and session disposal in development and built web.
- [MH12] Freeze only the proven seam for Steps 7-11 — acceptance: the completion
  record names the public read-model/subscription rule, validated-only ingress
  rule, renderer/action boundary, and workspace registration pattern; it does
  not add registries, base classes, factories, or APIs for deferred panels.

## Out of scope

- Room image, room/map world state, maps, speedwalk, and room playlist — their
  dedicated `P2-8-*` rows own Step 8
  (`docs/plans/phase-2/multi-connection-ui-phase-2-step-1-parity-matrix.md:169-178`).
  The broad “room media” phrase in `P2-6-character-group-vitals` is not a second
  owner.
- Enemy/combat presentation, tutorial, visual effects, Street Samurai, and
  specialty surfaces — Step 11 owns them.
- Chat, mentions, notifications, sound, and login media — Step 10 owns them.
- Server windows, snoop, announcements, Giphy, broadcast, Linux rescue, and
  fishing — Step 7 owns them; Step 9 owns IDE.
- Replacing Dockview, changing workspace persistence schema, converting legacy
  `darkwind-panel-state`, deleting the placeholder from old saved layouts, or
  deleting legacy panel sources/adapters.
- A reusable panel SDK, general GMCP observable/store, universal renderer
  registry, cross-session cache, or new dependency.
- Packaged Electron, Docker, hosted CI, default-root cutover, release
  certification, or legacy deletion — Step 12 owns those gates.

## Assumptions

- [The dedicated `P2-8-room-image` row is authoritative over the stray Step 6
  “room media” phrase] — if false: Step 6 must add room transition/media state,
  image loading, and another visible panel before its completion gate.
- [The retained renderer markup is parity behavior worth reusing] — if false:
  the affected visual slice needs explicit product acceptance and should not be
  silently redesigned during the controller move.
- [Step 6 can extend the existing `darkwind-client-settings` object with
  `lagMonitorEnabled` while preserving unknown fields] — if false: monitoring
  remains enabled for `/phase2/` and the setting stays legacy-owned until its
  named owner is decided.
- [The transport health snapshot can own byte counters needed by RFC 2549] — if
  false: expose counters through the connection-health snapshot, not legacy
  state or a raw socket.
- [The existing transport fixture can send arbitrary GMCP frames after a small
  fixture extension] — if false: add a bounded session-runtime browser test hook
  used only in tests; do not expose the internal bus to production Svelte.

## Risks

- The legacy panel manager mixes data reduction, layout, media, timers, and
  rendering in one 3,900-line module — mitigation: move only named Step 6 reducer
  and renderer behavior, and leave every deferred handler in place
  (`public/js/panel-manager.js:128-185,3460-3912`).
- Adding validators globally could accidentally suppress legacy handlers —
  mitigation: keep `SessionGmcpBus.dispatch()` advisory and apply
  validated-only filtering in the new information/connection-health consumers.
- Full payloads and deltas can be confused, leaving stale or duplicated rows —
  mitigation: fixtures cover full replacement plus add/update/remove for
  inventory, quests, achievements, defences, and cyberware.
- A single “information panel” component could become the forbidden framework —
  mitigation: keep a closed Step 6 ID union and explicit renderer/action table;
  later steps copy the proven seam only when their detailed plans require it.
- Hidden panels could retain subscriptions or send stale visibility — mitigation:
  derive visibility from the workspace after every layout callback and on
  reconnect; the session capability owns the last sent subscription snapshot.
- Diagnostics can leak timers, observers, fetches, or late updates — mitigation:
  own them in the existing session scope, abort in-flight fetches, and assert
  zero post-disposal updates/resources.

## Proven implementation boundary

### Public session capabilities

`Session.information` is a concrete one-session read model:

- `getSnapshot()` returns a deeply read-only snapshot with named fields for
  avatar, status/status variables, vitals, guild vitals, XP monitor, divine
  omens, sky, current/base stats, defences, worth, group, inventory, quests,
  achievements, cyberware, and the active cyberware detail.
- `subscribe(listener)` emits the current snapshot immediately, then validated
  updates; unsubscription and session disposal are deterministic.
- `setVisiblePanels(ids)` accepts only the closed Step 6 panel-ID union and sends
  the existing `Darkwind.Client.Subscriptions` panel flags.
- `requestCyberwareDetails(id)` validates a non-empty ID and sends the one typed
  request.

`Session.connectionHealth` is separate because it owns active probes, not panel
data:

- `getSnapshot()` and `subscribe(listener)` expose the retained lag diagnosis and
  transport debug inputs.
- `runFullCheck()` starts the existing bounded full check and returns `false` if
  one is already running or the session is disposed.

Neither capability exposes the GMCP bus, send-any-package, transport, fetch
controller, timer handle, mutable reducer state, or layout types.

### Owned panel IDs and GMCP families

| Slice              | Panel IDs                                                                                                | Inbound families                                                                                                                                                                                                               | Outbound behavior                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Character summary  | `avatar`, `status`, `vitals`, `guildVitals`, `xpmon`, `omens`, `sky`, `stats`, `buffs`, `worth`, `group` | `Char.Vitals`, `Char.Status`, `Char.StatusVars`, `Char.Stats`, `Char.RealStats`, `Char.Worth`, `Char.Defences.*`, `Group`, `Darkwind.Char.Avatar`, `Darkwind.Divine`, `Darkwind.Sky`, `Darkwind.GuildVitals`, `Darkwind.XPMon` | existing terminal commands for XP actions                       |
| Inventory/progress | `inventory`, `quests`, `achievements`, `cyberware`                                                       | `Char.Items.*`, `Darkwind.Quests.*`, `Darkwind.Achievements.*`, `Darkwind.Cyberware.List/Details/Image`                                                                                                                        | typed `Darkwind.Cyberware.Details { id }` request               |
| Diagnostics        | `connection-health`, `rfc2549`                                                                           | `Core.Ping`, `Darkwind.Lag.Status`, connection/transport snapshots                                                                                                                                                             | `Core.Ping`, `Darkwind.Lag.Get`, HTTP probes, full-check action |

`Char.Enemy` remains available to legacy consumers until Step 11.

## Green PR sequence

Each Green PR is independently reviewable but remains on the non-default Phase 2
path. Do not begin the next slice until the current focused checks pass.

### Green PR 1 — Prove the information boundary with character status

**Files:** `client/gmcp/contracts/information.ts`,
`client/gmcp/contracts/validators.ts`, `client/runtime/information.ts`,
`client/runtime/session-factory.ts`, `client/runtime/session.ts`,
`test/session-information.test.mjs`, `test/session-gmcp-darkwind.test.mjs`

**Intent:** Add representative contracts for `Group`, avatar, divine omens, sky,
guild vitals, and XP monitor, then create `Session.information` through the first
real reducer slice: status, vitals, stats, worth, defences, group, avatar, omens,
sky, guild vitals, and XP monitor. Subscribe directly to the session bus inside
construction, validate before reducer entry, emit frozen snapshots, reset on
disconnect, and dispose through the existing scope. Keep compatibility dispatch
advisory. This slice also owns panel-visibility subscription state; deferred
reducers and actions are added only with their consuming Green PR.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/session-information.test.mjs test/session-gmcp-bus.test.mjs test/session-gmcp-darkwind.test.mjs test/session-runtime.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
```

**Done when:** valid full/delta fixtures update one frozen session snapshot;
malformed frames do not; compatibility handlers still receive them; reconnect
clears/resubscribes; two sessions and disposal are isolated; no internal handle
appears on `Session`.

### Green PR 2 — Mount character information panels

**Files:** `public/js/core-information-panel-renderers.mjs`,
`public/js/panel-renderers.js`, `client/workspace/InformationPanel.svelte`,
`client/workspace/WorkspaceHost.svelte`, `client/phase2/index.html`,
`e2e/phase2-information-panels.spec.ts`, focused existing renderer tests

**Intent:** Move, do not rewrite, the named character renderer functions and
their required pure helpers into one DOM-targeted module. Inject XP command and
image/dialog actions rather than importing GMCP or legacy state. Keep the legacy
renderer table delegating to the same functions. Register the closed Step 6
panel kinds in the existing workspace, add desktop/mobile launcher controls, and
derive visible panels via `hasPanel()` after layout changes.

Reuse `/css/panels.css` from the Phase 2 HTML rather than cloning its panel
styles. Keep `PlaceholderPanel` registered for saved-layout compatibility, but
do not treat it as Step 6 evidence.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/guild-vitals-panel-renderer.test.mjs test/xpmon-panel-renderer.test.mjs test/sky-panel-renderer.test.mjs test/session-information.test.mjs test/workspace-persistence.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-information-panels.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** character panels hydrate from wire fixtures, show loading/empty
states, render the avatar charge/active meter and clock-driven sky state, restore
through Dockview, work in the mobile sheet and by keyboard, send XP commands
through the terminal capability, retain terminal identity/focus, and leave no
Svelte roots/subscriptions or panel timers after close or session disposal.

### Green PR 3 — Add inventory, quest, achievement, and cyberware panels

**Files:** `client/gmcp/contracts/information.ts`,
`client/gmcp/contracts/validators.ts`, `client/runtime/information.ts`,
`public/js/core-information-panel-renderers.mjs`,
`public/js/panel-renderers.js`, `client/workspace/WorkspaceHost.svelte`,
`e2e/phase2-information-panels.spec.ts`, `test/session-information.test.mjs`,
`test/quest-panel-renderer.test.mjs`,
`test/cyberware-panel-renderer.test.mjs`

**Intent:** Add only the remaining Step 6 contracts and reducers. Preserve list
replacement and incremental update behavior using stable IDs/paths, and route
cyberware detail activation through the typed session method. The accessible
detail dialog owns focus return, Escape/close, late Details/Image matching, and
cleanup.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/session-information.test.mjs test/quest-panel-renderer.test.mjs test/cyberware-panel-renderer.test.mjs test/session-gmcp-darkwind.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-information-panels.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** initial and delta fixtures for all four families produce the same
observable lists/progress as legacy; malformed/mismatched details are ignored;
inventory tabs and cyberware dialog are keyboard/mobile accessible; reconnect
and disposal erase stale state.

### Green PR 4 — Port connection health and RFC 2549 debug

**Files:** `client/gmcp/contracts/diagnostics.ts`,
`client/gmcp/contracts/validators.ts`,
`client/runtime/connection-health.ts`, `client/runtime/session-factory.ts`,
`client/runtime/session.ts`, `client/transport/health.ts`,
`client/transport/types.ts`, `client/workspace/ConnectionHealthPanel.svelte`,
`client/app/client-settings.ts`, `client/app/SettingsDialog.svelte`,
`client/app/App.svelte`, `client/phase2/index.html`,
`test/session-connection-health.test.mjs`, `test/lag-core.test.mjs`,
`e2e/phase2-diagnostics.spec.ts`

**Intent:** Compose the existing lag algorithms with public connection/transport
snapshots, typed GMCP ping/status handling, owned timers/observers/fetch aborts,
and one subscription API. Add transport byte counters at the health owner so RFC
2549 does not read compatibility state. Render connection health in Dockview and
RFC 2549 as its existing opt-in debug surface. Extend the existing client
settings object for `lagMonitorEnabled` without replacing unknown fields.

Do not import `lag-monitor.js` or `rfc2549-debug.js` into Svelte; they remain the
legacy rollback owners.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/lag-core.test.mjs test/session-connection-health.test.mjs test/session-transport.test.mjs test/session-runtime.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-diagnostics.spec.ts --project=chromium
```

**Done when:** healthy/degraded/disconnected diagnoses, ping loss, server poll,
visibility pause, reconnect gaps, full-check re-entry, RFC startup/toggle/close,
bytes/events, and post-disposal silence pass without legacy state, document
events, raw sockets, or unowned resources.

### Green PR 5 — Integrated Step 6 evidence and boundary freeze

**Files:** `e2e/fixtures/transport-fixtures.ts`,
`e2e/phase2-information-panels.spec.ts`, `e2e/phase2-diagnostics.spec.ts`,
`test/session-gmcp-controller-census.test.mjs`,
`docs/plans/phase-2/multi-connection-ui-phase-2-step-1-parity-matrix.md`,
`docs/plans/phase-2/multi-connection-ui-phase-2-step-6-completion.md`

**Intent:** Extend the existing transport owner with arbitrary server-to-client
GMCP frames and outbound capture, then run one integrated reconnect/malformed/
mobile/disposal proof. Correct the duplicate room-media phrase in
`P2-6-character-group-vitals` to its dedicated `P2-8-room-image` owner, then
update only the three `P2-6-*` rows with replacement evidence. Record the exact
families moved to the Phase 2 owner and freeze the four proven seams; do not
delete legacy registrations or adapters.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm test
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run lint
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run format:check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-information-panels.spec.ts e2e/phase2-diagnostics.spec.ts --project=chromium --project=mobile-chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser:production -- e2e/phase2-information-panels.spec.ts e2e/phase2-diagnostics.spec.ts
git diff --check
```

Compare `npm run typecheck` with the recorded TS5097 baseline; Step 6 must add no
new diagnostic, but it must not change compiler settings to hide existing import
extension failures.

**Done when:** all three Step 6 rows contain command, result, date, and revision;
the GMCP census assigns every migrated registration to the Phase 2 owner while
retaining compatibility rollback; development and built desktop/mobile evidence
passes; the completion record marks Step 6 `COMPLETE` locally and explicitly
defers packaged/release proof to Step 12.

## Success criteria

- [ ] `Session.information` and `Session.connectionHealth` are the only new public
      runtime surfaces, and neither leaks internal handles.
- [ ] Every Step 6 GMCP family has direction-correct valid and malformed wire
      fixtures; only the new owner suppresses invalid updates.
- [ ] Named panels preserve full/delta, empty/error, reconnect, interaction, and
      disposal behavior in the real workspace.
- [ ] Desktop and 390x844 mobile controls are keyboard accessible and themed;
      terminal identity/focus survives panel work.
- [ ] Lag and RFC 2549 work without legacy globals or unowned browser resources.
- [ ] `P2-6-character-group-vitals`, `P2-6-inventory-progress-cyberware`, and
      `P2-6-lag-rfc2549` have replacement evidence.
- [ ] `/`, legacy panel state, public legacy modules, compatibility adapters, and
      the Step 12 release boundary remain unchanged.

## Rollback

Step 6 changes only the non-default `/phase2/` path and shared code that retains
legacy delegates. Roll back the Step 6 commits and serve the legacy `/` client;
`public/js/panel-manager.js`, `lag-monitor.js`, `rfc2549-debug.js`,
`darkwind-panel-state`, and the version-2 workspace's embedded legacy payload
remain intact. Do not delete `darkflow-session-core-v1`, because it may contain
later player settings or layouts.

If a shared renderer extraction regresses `/`, revert that Green PR before
continuing; do not patch separate markup paths. If a new validator rejects real
wire data, return that family to compatibility pass-through, add the captured
fixture, and replan its contract before claiming the owning row.

## Execution fit

- Scope: multi-run phase
- Lead: Terra at high reasoning — the implementation is bounded, but GMCP
  validation, reducer semantics, public capability shape, and legacy/Svelte
  shared rendering require careful sequential integration
- Workers: none — five slices touch the same session, contracts, workspace host,
  and browser evidence in order
- Delegation shape: solo
- Ownership: one lead owns public interfaces, integration, rollback, and final
  development/built verification
- Replan trigger: a real payload cannot satisfy a narrow typed contract; a panel
  requires `SessionFacadeHandles`/Dockview types; retained renderer extraction
  imports legacy runtime state; or the dedicated Step 8 room-image ownership is
  rejected
- Confidence: medium — the session/workspace patterns and retained algorithms are
  proven, but several Darkwind families are intentionally unmodeled and need real
  wire fixtures before their contracts can freeze

Plan self-review: PASS (9/10)

notes:

- Every must-have maps to a Green PR or the completion gate; deferred ports and
  Step 12 proof remain explicit.
- The plan reuses existing reducers, renderers, styles, lag algorithms, workspace,
  session scope, and browser fixtures instead of creating a panel framework.
- The main uncertainty is payload shape, contained by validated representative
  fixtures before each family becomes a Phase 2 owner.
