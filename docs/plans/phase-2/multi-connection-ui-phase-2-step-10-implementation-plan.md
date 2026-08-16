# Phase 2 Step 10 Implementation Plan

## Planning selection

- Mode: detailed implementation plan
- Complexity: 5/10 — four parity rows cross validated session state, the
  DOM-owned terminal, one application-owned audio engine, Svelte chrome, and a
  targeted packaged path, but all product decisions are resolved by retained
  behavior and the frozen Phase 2 boundary.
- Hard triggers: none
- Current planning horizon: Step 10 only — in-app mention notifications,
  output-line navigation, sound controls/playback, login theme, game/room
  ambience audio, and the deferred Phase 2 local sound producers.
- Evidence horizon: the Step 10 parity rows, retained notification/sound/input/
  output owners, live mudlib producers, current public `Session` seams, focused
  Node tests, browser paths, and packaged audio assets.
- Adversarial review: focused — completed for live duplicate frames, terminal
  line ownership, audio persistence, and Step 12 packaging boundaries.

## Status and baseline

- Status: `COMPLETE` on 2026-08-16 at committed Step 9 revision `dd67231` plus
  the uncommitted Step 10 worktree; commit is pending user approval.
- Retained Step 10 baseline: `PASS` — 74/74 under Node v22.15.0.
- Step 9 exit: committed, clean worktree, and all dependency gates passed.
- Step 10 exit: full Node `PASS` 651/651; development and built
  Chromium/mobile `PASS` 6/6 each; full development regression `PASS` with 186
  passed, 6 skipped, and 0 failed; source-free packaged Electron audio and the
  authenticated live gate passed. Nine absent retained fishing MP3s remain an
  explicitly accepted inherited gap.
- Phase 2 still owns one active foreground session. Phase 3 retains background,
  cross-session notification, and multi-session audio policy
  (`multi-connection-ui-phase-2-implementation-plan.md:103-108`).

## Goal

Replace the four Step 10 parity rows on `/phase2/` without changing the legacy
`/` client. A rendered channel mention must create one bounded in-app
notification that navigates back to its terminal line; a trusted user gesture
must unlock the existing local Howler engine; validated server and local sound
producers must use the same controls, persistence, and cleanup; and the login
theme plus game/room ambience must survive expected transitions without stale
playback.

## Decisions frozen by repository evidence

1. **Notifications remain in-app.** The retained notification owner implements
   only a toolbar list and output navigation (`public/js/notification-manager.js:81-150,319-390`);
   it never uses the browser `Notification` API. OS permission/delivery is not
   parity and remains outside Step 10.
2. **The legacy sound key remains authoritative.** The retained widget owns
   eleven client categories in `darkwind-sound-settings`
   (`public/js/sound-manager.js:3,13-25,182-192`). The frozen character model
   contains only ambient/combat/notification controls
   (`client/model/profiles.ts:28-38`); Step 10 does not invent a dual-write or
   schema revision.
3. **Audio engine ownership is application-lifetime.** `/phase2/` already loads
   the pinned local Howler runtime before the module graph
   (`client/phase2/index.html:9`; `package.json:57`). The retained singleton owns
   cached Howls and global volume; `Session.audio` owns only the active session's
   validated support/activity/login/reset lifecycle.
4. **“Room media” means ambience audio only.** Room image and Jukebox ownership
   completed in Step 8. Step 10 does not reopen `Session.world` or those panels.
5. **Step 10 owns targeted packaged audio execution.** The packaged smoke must
   exercise the Svelte audio path and a local sound asset. Step 12 still owns
   default-root cutover, complete Electron/release certification, and legacy
   deletion.
6. **Login audio belongs wholly to Step 10.** The already-replaced Step 2 row
   remains visual chrome/theme/desktop ownership; `login-theme-manager.js` stays
   a Step 10 rollback owner.

## Must-haves

- [MH1] Validated messaging — acceptance: `Comm.Channel.List` accepts documented
  arrays plus the retained mapping-compatible shape; roster entries are frozen;
  malformed frames remain advisory to compatibility consumers but cannot mutate
  `Session.notifications`. Before retention, channel lists are capped at 128,
  rosters at 512, each player at 64 channels, channel/name/talker fields at 80
  characters, display names at 120, and message/output text at 4096; excess
  entries are ignored and oversize correlation text never notifies.
- [MH2] One rendered mention, one notification — acceptance: duplicate
  `Comm.Channel` plus `Comm.Channel.Text` frames dedupe for 10 seconds; messages
  that never render or are gagged never notify; state is bounded to 100
  notifications and 250 recent lines, matching the retained limits
  (`public/js/notification-manager.js:7-10,165-239`).
- [MH3] Exact mention input and navigation — acceptance: the retained token/
  channel/suggestion helpers drive keyboard and pointer selection; roster
  requests send only `Comm.Channel.Players {}`; activating a notification opens
  the terminal, centers/flashes an available line, marks it read, and marks an
  unavailable line expired.
- [MH4] Validated server audio — acceptance: modeled `Darkwind.Sound` play/loop/
  stop frames accept only the ten server categories; required sound/id tokens
  are 1-120 characters, match `[A-Za-z0-9_./-]+`, contain no `..`, and never
  start with `/`; volume is finite and within 0..1. Traversal, empty, oversize,
  invalid-character, invalid-volume, and malformed frames cannot play sound.
  The local-only `fishing` category never enters the wire contract.
- [MH5] Existing audio behavior stays singular — acceptance: locked sounds and
  loops queue then drain once, loops replace by semantic ID, visibility stops/
  resumes remembered loops, missing assets remain non-fatal, and no duplicate
  document listener or Howler/global-volume owner is created.
- [MH6] Controls preserve retained settings — acceptance: support Add/Set/Remove
  controls visibility; unlock, mute, master volume, and eleven category toggles
  remain keyboard/mobile accessible and persist the existing JSON schema under
  `darkwind-sound-settings`.
- [MH7] Login and local producers are restored — acceptance: the auth-window
  login theme uses the retained 100 ms transition grace and stops on character
  attachment; Phase 2 automation `play_sound` and every retained fishing sound
  use named `Session.audio` actions and never send GMCP: Cast→cast, Bite→splash,
  Hook→hook, Fight→reel loop, tension crossings→tension, Caught→catch plus
  pristine when applicable, Escaped→snap/slack, and End/reset/disconnect/
  disposal→stop reel.
- [MH8] Reconnect/disposal is silent and complete — acceptance: notification,
  roster, support, activity, pending audio, and session playback reset on
  disconnect; disposal removes subscriptions/timers and blocks late UI/audio
  callbacks; a fresh session remount works once.
- [MH9] Actual runtime boundaries pass — acceptance: development and built
  Chromium/mobile, the full development regression, a source-free packaged
  Electron smoke with a local audio request, and an authenticated live check
  all pass before commit permission is requested.

## Out of scope

- OS/browser notification permission and background delivery — no retained
  production owner exists; Phase 3 owns background/cross-session policy.
- Four-session notification/audio isolation, inactive-session mixing, ducking,
  or source labels — Phase 3 policy.
- A profile-audio schema revision or synchronization between the three modeled
  controls and the eleven-category legacy key — requires a separate migration
  and precedence decision.
- Room image, Jukebox/YouTube, Giphy, broadcast, combat/effects/tutorial UI, or a
  generic media framework — owned by Steps 7, 8, or 11.
- `Comm.Channel.Enable` — the live mudlib leaves it unsupported; mention input
  only requests the roster.
- Default-root cutover, signed installers, hosted CI, release certification, or
  legacy deletion — Step 12.

## Assumptions

- The Phase 2 route has one foreground session — if false: stop before sharing
  the application audio singleton and move the policy decision to Phase 3.
- The live server continues to emit each channel message on both Comm aliases —
  if false: the 10-second dedupe remains harmless but dual-frame fixtures still
  protect current production behavior.
- The local Howler script and sound assets remain part of the built artifact —
  if false: the build/package gate fails before live verification.
- The terminal panel remains a preserved-DOM workspace surface — if false: line
  IDs and the registered navigator must be invalidated on every remount.

## Risks

- A mention can arrive before its rendered terminal line — mitigation: retain
  the bounded 10-second pending correlation and publish only after a line match.
- Terminal line IDs can escape their owning DOM instance — mitigation: keep IDs
  mount-local, never persist them, and clear notification line availability when
  the terminal clears or disposes.
- One server sound frame can reach both advisory and validated consumers —
  mitigation: only `Session.audio` controls Phase 2 playback; legacy `/` remains
  separate and the capability revalidates ingress.
- Trusted audio unlock is timing-sensitive — mitigation: unlock only from the
  native control gesture and prove queue drain with a browser-level Howler stub
  plus packaged execution.
- A disconnect can leave loops or late callbacks active — mitigation: add one
  retained session-playback reset operation and generation/timer cleanup in the
  capability/component.
- Concurrent writers could collide in session, terminal, app, or desktop files —
  mitigation: the orchestrator alone owns those bottlenecks and lands slices in
  dependency order.

## Public capability contracts

### `Session.notifications`

Frozen snapshot: player name, normalized channel names, normalized roster,
roster-request pending state, bounded notification rows, and unread count. The
capability extracts only named fields, applies the MH1 item/string limits before
freezing, and retains no unknown payload properties.

Named actions only:

- `requestRoster()` sends exact `Comm.Channel.Players {}` with retained 1-second
  request throttling and 2.5-second pending timeout.
- `recordOutputLine({ id, text })` correlates rendered terminal lines.
- `resetOutputLines()` invalidates line navigation after clear/remount.
- `activate(id)` marks read and returns the bound line ID or `null`.
- `markExpired(id)` and `clear()` update only bounded session state.

No GMCP bus, transport, DOM navigator, event bus, scope, storage, or compatibility
handle is public.

### `Session.audio`

Frozen snapshot: connected/supported, enabled, master volume, audio-unlocked,
pending count, current category/activity kind, and all eleven category toggles.

Named actions only: `unlock`, `setEnabled`, `setVolume`, `setCategoryEnabled`,
`playLocal`, `loopLocal`, and `stopLocal`. Server audio is inbound only. Svelte
never receives Howler, Howl handles, cached audio, GMCP, scope, or the retained
manager.

## Dependency-ordered Green PRs

### Green PR 1 — Freeze retained cores and wire contracts

**Worker-owned disjoint files:** one worker owns `public/js/sound-manager.js` and
its focused test; one owns new `client/gmcp/contracts/sound.ts` and a new focused
contract test; one owns `client/gmcp/contracts/comm.ts` and a new focused
normalization/limit test.

**Orchestrator integration files:** `client/gmcp/contracts/validators.ts`,
`client/gmcp/frame.ts`, and existing shared GMCP tests.

**Intent:** Add the smallest application-singleton session-reset seam; preserve
the catalog, key, path resolution, and Howler adapter. Model exact
`Darkwind.Sound`; preserve documented array plus retained mapping compatibility
for `Comm.Channel.List`; leave compatibility dispatch advisory.

**Verify:** retained 74/74 baseline plus focused valid/malformed/compatible-shape,
notification retention limits, sound traversal/empty/oversize/invalid-character/
invalid-volume rejection, reset, one-shot, loop, and listener-count tests.

**Exit:** contracts and core ownership are frozen before session capabilities or
UI begin.

### Green PR 2 — Add isolated public session capabilities

**New owned files:** `client/runtime/notifications.ts`,
`client/runtime/audio.ts`, `test/session-notifications.test.mjs`, and
`test/session-audio.test.mjs`.

**Orchestrator integration files:** `client/runtime/session.ts`,
`client/runtime/session-factory.ts`, and composition tests.

**Intent:** Implement the two frozen public capabilities. Reuse validated
`Session.information` identity and `Session.interactions` auth lifecycle where
possible; validate direct Comm/Sound ingress again; keep the audio manager
application-owned and session activity/reset state local.

**Verify:** two-session notification isolation, duplicate suppression,
line-before/frame-before correlation, roster replacement/timeout, support
reset, audio directions, auth grace, reconnect, listener removal, late callback,
and remount tests.

**Exit:** UI can consume only `Session.notifications` and `Session.audio`; no
raw handles leak.

### Green PR 3 — Extend terminal output and mention input

**Owned files:** `public/js/terminal-output-core.mjs`, a new small mention picker
component/controller, `client/terminal/input-controller.ts`, and focused terminal
tests.

**Orchestrator integration file:** `client/workspace/TerminalPanel.svelte`.

**Intent:** Add mount-local rendered-line IDs, post-gag observation, availability,
center/flash navigation, clear invalidation, and disposal. Reuse
`public/js/mention-utils.js`; ensure handled mention keys prevent completion,
history, or Send from also firing.

**Verify:** gag/no-line, clear/expired, center/flash/Escape, Arrow/Enter/Tab/
Escape, mouse selection, rate limit/timeout, focus, reconnect, and disposal.

**Exit:** notification state never owns DOM and the terminal never owns GMCP.

### Green PR 4 — Add notification and audio controls

**New owned files:** notification menu and sound-control Svelte components.

**Orchestrator integration files:** `client/app/App.svelte`,
`client/workspace/WorkspaceHost.svelte`, and the existing workspace component-
props registration seam.

**Intent:** Mount in-app notifications and retained-class audio controls in the
Phase 2 chrome. `TerminalPanel` registers its mount-local navigator through
Dockview component props; `WorkspaceHost` stores it and exports
`navigateTerminalLine(lineId): boolean`, which activates the terminal panel and
invokes the current navigator. `App` binds the `WorkspaceHost` instance, calls
that method after `Session.notifications.activate(id)`, and marks the row expired
when it returns false. No global DOM event or navigator enters a Session
capability. Keep menu/popover open state local and restore focus on close.

**Verify:** badge/read/clear/expired behavior, terminal activation, outside/
Escape close, unlock, mute/volume/category synchronization, support visibility,
desktop layering, 390x844 layout, keyboard, and repeated disposal.

**Exit:** both controls use only public Session capabilities.

### Green PR 5 — Restore local sound producers

**Owned files:** `client/terminal/automation.ts`,
`client/workspace/FishingPanel.svelte`, and their focused tests.

**Intent:** Replace Phase 2's deferred automation sound flag with catalog-backed
`Session.audio.playLocal`; reproduce every MH7 fishing sound transition and
always stop the reel loop on End/reset/disconnect/disposal paths.

**Verify:** automation remains local-only and validates known catalog entries;
fishing cast/bite/hook/fight/tension/caught/pristine/escaped/end/reset/
disconnect/disposal paths emit exact named local actions with no late loop.

**Exit:** no known Step 10 local producer remains deferred.

### Green PR 6 — Integration, runtime evidence, and completion record

**Orchestrator-owned files:** one integrated Step 10 browser spec, Playwright
configuration, `desktop/main.cjs`, master/parity/Step 2 ownership reconciliation,
and the Step 10 completion record.

**Intent:** Prove the real Svelte/terminal/Howler path in development, built,
mobile, source-free Electron, and an authenticated live connection. Preserve
all prior smoke assertions; add a real control gesture, injected supported sound,
and a local sound-asset request.

**Verify:** focused Node; full Node; check/lint/format/diff; build; development
and built Chromium/mobile Step 10 fixture; full development regression;
typecheck baseline comparison; package validation; packaged audio execution;
authenticated live support/control/login-theme and user-performed mention/
navigation check.

**Exit:** all four `P2-10-*` rows are replaced only by observed evidence, the
first live transient/failure is recorded honestly, and the user is asked for
Step 10 commit permission. Step 11 does not start before approval.

## Shared-file ownership

The orchestrator alone integrates `validators.ts`, `frame.ts`, `session.ts`,
`session-factory.ts`, `TerminalPanel.svelte`, `App.svelte`,
`WorkspaceHost.svelte`, Playwright configuration, desktop smoke, and Phase 2
evidence docs. Concurrent writers may own only disjoint new runtime/test/
component files or the explicitly assigned retained core/producer files.

## Verification baseline

```text
node --test --test-concurrency=1 \
  test/mention-picker.test.mjs \
  test/notification-manager.test.mjs \
  test/sound-manager.test.mjs \
  test/sound-panel-layering.test.mjs \
  test/login-theme-manager.test.mjs \
  test/howler-audio-engine.test.mjs \
  test/session-gmcp-controller-census.test.mjs \
  test/automation-executor.test.mjs \
  test/fishing-core.test.mjs \
  test/session-interactions.test.mjs
```

Observed before implementation: `PASS` — 74/74.

## Success criteria

- [x] Live Comm/Sound shapes validate and malformed frames cannot mutate new
      notification/audio state or produce playback — focused contracts and full
      Node `PASS` 651/651; live Comm exact-mention behavior passed, while the
      connected DOM exposed supported audio and the user confirmed audible
      login theme. No live server `Darkwind.Sound` play frame is claimed.
- [x] Rendered-line correlation, duplicate suppression, picker behavior,
      navigation, expiration, and cleanup pass exact tests — development and
      built Chromium/mobile `PASS` 6/6 each; live exact-channel navigation
      passed.
- [x] Locked playback, one-shot/loop lifecycle, visibility, settings, controls,
      login transitions, automation, fishing, and cleanup pass exact tests —
      focused local-producer regression `PASS` 47/47 and full regression `PASS`
      with 186 passed, 6 skipped, and 0 failed. The nine absent retained fishing
      MP3s are an explicitly accepted inherited gap.
- [x] Development and built Chromium/mobile execute the same Step 10 surfaces —
      6/6 each.
- [x] Source-free packaged Electron executes the Svelte audio path using only
      local Howler and sound assets — real trusted unlock, supported
      `alert/ping`, and local MP3 HTTP 200 passed from a 319-file ASAR.
- [x] Authenticated live support/control/login-theme plus mention/navigation pass
      without administrative or shared-state mutation — the connected DOM
      exposed `🔊 Ready` and `Toggle audio`, the user confirmed audible login
      theme, and exact `@Malraux` notification/navigation passed. No live
      mute/volume/category action is claimed.
- [x] All four `P2-10-*` rows are replaced; Step 12 retains release/cutover
      ownership.

## Rollback

Revert the Step 10 commit and use legacy `/`. Retain `mention-picker.js`,
`mention-utils.js`, `notification-manager.js`, `notification-utils.js`,
`output.js`, `input.js`, `sound-manager.js`, `howler-audio-engine.js`,
`sound-panel.js`, `login-theme-manager.js`, legacy automation/fishing owners,
main CSS/toolbar markup, `/vendor/howler.core.min.js`, sound assets, and
`darkwind-sound-settings`. Step 10 deletes no schema or source asset.

## Execution fit

- Scope: multi-run phase
- Lead: Sol at high reasoning — owns trust boundaries, shared session/terminal/
  app integration, packaged/live evidence, and the commit gate.
- Workers: three bounded workers — retained contract/core, notification runtime/
  terminal, and audio runtime/control/producer slices after each API freeze.
- Delegation shape: staged handoff with parallel work only on disjoint new files
  or explicitly assigned retained owners.
- Ownership: root owns the plan, shared-file integration, review of every diff,
  and final verification.
- Replan trigger: a live payload exceeds the modeled mapping/sound bounds, the
  single-foreground-session assumption becomes false, or the terminal navigator
  cannot preserve existing DOM/lifecycle behavior.
- Confidence: high — protocol traps and policy conflicts are resolved; the main
  remaining risk is browser-level audio timing, covered by focused and packaged
  execution.

## Self-review

`PASS` — 9/10. The plan removes two speculative requirements (OS notifications
and reduced-motion audio policy), preserves the existing storage/runtime owners,
and leaves Phase 3 and Step 12 boundaries explicit.
