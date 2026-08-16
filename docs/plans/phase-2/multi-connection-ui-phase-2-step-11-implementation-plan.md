# Phase 2 Step 11 Implementation Plan

## Planning selection

- Mode: detailed implementation plan
- Complexity: 7/10 — four parity rows cross validated GMCP state, three new
  public session capabilities, the existing server-window capability, retained
  DOM renderers, workspace presentation, settings, and safety-critical textual
  fallback.
- Hard triggers: none before implementation. Authenticated live proof may need
  user participation for combat/tutorial and an eligible Street Samurai
  character.
- Current planning horizon: Step 11 only — Enemy/Combat, Tutorial, Visual
  Effects, and Street Samurai functionality and lifecycle.
- Evidence horizon: the Step 11 parity rows, retained managers/cores/renderers,
  live mudlib producers, the public `Session` boundary, focused Node suites,
  development/built browser fixtures, and authenticated live verification.
- Adversarial review: focused — completed for trust bounds, readiness/text
  fallback, reconnect/disposal, multi-session dashboard isolation, writer
  ownership, and the Step 12 visual-parity seam.

## Status and baseline

- Status: `COMPLETE` on 2026-08-16 at committed Step 10 revision `5856d44` plus
  the uncommitted Step 11 worktree; commit is pending user approval.
- Dependency gate: Steps 6 and 7 are committed; Step 7 supplies the existing
  server-window owner extended by Street Samurai. Step 10 is the current
  committed baseline, not an architectural dependency.
- Retained Step 11 baseline: `PASS` — 83/83 under Node v22.15.0:

  ```sh
  node --test --test-concurrency=1 \
    test/combat-visual-core.test.mjs \
    test/combat-visual-renderer.test.mjs \
    test/combat-visual-manager.test.mjs \
    test/tutorial-core.test.mjs \
    test/tutorial-manager.test.mjs \
    test/tutorial-ui-contract.test.mjs \
    test/visual-effects-core.test.mjs \
    test/visual-effects-manager.test.mjs \
    test/visual-effects-settings.test.mjs \
    test/street-samurai-dashboard.test.mjs \
    test/gmcp-normalizer.test.mjs \
    test/session-gmcp-controller-census.test.mjs \
    test/session-gmcp-darkwind.test.mjs
  ```

- Step 11 exit: full Node `PASS` 681/681; development and built
  Chromium/mobile specialty fixtures `PASS` 8/8 each; full development browser
  regression `PASS` 202 with 6 intentional skips and 0 failures; build/postbuild
  artifact gates `PASS`; authenticated live checks for all four surfaces were
  user-confirmed.

- The compatibility census remains 109 registrations. Step 11 accounts for 14
  retained registrations: Combat 3, Tutorial 3, Visual 7, and Street Samurai 1.
- The untracked Step 12 visual-parity phase map is an input boundary, not a Step
  11 implementation file. It remains untouched.

## Goal

Replace all four Step 11 parity rows on `/phase2/` without changing the legacy
`/` client. Combat must preserve the server's text-fallback handshake while
adding a usable Enemy/Combat pane; Tutorial must preserve authoritative
progress, safe target guidance, and exact actions; Visual Effects must remain
optional, cosmetic, reduced-motion safe, and disposable; Street Samurai live
state must update the existing Step 7 dashboard window without cross-session
leakage or tab reset.

## Ownership boundary with Steps 12 and 13

Step 11 owns functional data, directions, lifecycle, safety fallback, baseline
accessibility, responsive usability, and reduced-motion behavior. It does not
freeze the final workspace look.

- Enemy/Combat: Step 11 owns the surface, content, readiness, auto-open/end,
  manual-close suppression, and mobile usability. Step 12 owns exact legacy
  default geometry, floating chrome, z-order/auto-front, snapping, and visual
  polish.
- Tutorial: Step 11 owns state, actions, timing, semantic target identity, and
  basic placement. Step 12 may restyle/reposition it without changing target
  markers or behavior.
- Visual Effects: Step 11 owns effect meanings, retained timing/CSS, settings,
  reduced-motion/forced-colors policy, and cleanup. Step 12 owns surrounding
  shell presentation only.
- Street Samurai: Step 11 owns live state inside the existing Step 7 server
  window. Step 12 owns generic window chrome/default geometry, not a second
  dashboard.
- Step 13 owns immutable-candidate release certification, default-root cutover,
  and legacy deletion. Step 11 adds no release framework.

## Decisions frozen by repository evidence

1. **Three new public capabilities, not a specialty framework.** Add
   `Session.combat`, `Session.tutorial`, and `Session.visualEffects`. Street
   Samurai state extends `Session.interactions` because its initial and closing
   lifecycle already belongs to `Darkwind.Window`. Svelte receives frozen
   snapshots and named actions only; no GMCP, transport, scope, storage,
   compatibility facade, or DOM handle enters a public capability.
2. **Readiness is renderer truth, with domain-specific visibility.**
   `combatPane` remains false until the Combat pane is mounted, visible,
   healthy, and connection-local; hide, manual close, render failure,
   disconnect, and disposal publish false immediately. `tutorialPane` becomes
   true when its shell is mounted, healthy, connected, and not Zork-only. It
   remains true while the card is minimized, Control-hidden, inactive,
   finished, or skipped because readiness does not describe tutorial progress
   or card visibility. Tutorial publishes false only for disconnect, Zork-only,
   render failure, or disposal. Resync follows a successful true readiness
   update. A bootstrap combat State may open the pane without stealing focus,
   then become ready; the triggering attack remains terminal text.
3. **Combat reuses the Enemy panel identity.** The Step 6-deferred `Char.Enemy`
   owner and Combat presentation share fixed panel id `enemy`. The retained
   reducer limits remain authoritative: 16 actors, five history rows, twelve
   queued events, and four-second stale-event rejection. Same-encounter manual
   close prevents reopening; a new encounter may auto-open. No transient event
   replays after reconnect.
4. **Tutorial targets are fixed local semantics.** Phase 2 adds
   `data-tutorial-target` markers only for `terminal`, `command-input`,
   `panels-menu`, `inventory-panel`, `vitals-panel`, and `enemy-panel`. Server
   selectors are never accepted. Example commands fill/focus the command input
   and emit the local draft event; they never send. Escape does not dismiss the
   tutorial. Skip retains confirmation.
5. **Visual settings reuse the existing legacy key.** Extend
   `darkwind-client-settings` with `visualEffectsEnabled` and the seven retained
   `visualEffectPreferences`, preserving unknown keys. The master defaults off;
   individual effects default on. No profile schema, migration, or second
   storage key is added.
6. **Visual effects never suppress text.** They are cosmetic. The terminal text
   path remains unchanged whether effects are enabled, disabled, hidden,
   reduced-motion, forced-colors, disconnected, or failed. `Visual.State`
   outranks `Room.Info`; low-health is alive-only at 40% or below; Preview lasts
   five seconds; event batches retain the core's twelve-event bound and
   epoch/sequence dedupe.
7. **Street Samurai remains instance-local.** Initial state is validated inside
   `Darkwind.Window.Open`; later `Darkwind.StreetSamurai` is a full replacement
   for the open stable dashboard window. Add the smallest root-scoped
   update/dispose seam and keep the legacy singleton as a thin legacy wrapper.
   Preserve the root's active tab. Close, disconnect, and disposal unregister
   immediately; late replacements are ignored.
8. **Raw collections are bounded before traversal.** A named-field extraction
   step caps raw inputs before Typia, `structuredClone`, `.map`, `.sort`,
   `Object.entries`, or recursive normalization. Combat accepts at most 16
   actors and 12 events plus the fixed overflow record. Tutorial accepts at most
   24 route directions and the five fixed actions. Visual accepts at most 12
   events; State terrain accepts a string or at most 16 scalar/shallow named
   candidates with depth two, while Preview accepts only its fixed scalar
   shapes. Street accepts protocol version 1, at most 15 processes and 11
   monitor flags from the fixed producer catalogs, and client trust caps of 64
   top-level alerts, target locks, and active-firmware rows; 32 entries per
   process issue list; and a fixed numeric `strain.breakdown` record whose
   `sources` mapping is capped at 32 entries with 64-character normalized keys.
   Identifiers are capped at 96 characters, display strings at 320, and all
   numbers must be finite. Unknown mappings are discarded. Excess rows are
   ignored before validation/normalization; a malformed retained row rejects
   the replacement. Percentages are clamped only after finite-number
   validation.
9. **Malformed GMCP remains advisory.** Central validation diagnoses modeled
   packages without blocking compatibility delivery. Each new capability
   validates again at ingress and ignores malformed frames. Only exact outbound
   Combat.Resync and Tutorial.Action/Resync helpers are added. Combat.Resync is
   bare; Tutorial.Resync is exact `{epoch, seq, reason}`. Street and Visual add
   no outbound package.

## Must-haves

- [MH1] Combat direction and ordering — acceptance: valid State/Events and the
  legacy singular Event are modeled; stale epoch/encounter/sequence data is
  ignored; exact bare Resync is sent only after readiness; authoritative
  Vitals/Enemy/Avatar data wins; two sessions do not share queues or timers.
- [MH2] Combat text fallback and lifecycle — acceptance: readiness is false
  before render health and immediately after hide/close/disconnect/failure;
  bootstrap opens without focus theft; manual close suppresses the same
  encounter; end hides; reconnect requires fresh State; disposal produces no
  late beat.
- [MH3] Tutorial direction and authority — acceptance: State/Control and exact
  Action plus `{epoch, seq, reason}` Resync directions are modeled; version 2
  epoch/sequence ordering is enforced; `awaiting_continue` sends one authorized
  Continue; a pending action clears on newer State or after five seconds
  requests Resync and restores UI.
- [MH4] Tutorial UI safety — acceptance: only the fixed semantic targets can be
  highlighted; examples fill/focus but never send; skip confirms; screenreader,
  disabled, finished, and skipped hide the visual card without changing healthy
  shell readiness; Zork-only, disconnect, render failure, and disposal hide the
  surface and publish false readiness. Render recovery uses the retained bounded
  500/1500/3000 ms schedule.
- [MH5] Visual semantics and settings — acceptance: master/per-effect settings
  persist in the existing key; support subscription follows enabled state;
  authoritative State, Room fallback, low health, Preview, event ordering,
  cooldown, visibility, and preference filters match retained behavior.
- [MH6] Motion/accessibility fallback — acceptance: terminal text always
  remains; reduced motion removes shake/lunge and keeps static semantic cues;
  forced colors hides the cosmetic overlay; the layer is pointer-inert and
  `aria-hidden`; mobile layout has no overflow or focus theft.
- [MH7] Street Samurai replacement — acceptance: representative Window.Open
  renders a labelled dashboard; later full replacements update the same root
  without reopening or resetting the active tab; strings remain literal text;
  close/disconnect/disposal unregister; another session's state cannot update
  the root.
- [MH8] Actual runtime boundaries pass — acceptance: retained and new focused
  Node suites, the 109-registration census, full Node, quality/build/artifact,
  development browser, built Chromium/mobile, full development regression, and
  an authenticated live check pass before commit permission is requested.
- [MH9] Same-connection recovery is explicit — acceptance:
  `Darkwind.Session.Recovered` republishes current Tutorial shell readiness,
  sends exact Tutorial.Resync, clears Visual cached/transient state, and
  republishes the current Visual subscription without replaying effects.

## Out of scope

- Full-window workspace hierarchy, fixed base layout, exact legacy floating
  geometry, pane chrome, snap/clamp/z-order, and theme polishing — Step 12.
- New Room, Chat, or generic Enemy domain owners beyond the Enemy/Combat data
  required by this step — they require their own functional ledger decision.
- A generic presentation/effects framework, animation scheduler, layout engine,
  or new dependency.
- Arbitrary tutorial selectors, command execution from examples, or server-owned
  DOM access.
- New Street Samurai actions, a second dashboard panel, or client-derived game
  rules.
- Builder-only `_visualtest`, administrative mutation, or automated gameplay
  commands during live verification.
- Full Electron/Docker/MCP/release certification, default-root cutover, hosted
  release proof, and legacy removal — Step 13. Add a targeted packaged check
  only if implementation introduces a new runtime-loaded asset path.

## Public capability contracts

### `Session.combat`

Frozen snapshot: connection/readiness, normalized combat reducer state,
authoritative Enemy/Vitals/Avatar display data, presentation generation,
manual-dismissed encounter, and current reduced-motion input. Named actions:

- `setPresentationReady(ready)` publishes `combatPane` and sends bare Resync
  only on the successful false-to-true transition.
- `dismissEncounter()` suppresses reopen for the current encounter and publishes
  false readiness.
- `setReducedMotion(reduced)` updates rendering semantics without changing wire
  state.

### `Session.tutorial`

Frozen snapshot: connection/readiness, authoritative normalized tutorial state,
control-enabled state, pending action, announcement, and presentation
generation. Named actions:

- `setPresentationReady(ready)` publishes `tutorialPane` and sends Resync only
  after successful shell readiness. Card visibility/progress does not change
  this readiness.
- `perform(action)` sends the exact action only when authorized by the current
  state.

The capability internally sends exact `{epoch, seq, reason}` Resync payloads
after readiness, reconnect, `Darkwind.Session.Recovered`, render recovery, and
action timeout. Arbitrary UI-provided reasons are not exposed.

Local collapse, confirmation, semantic target lookup, draft insertion, and
focus remain UI-owned.

### `Session.visualEffects`

Frozen snapshot: connection/support, enabled preferences, normalized world and
health state, active bounded cues, preview state/generation, and reduced-motion
input. Named actions:

- `configure(settings)` applies the validated retained settings and updates the
  `features.visualEffects` subscription.
- `setReducedMotion(reduced)` changes presentation semantics only.
- `setPresentationVisible(visible)` suspends/clears transient presentation when
  the document or shell cannot display it.

The capability owns timers/order/reset. `VisualEffectsLayer.svelte` owns only
DOM classes/markup.

### `Session.interactions` Street extension

The existing window snapshot gains optional normalized Street Samurai live
state plus a revision only for an open dashboard layout. The existing window
close action remains the sole outbound lifecycle direction. No Street action or
new public capability is added.

## Dependency-ordered Green PRs

### Green PR 1 — contracts, directions, and ownership census

Add bounded Combat, Tutorial, Visual, and Street contracts and focused
validation tests. Integrate modeled inbound packages and exact Combat/Tutorial
outbound helpers in the shared bus. Add Step 11 Phase 2 ownership assertions
without deleting any of the 109 retained registrations.

Exit:

- valid repository/live-shaped frames pass;
- malformed, oversize, recursive/excess collection, unsupported-version, and
  non-finite frames cannot mutate typed state;
- exact outbound wire payloads pass;
- focused GMCP and census suites pass.

### Green PR 2 — retained renderer seams

Reuse the existing Combat, Tutorial, and Visual cores unchanged where possible.
Extract only the DOM-only Combat renderer needed by both legacy and Phase 2.
Add instance-local Street dashboard update/dispose functions; retain the legacy
global manager as its thin wrapper.

Exit:

- retained 83/83 remains green;
- Combat DOM rendering is instance-local and disposable;
- Street two-root/two-session tests prove update isolation, active-tab
  preservation, literal text, and explicit unregister;
- no shared renderer timer/listener survives disposal.

### Green PR 3 — public runtime capabilities

Implement `Session.combat`, `Session.tutorial`, and `Session.visualEffects` in
disjoint new runtime files and extend `Session.interactions` for Street live
replacement. The orchestrator alone integrates `Session` and factory wiring.

Exit:

- focused runtime tests cover validation, ordering, readiness, exact actions,
  fallback, settings, two-session isolation, reconnect,
  `Darkwind.Session.Recovered`, late callbacks, and disposal;
- public snapshots are deeply frozen and expose no private handle;
- shared Session composition and the full focused Node set pass.

### Green PR 4 — Phase 2 presentation and shared integration

Add `CombatPanel.svelte`, `TutorialOverlay.svelte`, and
`VisualEffectsLayer.svelte`. Reuse retained CSS and add only the missing Phase 2
stylesheet links. Integrate the fixed `enemy` panel, tutorial target markers,
visual settings controls, Zork-only gating, Street window root updates, and
focus-safe lifecycle in the existing App/workspace components.

Exit:

- `npm run check`, scoped lint/format, and diff-check pass;
- no component consumes anything outside the public `Session` capabilities;
- render health/readiness transitions and close/reset paths are single-shot;
- Step 12 generic workspace geometry and its draft are untouched.

### Green PR 5 — integrated browser, artifact, live, and completion evidence

Add one focused `e2e/phase2-specialty.spec.ts` and only the fixture extensions
it needs. Prove the four parity rows in development and built desktop/mobile,
then run the full quality/regression boundary and authenticated live check.
Update the parity/master/completion ledgers with observed evidence only.

Exit:

- development and built Chromium/mobile prove exact directions, readiness/text
  fallback, ordering/stale rejection, reduced motion/forced colors, tutorial
  target fill-not-send, Street tab preservation, responsive presentation,
  reconnect/session-recovery/remount/disconnect/disposal, and no late
  timers/errors;
- build/postbuild and built asset HTTP 200 pass;
- full Node and development browser matrices pass or any unrelated failure is
  resolved before completion;
- live observations are recorded without claiming unavailable character- or
  builder-specific behavior.

## Writer boundaries

The orchestrator exclusively owns shared bottlenecks:

- `client/gmcp/contracts/validators.ts`
- `client/gmcp/bus.ts`
- `client/runtime/session.ts`
- `client/runtime/session-factory.ts`
- `client/runtime/interactions.ts`
- `client/gmcp/contracts/interactions.ts`
- `client/app/App.svelte`
- `client/app/SettingsDialog.svelte`
- `client/app/client-settings.ts`
- `client/workspace/WorkspaceHost.svelte`
- `client/workspace/TerminalPanel.svelte`
- `client/workspace/ServerWindowPanel.svelte`
- `client/phase2/index.html`
- Playwright configuration/integrated E2E files
- Phase 2 master, parity, completion, and detailed plans

Workers may own disjoint new per-domain contract/runtime/component/test files or
one retained renderer seam at a time. No concurrent writer touches generic
Dockview geometry, the Step 12 draft, or another worker's files.

## Verification matrix

Focused Node must cover:

- all retained 83 tests;
- contract bounds and exact outbound directions;
- Combat/Tutorial/Visual reducers and runtime lifecycle;
- Street normalization/root isolation;
- two-session, reconnect, disposal, and late-callback cases;
- the exact 109-controller census and Step 11 Phase 2-owner mapping.

Integrated browser must cover, in development and built Chromium/mobile:

- bootstrap text fallback and readiness ordering;
- Combat State/Events, Enemy/Vitals/Avatar precedence, stale rejection,
  manual close, encounter change, end, and reduced motion;
- Tutorial State/Control/Action/Resync, pending timeout, semantic target,
  fill-not-send, skip confirm, Zork-only/screenreader hide, and remount recovery;
- Visual default-off/settings persistence, subscription, State precedence,
  events/preview/cooldown, visibility, reduced motion, forced colors, and text
  continuity;
- Street initial render, replacement without tab reset, keyboard tabs, literal
  text, 390x844 usability, close/reconnect/disposal, and post-close ignore;
- no focus theft, unhandled exception, duplicate direction, or late timer.
- `Darkwind.Session.Recovered` Tutorial readiness/resync and Visual
  reset/resubscription without stale replay.

Repository gates:

- `npm run check`
- scoped ESLint and Prettier
- `git diff --check` for staged and unstaged changes
- `npm run build` and postbuild artifact validation
- full Node suite
- full development browser matrix
- targeted built Chromium/mobile specialty fixture

## Authenticated live gate

After automated exits pass, use the live `/phase2/` connection and record only
observed behavior:

- verify exact support/subscription changes and that terminal text is not
  suppressed before presentation readiness;
- enable Visual Effects locally and use ordinary movement/combat state to
  observe a real `Visual.State`; builder-only Preview is optional and not
  claimed;
- if an eligible Street Samurai character is available, run the safe
  own-session `dashboard`, exercise tabs/live replacement/close, then
  `dashboard -text` for terminal fallback;
- ask the user to perform or approve a safe combat encounter and any tutorial
  progress action. `tutorial restart` changes durable character progress and is
  never inferred;
- restore any user setting changed for verification.

If no eligible Street Samurai character or tutorial state is available, stop
at the live gate and ask for the missing character/action decision rather than
claiming live coverage from fixtures.

## Assumptions

- Step 7 remains the sole generic server-window lifecycle owner — if false:
  stop before Street integration and reconcile the duplicate owner.
- The retained cores and CSS remain available to both `/` and `/phase2/` — if
  false: restore those rollback assets rather than rewriting presentation.
- Required live character/state will be available with user participation — if
  false: stop at the live gate and record/request the missing eligibility or
  action; do not infer gameplay/account mutation.
- Step 12 remains presentation-only over the Step 11 public capabilities — if
  false: replan before either step creates a second Enemy/dashboard owner.

## Risks

- Premature readiness can cause the server to suppress combat/tutorial text —
  mitigation: readiness follows the exact domain rules, turns false before
  teardown, and browser fixtures assert outbound ordering plus text continuity.
- Nested Window.Open or Street replacement data can allocate/traverse before
  validation — mitigation: named-field preflight caps precede Typia, cloning,
  normalization, and renderer access.
- Retained Street global state can leak across sessions — mitigation: Phase 2
  uses only the instance-local root update/dispose seam and proves two-session
  isolation.
- Recovery can replay stale timers/effects — mitigation: connection and
  `Darkwind.Session.Recovered` generations clear transient state before
  readiness/resubscription.
- Step 11 presentation work can accidentally freeze Step 12 layout decisions —
  mitigation: no generic Dockview geometry/chrome file is in a Step 11 worker
  scope or exit.

## Rollback

Preserve the legacy `/` root, all Combat/Tutorial/Visual/Street managers, cores,
renderers, CSS, settings key, global Street wrapper, the 109 registrations, and
the existing Window integration. No schema migration or legacy deletion occurs.
Rollback is one additive Step 11 commit revert plus serving the retained legacy
root; false presentation readiness restores server text fallback. Step 12
remains presentation-only and Step 13 remains release/cutover ownership.

## Success criteria

- [x] All four Step 11 parity rows have one Phase 2 functional owner.
- [x] Retained and new focused Node suites pass; census remains exactly 109.
- [x] Development and built desktop/mobile specialty fixtures pass.
- [x] Full Node, quality/build/artifact, and development browser matrices pass.
- [x] Text fallback, reduced motion, reconnect, and disposal are observed at the
      actual browser boundary.
- [x] Authenticated live evidence is recorded honestly, with any unavailable
      character-specific facet explicitly resolved by the user.
- [x] Step 12 workspace/look-and-feel files remain outside the Step 11 code
      diff.
- [x] Completion/parity/master records contain no Step 12/13 ownership conflict.

## Execution fit

- Scope: one multi-run phase with five dependency-ordered Green PRs.
- Lead: Sol at high — owns public API decisions, shared integration, diff
  review, final browser/build/live evidence, and documentation.
- Workers: Terra implementers — own bounded disjoint slices only after the
  preceding API/exit freezes.
- Delegation shape: bounded disjoint contract, renderer, runtime, and
  new-component slices only after the preceding API/exit freezes.
- Ownership: root exclusively owns the shared bottlenecks and integration files
  listed above; each worker owns only its named files until handoff.
- Replan triggers: a live payload violates the frozen bounds, tutorial shell
  readiness cannot be separated from card visibility, Street initial state
  cannot be correlated to its Window instance, or the Step 12 draft claims a
  conflicting functional owner.
- Confidence: high on directions/lifecycle and reuse seams; medium on the
  character-specific live gate until eligible state is available.

Plan self-review: **PASS, 10/10** — implementation, automated evidence, and the
authenticated live gate are complete; commit remains the only approval gate.
