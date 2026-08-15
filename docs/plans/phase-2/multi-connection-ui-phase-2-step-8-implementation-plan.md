# Phase 2 Step 8 Implementation Plan

## Planning selection

- Mode: phase-map continuation with a detailed implementation plan for the
  current Step 8 horizon.
- Complexity: 8/10 — the step crosses world-owned map data, session-owned live
  view state, typed GMCP, retained rendering/navigation algorithms, three
  workspace surfaces, durable storage, external YouTube playback, and live
  authenticated evidence.
- Hard triggers: the existing Phase 2 phase map, one public `Session` contract
  change, independently testable map and media outcomes, and asynchronous
  player/preload lifecycle.
- Current planning horizon: Step 8 only — map hydration/rendering, map
  navigation and speedwalk, room image, and the shared room playlist.
- Evidence horizon: the Step 7 completion gate, four `P2-8-*` rows, current
  session/workspace boundaries, retained map/media modules and tests, protocol
  docs, and live mudlib producers.
- Adversarial review: full — world/session isolation, transactional map sync,
  shared playlist mutation, stale async media, reconnect, persistence, and
  disposal.

## Planning status

Implementation is authorized by the user's request to execute every remaining
Phase 2 step. Step 8's dependencies passed on 2026-08-15: Step 6 is complete,
and Step 7 passed its automated and user-confirmed live gates before commit
`80dbf73` (`multi-connection-ui-phase-2-step-7-completion.md:3-11`). The clean
Step 8 retained baseline passes 93/93 focused map, storage, speedwalk, playlist
core, and contract tests.

The authoritative master plan assigns map/world/room-media/speedwalk/playlist
to Step 8 after Steps 6 and 7
(`multi-connection-ui-phase-2-implementation-plan.md:167-190,336-348`). The
four frozen rows are `P2-8-map-hydration-render`, `P2-8-map-navigation`,
`P2-8-room-image`, and `P2-8-room-playlist`
(`multi-connection-ui-phase-2-step-1-parity-matrix.md:169-178`).

## Goal

Port the retained map, room-image, and room-playlist behavior to `/phase2/`
without exposing GMCP, transport, event buses, resource scopes, compatibility
facades, or legacy globals to Svelte.

Success means world-keyed map data remains shareable while each session owns
its current-room truth, source selection, browse state, speedwalk, pan/zoom,
room media, playlist opt-in/player lifecycle, and subscriptions. Development,
built, desktop, 390x844 mobile, reconnect, malformed-input, persistence, and
disposal evidence must replace all four Step 8 parity rows, followed by a live
authenticated verification before commit permission is requested.

## Must-haves

- [MH1] Extract only the retained map instance seams required for isolation —
  acceptance: application-owned graph/cache state is keyed by source and
  server-profile world key; two session views can share that graph without
  sharing current room, source mode, browse, center history, sync stages,
  speedwalk, timers, or status. Existing storage already isolates source,
  world, and area (`../../../public/js/map-storage.js:103-171`), while the
  current map, live-source, speedwalk, and renderer state are module globals
  (`../../../public/js/map-data-v2.js:26-98`,
  `../../../public/js/live-map-source.js:5-10`,
  `../../../public/js/map-speedwalk.js:10-13`,
  `../../../public/js/map-renderer.js:31-34`). Thin legacy singleton wrappers
  keep `/` unchanged.
- [MH2] Add one narrow public `Session.world` capability — acceptance: Svelte
  can subscribe to a deeply frozen world snapshot and invoke only named map,
  media, speedwalk, playlist action, and playlist report methods; it cannot
  obtain internal session handles or mutable graph ownership. This follows the
  existing capability pattern (`client/runtime/session.ts:50-71`).
- [MH3] Preserve both live map sources — acceptance: Darkwind MapData2 remains
  authoritative when a valid Current exists, generic `Room.Info` continues to
  learn a fallback map, and same-endpoint reconnect retains the last good map as
  stale until fresh authority or bounded fallback selection. The current source
  policy is explicit in `../../../public/js/live-map-source.js:42-107`.
- [MH4] Preserve MapData2 v2 transaction semantics and exact wire shapes —
  acceptance: numeric/string 52-bit room IDs, LDMud `0`/`1` booleans,
  context-only Current recovery, correlated pages, atomic commit on `complete`,
  reset/reflow/rate-limit recovery, Browse pagination, and exact Sync/Browse
  frames pass. The current outbound type incorrectly requires `area` even though
  context recovery omits it (`client/gmcp/contracts/darkwind-map-data-v2.ts:100-116`,
  `../../../public/js/map-data-v2.js:158-166`).
- [MH5] Reuse the current renderer, pan/zoom math, storage, and verified BFS —
  acceptance: the port does not duplicate their algorithms, but each mounted
  view owns its listener cleanup, center history, pan/zoom, and speedwalk
  lifecycle. Map rooms and controls become keyboard reachable; pointer/touch
  drag, Enter/Space speedwalk, recenter, zoom, and accessible status pass.
  Movement uses `Session.terminal.sendCommand()` one verified step at a time,
  not GMCP (`../../../public/js/map-speedwalk.js:112-202`).
- [MH6] Integrate fixed Map and transient Area Map workspace panels — acceptance:
  Map is user-toggleable and restores layout plus zoom; Area Map opens only from
  BrowseArea and clears on close/reset; hidden/disposed panels retain no
  listeners or timers. Pan remains a session view detail rather than durable
  world data, matching legacy behavior.
- [MH7] Own room image by room and async generation — acceptance: a changed
  `Room.Info.num` or disconnect immediately invalidates the image and any
  pending preload; a successful replacement swaps only for the same room;
  failure retains the previous image only within that room; alt text, refresh,
  loading state, accessible zoom dialog, focus restoration, mobile layout, and
  disposal pass. The existing protocol behavior is documented in
  `../../gmcp-darkwind-room-image.md:41-52`.
- [MH8] Model the live playlist contract rather than JSON-only examples —
  acceptance: `enabled`, permissions, and `can_remove` accept boolean or 0/1;
  room IDs accept number/string; empty current accepts the LDMud `0` sentinel;
  State replaces without opening; Open replaces and opens/focuses once; every
  Action carries current room/revision and every Report carries current entry
  identity (`../../gmcp-darkwind-room-playlist.md:13-127`,
  `../../../../darkwind-nextgen/codebase/secure/daemons/room_playlist_d.c:234-272`).
- [MH9] Keep playlist playback local, opt-in, and disposable — acceptance: the
  existing playlist core remains authoritative for normalization, clock offset,
  playhead, bounds, and drift; the new panel owns player generation, scheduled
  start, five-second drift timer, ready-report deduplication, volume/auto-join
  settings, and retryable YouTube loading. Inactive Dockview tabs preserve DOM;
  close, room departure, disconnect, and disposal stop playback and prevent late
  reports (`../../../public/js/room-playlist-core.mjs:1-74`,
  `../../../public/js/room-playlist-manager.js:303-519`).
- [MH10] Merge GMCP panel subscription deltas — acceptance: map, room-image, and
  prior Step 6 panel visibility coexist in one stored subscription mapping, and
  reconnect's full resend includes the aggregate. The current bus stores one
  complete mapping while `Session.information` sends only its own keys
  (`client/gmcp/bus.ts:179-200,322-344`,
  `client/runtime/information.ts:142-150`).
- [MH11] Preserve layout/storage ownership — acceptance: Map and Room Image are
  fixed, user-toggleable, persisted panels; Jukebox is fixed/restorable but
  default closed and routine State never reopens it; transient Area Map is not
  persisted. Existing map data/storage keys and playlist settings remain
  compatible; no application-state schema or second graph repository is added.
- [MH12] Replace all four parity rows with observed evidence — acceptance:
  focused/full Node, development/built Chromium, mobile Chromium, exact outbound
  capture, malformed input, storage/layout reload, reconnect, hidden-tab
  continuity, and disposal pass, followed by a live authenticated map/image and
  read-only playlist verification. Shared playlist mutation is performed live
  only in a private/test jukebox or with explicit user approval.

## Out of scope

- Room ambience, sound unlock, and general media controls — Step 10 owns them.
- IDE/CodeMirror, combat, tutorial, effects, Electron, Docker, default-root
  cutover, hosted certification, and legacy deletion — Steps 9-12 own them.
- A generic world-data framework or universal GMCP store — Step 8 extracts only
  the instance seams required by the retained map algorithms.
- Persisting the map pan offset — legacy persists zoom/layout, while pan is a
  current session view centered on live movement.
- The server's undocumented playlist `clear` moderator action — it is absent
  from the public protocol and current controls.
- Mutating a shared production jukebox merely to satisfy a test — automated
  fixtures prove Action/Report; live mutation requires a private/test room or
  explicit approval.

## Assumptions

- The existing map algorithms can be moved behind factory-owned state while
  thin singleton exports preserve legacy tests — if false: stop after Green PR
  1 and replan rather than introducing a second mapper.
- `serverProfile.worldKey` is the stable world-storage identity — if false: use
  the existing endpoint-derived key and document the mismatch before wiring
  durable storage.
- The live account can reach a room image and Center of Town for read-only
  playlist Open/State verification — if false: complete automated evidence but
  leave Step 8's live gate pending.
- The YouTube API can be replaced with a deterministic browser stub in automated
  tests — if false: test the player adapter directly and keep external network
  access out of the required gate.

## Risks

- Factory extraction regresses the mature legacy map — mitigation: preserve thin
  singleton wrappers and require all 93 retained baseline tests before the new
  capability begins.
- Shared graph writes leak session-local truth — mitigation: tests with two
  session views sharing one world verify isolated Current/live exits, browse,
  status, speedwalk, and disposal.
- A late image/player callback mutates a new room or disposed session —
  mitigation: room plus generation tokens and teardown assertions.
- Subscription updates hide unrelated panels — mitigation: merge explicit panel
  deltas in the bus and test Step 6 plus Step 8 keys across reconnect.
- A stale playlist revision mutates shared state — mitigation: every named action
  derives room/revision from the current validated snapshot; automated fixtures
  assert exact frames and fresh State replacement.

## Dependency-ordered Green PRs

### Green PR 1 — Retained map factory extraction

**Owned files:** retained `public/js/map-data-v2*`, `map-data-gmcp*`,
`live-map-source*`, `map-renderer*`, `map-speedwalk*`, `map-pan.js`, and their
focused map tests only.

**Intent:** Move global state into the smallest dependency-injected world/session
factories, returning listener disposers where needed. Keep existing exports as
legacy singleton wrappers and reuse all algorithms and storage formats.

**Verify:** the 93-test retained baseline plus new two-instance isolation,
listener cleanup, and no-global-GMCP/DOM-owner tests.

**Done when:** legacy behavior is unchanged and a new client controller can own
map state without importing legacy GMCP, DOM state, or compatibility lifecycle.

### Green PR 2 — Contracts and `Session.world`

**Owned files:** `client/gmcp/contracts/darkwind-map-data-v2.ts`, one new
room-image/playlist contract, validators, GMCP bus, new
`client/runtime/world.ts`, session/factory wiring, and focused session/bus/
contract tests.

**Intent:** Freeze the validated snapshot, typed outbound helpers, world-key
injection, merged subscriptions, reconnect rules, and disposal boundary.

**Verify:** valid/malformed live-shape fixtures, exact Sync/Browse/Action/Report,
two-session world/view ownership, subscription coexistence, reconnect, and
diagnostic baseline after disposal.

**Done when:** Svelte needs only the public capability and its types.

### Green PR 3 — Map hydration and navigation panels

**Owned files:** new map/area-map Svelte components and map-specific component
tests. Shared workspace files remain root-owned.

**Intent:** Reuse the retained renderer, pan/zoom, and BFS through
`Session.world`; add accessible room tiles/controls and per-view cleanup.

**Verify:** hydration, generic fallback, atomic updates, browse, pan/zoom,
click/keyboard speedwalk, cancellation, resize, mobile, and teardown.

**Done when:** Map and Area Map are independently mountable through the frozen
renderer contract.

### Green PR 4 — Room image panel

**Owned files:** one new room-image component and focused component tests only.

**Intent:** Implement room-tokened preload/replacement, refresh, alt text, and a
local accessible zoom dialog using existing CSS classes.

**Verify:** room transition, stale success/error, failure retention, dialog
focus/Escape/backdrop, reconnect, mobile, and destroy.

**Done when:** the panel needs no internal session handle or shared overlay host.

### Green PR 5 — Room playlist panel/player

**Owned files:** one new playlist component/player adapter and focused tests;
reuse `room-playlist-core.mjs` and `room-playlist.css`, not the legacy manager.

**Intent:** Implement State/Open presentation, named actions/reports, opt-in
YouTube lifecycle, settings, drift, hidden-tab continuity, and teardown.

**Verify:** deterministic YT stub covers future start, seek, pause/resume,
ready/ended/error, loader retry, autoplay block, permissions/reorder, room
departure, close/reopen, reconnect, hidden tab, and disposal.

**Done when:** all player resources are panel/session-owned and late callbacks
cannot send.

Green PRs 3-5 may run in parallel only after Green PR 2 freezes the public
interface. Their writers own disjoint new files. Green PR 1 precedes Green PR 2.

### Green PR 6 — Workspace integration and exit evidence

**Root-owned files:** `WorkspaceHost.svelte`, Phase 2 HTML/CSS registration,
Playwright configuration/fixture, one integrated Step 8 browser spec, master
plan/parity/completion records, and any minimal workspace persistence wiring.

**Intent:** Register fixed/transient panels, desktop/mobile controls, open-versus-
state behavior, layout restoration, subscriptions, integration cleanup, and
development/built/live proof.

**Verify:** focused Node; `npm test`; `npm run check`; lint; format; build;
development and built desktop/mobile Step 8 fixture; full development browser
regression; typecheck baseline comparison; both diff checks; authenticated live
map/image/playlist inspection.

**Done when:** all four parity rows are replaced by observed evidence and the
user is asked for Step 8 commit permission. Do not begin Step 9 before approval.

## Shared-file ownership

The orchestrator alone edits `client/gmcp/contracts/validators.ts`,
`client/gmcp/bus.ts`, `client/runtime/session.ts`,
`client/runtime/session-factory.ts`, `client/workspace/WorkspaceHost.svelte`,
Playwright configuration, the integrated E2E fixture, and Phase 2 plan/parity
documents. No concurrent writer receives those files.

## Success criteria

- [x] Retained map factories preserve all legacy algorithms/tests and isolate
      world data from session view state.
- [x] `Session.world` is the only new public capability and leaks no internal
      handles.
- [x] MapData2, Room.Info fallback, room image, and playlist live shapes validate
      while malformed frames cannot mutate new state.
- [x] Sync, Browse, playlist Action/Report, movement commands, and media refresh
      have exact direction/payload evidence.
- [x] Map, Area Map, Room Image, and Jukebox pass layout, focus, mobile,
      reconnect, hidden-state, and disposal evidence in development and built
      web.
- [x] All four `P2-8-*` rows are replaced; Electron/release proof remains Step 12.
- [x] A live authenticated connection verifies the added surfaces before commit
      permission is requested.

## Rollback

Legacy `/`, singleton wrappers, renderer/playlist cores, styles, map storage,
playlist settings, and legacy panels remain intact. Revert the Step 8 commit and
use legacy `/` if the live gate fails. Do not delete or migrate map data during
Step 8.

## Execution fit

- Scope: multi-run phase
- Lead: Sol at high reasoning — owns public contracts, sequencing, integration,
  live verification, rollback, and commit gate.
- Workers: one high-reasoning map-core implementer, then up to three bounded
  component/capability implementers with disjoint ownership.
- Delegation shape: staged handoff; Green PR 1, then Green PR 2, then parallel
  Green PRs 3-5, followed by root integration.
- Ownership: root reviews every returned diff and personally owns shared files,
  final verification, live proof, and user conclusions.
- Replan trigger: retained factories cannot preserve the 93-test baseline, a
  Svelte component needs an internal handle, actual live payloads fail the
  frozen validator, or a private/read-only live playlist boundary cannot satisfy
  the exit evidence.
- Confidence: medium — protocols and mature algorithms are well evidenced, but
  the map singleton extraction and external player lifecycle are consequential.

Plan self-review: PASS (9/10)

notes:

- Every must-have maps to one Green PR or the final evidence gate.
- The plan reuses existing storage, algorithms, renderer, math, pathfinding,
  playlist core, styles, workspace, and session lifetime; it adds no dependency
  or general framework.
- Parallel writers are limited to disjoint new components after the public API
  is frozen.
