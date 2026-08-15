# Phase 2 Step 7 Implementation Plan

## Planning selection

- Mode: detailed implementation plan
- Complexity: 6/10 — the step crosses typed GMCP ingress, one public session
  capability, retained DOM renderers, transient overlays, Dockview panels, and
  browser/live-login evidence, but remains reversible on the non-default
  `/phase2/` route.
- Hard triggers: none; the four parity rows are ordered slices of one
  one-session window/workflow migration outcome.
- Current planning horizon: Step 7 only — generic server windows, snoop,
  announcements, Giphy, broadcast, Linux rescue, fishing, and their actions.
- Evidence horizon: the Step 6 frozen boundary, Step 7 parity rows, existing
  public `Session`, GMCP contracts/registry, legacy managers/renderers/styles,
  workspace registry, transport fixture, and development/built browser paths.
- Adversarial review: focused — login regression, malformed server layouts,
  outbound direction, stale reconnect state, resource disposal, mobile focus,
  and legacy rollback.

## Planning status

Implementation authorized by the user after the Step 6 exit gate passes. On
2026-08-15, current HEAD `66199ec` passed `npm test` (589/589), `npm run check`
(0 errors, 0 warnings), and staged/unstaged `git diff --check`.

The authoritative master plan makes Step 7 depend on Step 6 so `/phase2/` can
log in before authenticated map/media work begins
(`multi-connection-ui-phase-2-implementation-plan.md:165-190`). It assigns the
generic window and six named specialized workflows to Step 7
(`multi-connection-ui-phase-2-implementation-plan.md:321-334`), as do the four
frozen `P2-7-*` rows
(`multi-connection-ui-phase-2-step-1-parity-matrix.md:158-167`). Those sources
override stale Step 6 out-of-scope bullets that still name some of the same
workflows as Steps 10-11.

## Goal

Make `/phase2/` usable for a real Darkwind login and port the assigned
server-driven windows and interactive workflows without exposing GMCP,
transport, raw sockets, event buses, resource scopes, compatibility facades, or
legacy global state to Svelte.

Success means validated session-owned state drives generic `Darkwind.Window`,
snoop, announcements, Giphy, broadcast, Linux rescue, and fishing surfaces;
their outbound actions use typed session methods; reconnect and disposal erase
stale UI while involuntary reconnect retains only the active auth form;
development, built, desktop, and 390x844 mobile fixtures replace all
four `P2-7-*` rows; and the user manually confirms live login plus previously
completed functionality before Step 7 is committed.

## Must-haves

- [MH1] Add one narrow public `Session.interactions` capability — acceptance:
  Svelte can read/subscribe to frozen interaction state and invoke only named
  window/snoop/announcement/fishing actions; it cannot import internal runtime
  handles. The current public boundary is capability-shaped
  (`client/runtime/session.ts:39-69`).
- [MH2] Validate every newly owned inbound family at the interaction ingress —
  acceptance: representative valid payloads hydrate the new owner; malformed
  payloads remain advisory for legacy handlers but cannot mutate Phase 2 state;
  the owned families leave the unmodeled ledger only with positive and negative
  fixtures. Generic Window validators already exist
  (`client/gmcp/contracts/validators.ts:155-157,190-199`).
- [MH3] Keep protocol direction explicit — acceptance: Window Submit/Action/
  Closed, Snoop Command/Stop/Closed, Announcements MarkRead, and Fishing Cast/
  Hook/Result/Cancel are typed outbound methods; inbound-only frames cannot be
  sent accidentally. The inventory records those directions
  (`../multi-connection-ui-phase-1-gmcp-inventory.md:52-54,164-173`).
- [MH4] Reuse the current generic renderer and stylesheet — acceptance:
  `renderLayout`, `collectFormData`, and `updateElements` remain the shared DOM
  algorithms; the Phase 2 host adds lifecycle/focus/layout ownership around
  them rather than copying the 854-line renderer. NPC-dialogue windows keep
  their specialized overlay lifecycle, and windows containing `youtube_embed`
  receive unique client instance IDs so concurrent shared videos do not replace
  one another. The legacy manager already routes all three inbound Window frames through those functions
  (`../../../public/js/window-manager.js:22-31,39-80,420-495`).
- [MH5] Make login a first-class generic-window path — acceptance: login,
  new-character, and character-select forms render; the first input receives
  focus; Enter submits; reconnect replacement preserves non-empty form values;
  server Update errors render; and outbound Submit reaches the live connection.
  Existing protocol behavior is documented in
  `../../gmcp-darkwind-window.md:15-20,160-187,189-247,249-296`.
- [MH6] Host server `type: "panel"` windows in the existing workspace and modal
  windows as session-scoped overlays — acceptance: dynamic panels use the
  vendor-neutral `WorkspacePanelSpec`/renderer registry, server close is silent,
  user close sends Closed, transient server panels never enter the persisted
  character layout, and no second layout manager appears
  (`client/workspace/workspace.ts:18-53`,
  `client/workspace/WorkspaceHost.svelte:148-180`).
- [MH7] Port snoop and announcements with their existing user affordances —
  acceptance: snoop open/append/status/close plus command/stop/closed directions,
  announcement list/new/update/state plus mark-read, keyboard focus, responsive
  layout, reconnect reset, and teardown pass.
- [MH8] Port Giphy, broadcast, and Linux rescue as transient overlays —
  acceptance: safe server text/media presentation, close/focus behavior, mobile
  layout, repeated replacement, reconnect reset, and disposal pass. Linux rescue
  reuses `linux-rescue-core.mjs`; it does not duplicate the command simulator.
- [MH9] Port fishing as one workspace panel using the existing simulation core
  — acceptance: Open/Bite/Fight/Caught/Escaped/Art/End state, Cast/Hook/Result/
  Cancel actions, pointer and keyboard interaction, reconnect reset, animation
  cancellation, responsive rendering, and disposal pass. Step 10 retains sound
  engine ownership.
- [MH10] Preserve Step 6 lifecycle rules — acceptance: disconnect clears all
  transient Step 7 state before reconnect hydration; duplicate IDs replace the
  old surface; one session never receives another session's state; disposal
  leaves no late listeners, timers, animation frames, panels, dialogs, or
  overlays (`multi-connection-ui-phase-2-step-6-completion.md:45-59`).
- [MH11] Replace all four parity rows with evidence — acceptance: focused Node
  tests plus development and built Chromium/mobile fixtures cover valid and
  malformed frames, outbound capture, focus, responsive behavior, reconnect,
  disposal, and the login-window round trip. Electron/release proof remains Step
  12 (`multi-connection-ui-phase-2-step-1-parity-matrix.md:162-167`).
- [MH12] Stop at the live gate — acceptance: after automated Step 7 checks pass,
  ask the user to manually verify live login and already-completed Phase 2
  behavior, then ask for commit permission. Do not begin Step 8 before both
  confirmations.

## Out of scope

- Map hydration/rendering, map navigation/speedwalk, room image/media, and room
  playlist — Step 8 owns those four rows
  (`multi-connection-ui-phase-2-step-1-parity-matrix.md:169-178`).
- IDE and bundled CodeMirror — Step 9.
- Mentions, notifications, sound engine/panel, and login media — Step 10.
- Combat, tutorial, visual effects, and Street Samurai — Step 11.
- Multiple simultaneous sessions, functional session tabs, production-root
  cutover, packaged Electron, hosted/release certification, or legacy deletion —
  Step 12 or Phase 3.
- A universal GMCP store, generic interaction SDK, base controller, factory,
  second workspace abstraction, new dependency, or speculative protocol fields.

## Assumptions

- [The master plan and frozen `P2-7-*` rows are authoritative over stale Step 6
  bullets] — if false: stop before PR 3 and get an ownership decision for
  announcements, Giphy, broadcast, and fishing.
- [Existing legacy CSS is reusable by the Phase 2 entry] — if false: add only the
  missing stylesheet links or selectors required by the real surfaces; do not
  restyle the workflows during migration.
- [Representative fixture payloads can be derived from legacy consumers and live
  protocol docs] — if false: keep that family unmodeled, capture a real frame,
  and replan before claiming its parity row.
- [Fishing can omit direct sound-manager ownership until Step 10] — if false:
  expose a narrow session sound action only after Step 10 ownership is advanced;
  do not import the legacy sound singleton into Svelte.
- [The user can perform the authenticated live-login check] — if false: Step 7
  can be automated-complete but remains uncommitted and Step 8 stays blocked.

## Risks

- A permissive layout tree can carry unsafe DOM/style values — mitigation: reuse
  the existing renderer's allowlists and sandboxed media behavior, and retain
  malformed-envelope validation at ingress.
- Dynamic server panels can corrupt persisted layout or collide with fixed IDs —
  mitigation: namespace their panel IDs, suppress persistence while any are
  present, use the existing workspace methods, and prove restore/replacement/
  removal with repeated IDs.
- Auth reconnect can strand a half-typed or zombie form — mitigation: preserve
  non-empty values only across same-ID replacement, clear all windows on
  disconnect, and require the server to re-open them after reconnect.
- Parallel writers could collide in session/workspace/config files — mitigation:
  PR 1 freezes the capability first; later workers own disjoint component/test
  files; the lead alone edits `WorkspaceHost.svelte`, `session.ts`, factory,
  Playwright configs, parity docs, and completion evidence.
- Large retained workflow implementations invite rewrites — mitigation: reuse
  `window-renderer.js`, `announcement-markdown.js`, `linux-rescue-core.mjs`,
  `fishing-core.mjs`, and existing CSS; implement only the Phase 2 ownership
  adapter and real UI boundary.

## Steps

### Green PR 1 — Freeze typed interaction ingress and public actions

**Files:** `client/gmcp/contracts/interactions.ts`,
`client/gmcp/contracts/validators.ts`, `client/gmcp/bus.ts`,
`client/runtime/interactions.ts`, `client/runtime/session-factory.ts`,
`client/runtime/session.ts`, `test/session-interactions.test.mjs`,
`test/session-gmcp-darkwind.test.mjs`

**Intent:** Define only observed Step 7 payloads, validate them at one
session-owned reducer, expose frozen read/subscribe state plus named outbound
actions as `Session.interactions`, reset transient state on every non-connected
reconnect state, retain auth modal state only for involuntary reconnect, and
dispose through the existing resource scope. Keep global compatibility dispatch
advisory and legacy registrations intact.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/session-interactions.test.mjs test/session-gmcp-darkwind.test.mjs test/session-runtime.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
git diff --check
```

**Done when:** every assigned inbound family has valid/malformed reducer evidence;
all required outbound frames have exact package/payload assertions; reconnect and
disposal clear state; `Session.interactions` is the only new public surface.

### Green PR 2 — Port generic server windows and login

**Files:** `client/workspace/ServerWindowPanel.svelte`,
`client/workspace/ServerWindowHost.svelte`, `client/phase2/index.html`,
`test/window-renderer.test.mjs`, `e2e/phase2-interactions.spec.ts`

**Intent:** Reuse the existing renderer for modal/panel contents, implement the
generic open/update/close and form/action lifecycle against
`Session.interactions`, and prove a deterministic login-window submit round trip.
The lead integrates the new renderer kind and dynamic panel subscription into
`WorkspaceHost.svelte` after reviewing the slice.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/window-renderer.test.mjs test/session-interactions.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-interactions.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** modal, NPC-dialogue, and workspace-panel windows replace by ID,
while shared-video Opens create independent client instances; all variants
update/close in the correct direction, preserve auth form input across
replacement, restore focus, work at 390x844, and submit credentials through
captured GMCP.

### Green PR 3 — Port snoop and announcements

**Files:** `client/app/SnoopOverlay.svelte`,
`client/app/AnnouncementsOverlay.svelte`, `e2e/phase2-interactions.spec.ts`

**Intent:** Implement only the two named transient workflows over the frozen
interaction capability, reusing announcement Markdown handling and existing CSS.
Do not import or mutate the legacy managers.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-interactions.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** inbound state and outbound command/stop/close/mark-read directions,
keyboard focus, mobile presentation, reconnect replacement, and teardown pass.

### Green PR 4 — Port Giphy, broadcast, and Linux rescue

**Files:** `client/app/GiphyOverlay.svelte`,
`client/app/BroadcastOverlay.svelte`, `client/app/LinuxRescueOverlay.svelte`,
`test/linux-rescue-manager.test.mjs`, `e2e/phase2-interactions.spec.ts`

**Intent:** Render the three server-opened overlays from public snapshots, reuse
the Linux rescue command core, and keep all state/session lifecycle in the Phase
2 capability/components.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/linux-rescue-manager.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-interactions.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** repeated Show/Open frames safely replace content; close/focus,
responsive layout, reconnect reset, core commands, and disposal pass without
legacy globals.

### Green PR 5 — Port fishing as a workspace surface

**Files:** `client/workspace/FishingPanel.svelte`,
`test/fishing-core.test.mjs`, `e2e/phase2-interactions.spec.ts`

**Intent:** Reuse `fishing-core.mjs` for the simulation, drive it from validated
interaction snapshots, send named actions, and own pointer/keyboard/RAF teardown.
The lead integrates the renderer and dynamic panel lifecycle into
`WorkspaceHost.svelte` after reviewing the slice.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/fishing-core.test.mjs test/session-interactions.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-interactions.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** the full fishing state/action sequence, mobile/pointer/keyboard
controls, reconnect reset, panel close Cancel, animation cancellation, and late
frame rejection pass.

### Green PR 6 — Integrate, prove, and freeze Step 7

**Files:** `client/workspace/WorkspaceHost.svelte`, `client/app/App.svelte`,
`client/phase2/index.html`, `playwright.config.ts`,
`playwright.production.config.ts`, `e2e/phase2-interactions.spec.ts`,
`test/session-gmcp-controller-census.test.mjs`,
`docs/plans/phase-2/multi-connection-ui-phase-2-implementation-plan.md`,
`docs/plans/phase-2/multi-connection-ui-phase-2-step-1-parity-matrix.md`,
`docs/plans/phase-2/multi-connection-ui-phase-2-step-6-implementation-plan.md`,
`docs/plans/phase-2/multi-connection-ui-phase-2-step-6-completion.md`,
`docs/plans/phase-2/multi-connection-ui-phase-2-step-7-completion.md`

**Intent:** Perform the shared-file wiring, include existing styles in Phase 2,
add the Step 7 spec to desktop/mobile development and built suites, assert the
controller census, reconcile stale Step 6 ownership wording, replace only the
four `P2-7-*` evidence rows, and record the exact legacy rollback boundary.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm test
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run lint
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run format:check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-interactions.spec.ts --project=chromium --project=mobile-chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser:production -- e2e/phase2-interactions.spec.ts
git diff --check
```

Compare `npm run typecheck` with the recorded 14-diagnostic TS5097 baseline; do
not change compiler settings to hide it.

**Done when:** all four Step 7 rows record exact replacement evidence; current
development/built desktop/mobile checks pass; legacy `/` and managers remain;
the user is asked to verify live login and completed functionality; and Step 8
does not begin until the user confirms both that check and commit permission.

## Success criteria

- [x] `Session.interactions` is the only new public runtime capability and leaks
      no internal handles.
- [x] Every assigned inbound family is validated at the new owner and every
      outbound action has an exact direction/payload assertion.
- [x] Generic login/window, snoop, announcements, Giphy, broadcast, Linux rescue,
      and fishing pass focus, responsive, reconnect, malformed, and disposal
      evidence.
- [x] Development and built Chromium plus 390x844 mobile Chromium pass the Step 7
      browser fixture.
- [x] The four `P2-7-*` rows are replaced; Electron/release proof remains Step 12.
- [x] The user confirms live login and already-completed functionality before
      authorizing the Step 7 commit.

## Rollback

Step 7 changes the non-default `/phase2/` path and shared renderer/core modules
only when the legacy manager can keep using the same behavior. Roll back the
Step 7 commits and use legacy `/`; `window-manager.js`, `snoop-manager.js`,
`announcements-manager.js`, `giphy-manager.js`, `broadcast-manager.js`,
`linux-rescue-manager.js`, `fishing-manager.js`, their registrations, styles,
and legacy workspace state remain intact.

If a new validator rejects a real frame, keep legacy advisory delivery, return
that family to the unmodeled ledger, capture the payload, and replan its contract.
If generic login fails live, stop before Step 8 and revert the generic-window
slice rather than weakening the automated submit/reconnect assertions.

## Execution fit

- Scope: multi-run phase
- Lead: Sol at high reasoning — the step coordinates protocol ownership, login,
  multiple UI lifecycles, shared workspace wiring, and a manual/live gate.
- Workers: up to three Terra implementers — PR 1 sequentially freezes the
  capability; PRs 2, 3, and 4 may then own disjoint components/tests; PR 5 starts
  after the capability and fishing contract are stable.
- Delegation shape: staged handoff, then parallel owned slices with no shared-file
  writers.
- Ownership: the lead owns `WorkspaceHost.svelte`, `session.ts`, session factory,
  Playwright configs, all integration, diff review, final verification, rollback,
  user live-check instructions, and commit execution.
- Replan trigger: real payloads cannot satisfy narrow validators; a component
  needs internal handles; generic panels cannot use the current workspace
  contract; live login does not open/submit; or a worker needs a file owned by
  another active writer.
- Confidence: medium — the generic renderer, lifecycle boundary, CSS, simulation
  cores, and transport fixture are proven; specialized payload shapes and live
  auth behavior remain the bounded uncertainties.

Plan self-review: PASS (9/10)

notes:

- Every must-have maps to one Green PR or the completion/manual gate, and all
  dependent later steps remain deferred.
- The plan reuses existing renderers, cores, styles, workspace, session scope,
  and fixtures; it adds no dependency or general framework.
- Shared integration files have one writer, while delegated component slices are
  disjoint and independently reviewable.
