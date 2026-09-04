# Phase 2 Step 12 — Legacy look and feel

_Plan stress-tested via focused adversarial review. Eight findings surfaced;
six survived independent recheck._

## Planning selection

- Mode: detailed implementation plan for the complete Step 12 horizon.
- Complexity: 8/10 — shell geometry, Dockview behavior, persistence, mobile,
  accessibility, and visual evidence cross lifecycle-sensitive boundaries.
- Status: **PLANNED — WAITING FOR USER AUTHORIZATION**. This document does not
  authorize Step 12 implementation.
- Base: `bff841e` (`Phase 2 Step 11: port combat and specialty surfaces`).
- Depends on: Steps 1–11 complete and committed.
- Current horizon: presentation and workspace behavior only. Step 13 retains
  production cutover and release certification.
- Evidence horizon: retained panel manager/CSS/settings, current Dockview
  adapter/host/persistence, and existing Node/browser fixtures.
- Adversarial review: focused — terminal identity, layout persistence, responsive
  transitions, and untrusted panel geometry are the regression boundaries.

## Goal

Make `/phase2/` look and behave like the default legacy Darkflow workspace:

- a full-height client shell;
- a terminal-centered classic layout with fixed left and right information rails;
- selected workspace panes floating above that base layout;
- dense themed pane chrome and familiar defaults;
- reliable float, dock, resize, focus, restore, and responsive behavior.

Keep Dockview as the workspace engine. Do not recreate the legacy panel manager,
expose Dockview handles to Svelte components, or add a second functional owner for
any Step 2–11 surface.

## Corrections to the original roadmap

| Original claim                                                    | Repository-backed correction                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy is a full-window floating workspace.                       | The saved default is the **classic hybrid**: terminal center, 260px left/right rails, and selected floating panes. The optional all-floating profile is a separate legacy setting, not the default.                       |
| Every migrated panel can close, dock, float, resize, and restore. | Controls differ by panel class. Terminal is never closable; launcher panels may be hidden rather than tab-closed; session-owned panels have domain close rules; transient panels are intentionally excluded from restore. |
| Room, Enemy, Chat, Connection, and others are missing.            | Enemy is ported. Connection Health is a semantic replacement, not the legacy Connection pane. The remaining functional inventory gaps are **Room and Chat**.                                                              |
| Map and Room Image are a durable pair.                            | Pairing is initial placement only: Room Image begins 8px below Map and does not follow later Map movement.                                                                                                                |
| Current mobile behavior is already the desired sheet model.       | The current sheet manipulates the live Dockview workspace and its touch test proves mobile dragging changes desktop persistence. Legacy mobile temporarily presents one panel and does not save mobile geometry.          |
| Theme work is missing.                                            | Theme selection, persistence, and root application already exist. Step 12 needs scoped Dockview/pane styling and retained background presets; terminal ANSI/game colors remain unchanged.                                 |
| Screenshot baselines already exist.                               | There are no current Playwright screenshot assertions. Step 12 must create and stabilize its own small baseline set.                                                                                                      |

Primary evidence:

- Legacy default/layout profiles and persistence:
  [`public/js/settings-manager.js`](../../../public/js/settings-manager.js),
  [`public/js/panel-manager.js`](../../../public/js/panel-manager.js), and
  [`public/css/panels.css`](../../../public/css/panels.css).
- Legacy pane defaults:
  [`public/js/panel-defs.js`](../../../public/js/panel-defs.js).
- Current product inventory and mobile sheet:
  [`client/workspace/WorkspaceHost.svelte`](../../../client/workspace/WorkspaceHost.svelte).
- Vendor-neutral boundary and Dockview implementation:
  [`client/workspace/workspace.ts`](../../../client/workspace/workspace.ts) and
  [`client/workspace/dockview-workspace.ts`](../../../client/workspace/dockview-workspace.ts).
- Current workspace evidence:
  [`e2e/phase2-workspace.spec.ts`](../../../e2e/phase2-workspace.spec.ts) and
  [`e2e/workspace-lifecycle.spec.ts`](../../../e2e/workspace-lifecycle.spec.ts).

## Frozen target

### Desktop shell and base layout

- The application fills `100dvh` with compact product chrome, a flexible
  workspace, command input, and status/footer layers. The current padded demo
  card, large tagline, `60vh` workspace cap, and developer panel button rack are
  removed.
- The initial desktop layout is the legacy **classic hybrid**, not an all-floating
  canvas:
  - Terminal occupies the flexible center.
  - Left rail is 260px and initially contains Avatar, Status, Vitals, Guild
    Vitals, Sky, Omens, Buffs, Worth, XP Monitor, and Stats in that order.
  - Right rail is 260px and initially contains Group, Inventory, Quests, and
    Achievements; Cyberware is available but initially hidden.
  - These persistent panel containers exist from the fresh layout and render
    their current empty/loading state until data arrives. Data arrival does not
    insert a new group or shift saved geometry.
  - Map and Room Image use legacy floating defaults. Missing functional content
    such as Room/Chat is never replaced with a fake panel.
- At widths from 701px through 939px, use a compact desktop layout: Terminal
  remains at least 420px wide, both rail contents remain launcher-accessible, and
  at most one 260px rail is expanded at a time. At `<=700px`, use the mobile
  sheet. Compact rail selection is presentation-only: capture the >=940px layout,
  suppress persistence, and restore it on return. This avoids an undefined
  701–939px layout without corrupting normal desktop geometry.
- Existing compact app connection/status controls remain the semantic owner of
  connection state. Step 12 does not add a duplicate legacy Connection panel.

### Pane behavior by class

| Class                          | Open/close policy                                                                  | Dock/float/resize policy                                                                 | Persistence policy                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Terminal                       | Always present; no Close or Collapse                                               | Keyboard- and pointer-operable dock/float; minimum 420×260                               | Preserve one DOM island through in-session moves, restore, reset, and responsive transitions                     |
| Persistent launcher panels     | Launcher controls visibility; close hides when allowed                             | Dock, float, resize, and accessible Collapse; ordinary minimum 200×80                    | Restore visibility, placement, size, collapse, and selected panel state                                          |
| Session-owned transient panels | Existing domain owner decides open/close; exact outbound close remains single-shot | Honor server/domain placement/resize; local Collapse where the retained owner permits it | Never restore stale IDE, Enemy, Fishing, Area Map, or server-window instances; do not persist transient collapse |
| Mobile sheet                   | One active panel; no desktop drag/resize controls                                  | Sheet selection only                                                                     | Must not write desktop geometry                                                                                  |

### Floating defaults and exceptions

| Pane       |                       Default size | Placement                        | Initial state                   |
| ---------- | ---------------------------------: | -------------------------------- | ------------------------------- |
| Map        |                            400×350 | right/top                        | visible when available          |
| Room Image |                            400×225 | right, initially 8px below Map   | visible when available          |
| Area Map   |                            400×350 | left/top                         | hidden until requested          |
| IDE        |                            900×620 | centered, foreground class       | transient/hidden                |
| Fishing    |                            420×500 | centered                         | transient/hidden                |
| Jukebox    |                            440×560 | left/bottom                      | hidden until available          |
| Enemy      | Step 11 active-combat size 580×465 | centered and raised while active | transient/hidden outside combat |

The legacy Chat default is 750×370 at right/bottom, but Step 12 cannot render it
until a public Phase 2 content owner exists. The legacy Connection default is not
copied because Phase 2 already owns connection state in app chrome and the
Connection Health panel.

### Pane chrome and mechanics

- Reuse existing `--df-*` theme variables. Scope Dockview overrides to the Phase 2
  workspace; do not modify terminal ANSI/game colors.
- Match the observable legacy density: 1px themed border, 6px radius, compact
  uppercase title, small accessible controls, themed body/scrollbars, and clear
  focus-visible treatment.
- Prefer Dockview-native drag, resize, redock, active-float raising, accessible
  dialog naming, and serialization. Add policy only where an executable parity
  test shows a gap.
- Required movement behavior:
  - keep panes within usable viewport bounds;
  - support 30px viewport-edge and dock-zone intent;
  - support optional 16px movement grid, default off;
  - provide visible dock/snap feedback;
  - keep resize minimums enforced.
- Collapse keeps the header/control surface available, is hidden on mobile, and
  restores only for persistent launcher panels. Terminal never collapses.
- Pane-to-pane alignment snap, resize-grid snap, and configurable numeric layers
  are later Step 12 refinements only if native behavior fails the frozen
  scenarios. Do not build a speculative z-order manager. Active Enemy remains the
  one explicit auto-front exception.

### Theme and background

- Preserve the existing theme selector and `darkwind-client-settings` storage.
- Reuse the retained local background catalog and application logic rather than
  creating a second catalog or storage key.
- Add only the missing Phase 2 background surface and settings control.
- Preserve unknown settings keys and existing audio/visual preferences.

### Mobile

- At `<=700px`, desktop rails and floating controls are unavailable. The existing
  accessible sheet is a selector; it activates one panel in the preserved
  workspace and never reparents panel content into the modal.
- Entering mobile captures the current desktop workspace state in memory,
  suppresses layout writes, and permits selection without rewriting geometry.
- Returning to desktop restores the captured desktop workspace. Reload while
  mobile uses the last persisted desktop layout.
- Escape, backdrop, focus return, reduced motion, and disposal behavior remain
  covered.

## Ownership boundaries

- `client/workspace/workspace.ts` remains the vendor-neutral contract. If an
  explicit float/dock command is required, it uses the existing
  `PanelPlacement` vocabulary and exposes no Dockview group, overlay, or location
  object.
- `client/workspace/dockview-workspace.ts` remains the sole Dockview-aware product
  implementation. Its inspector stays test/diagnostic-only.
- `WorkspaceHost.svelte` owns product inventory, default placement,
  persistent/transient classification, mobile presentation, and storage timing.
- `App.svelte` owns app chrome and root-level theme/background application.
- Panel components continue consuming only public `Session` capabilities and
  narrow panel state. Step 12 adds no GMCP, socket, transport, resource-scope,
  storage, compatibility, or legacy-manager handle to Svelte.
- Step 11 continues to own Enemy, Tutorial, Visual Effects, and Street Samurai
  data/lifecycle. Step 12 may style or place those surfaces but must not create a
  second reducer, controller, or protocol owner.
- Step 13 owns production-root cutover, full immutable-candidate certification,
  and legacy deletion decisions.

## Inventory boundary

At `bff841e`, the Phase 2 workspace owns all legacy information/world/specialty
definitions except Room and Chat. They are **explicit Step 12 exclusions**, not
unknown work. Step 12 records the exclusions and does not smuggle new functional
capabilities into a presentation step. Before Step 13, they require either a
separately approved functional slice with narrow public Session owners or an
explicit Phase 2 product-parity waiver.

Room may be able to render from the existing `Session.world.room` snapshot after
a bounded implementation audit. Chat requires a real output/channel ownership
decision and must not be inferred from terminal DOM.

## Must-have outcomes

| ID   | Outcome                   | Exit condition                                                                                                                                                                 |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MH1  | Full-height product shell | Desktop app uses the full viewport without the demo card/button rack; terminal, command input, overlays, and status layers remain usable at normal/narrow widths               |
| MH2  | Classic hybrid default    | A fresh layout opens terminal center with the frozen rails/default ordering and selected floating panes; no placeholder panel remains                                          |
| MH3  | Durable terminal          | One terminal island retains identity, buffer, focus intent, scroll state, and exactly-once disposal through every in-session workspace operation                               |
| MH4  | Accessible pane mechanics | Pointer and keyboard users can open, focus, collapse, float, dock, resize where allowed, and close/hide according to panel policy; controls are labelled and focus is restored |
| MH5  | Geometry and overlap      | Defaults, minimums, viewport clamp, native active-front, and Enemy auto-front pass; no custom layer system is added without failing evidence                                   |
| MH6  | Correct persistence       | Persistent panels restore; malformed data recovers; transient panels do not restore; one retained legacy fallback remains untouched                                            |
| MH7  | Responsive isolation      | Compact-rail and mobile-sheet selection never mutate persisted desktop geometry; desktop state returns after responsive transitions and reload                                 |
| MH8  | Themed presentation       | Darkflow pane/Dockview chrome follows existing themes and retained backgrounds; ANSI/game colors do not change                                                                 |
| MH9  | Honest inventory          | Every presented panel has one existing Phase 2 owner; Room/Chat remain explicit gaps until separately resolved                                                                 |
| MH10 | Integrated evidence       | Stable semantic and screenshot evidence passes in development and built Chromium/mobile, then the full supported development matrix and authenticated live gate pass           |

## Out of scope

- Browser or OS pop-out windows.
- Replacing Dockview or importing Dockview types into product Svelte components.
- Reusing live state from `darkwind-panel-state`; it remains rollback data only.
- A second panel manager, geometry engine, z-order stack, or generic media/window
  framework.
- Functional Room or Chat ownership without separate approval.
- Exact reproduction of legacy implementation quirks: cloned drag ghosts, native
  resize grips, same-layer non-MRU ordering, stale off-screen geometry after
  viewport shrink, relational Map/Image anchors, or broken dynamic redock paths.
- Legacy per-pane font family/weight/size and numeric layer customization. Default
  pane typography and active-front behavior are in scope; add customization only
  if the user requests control parity after the core layout passes.
- Production cutover, deletion of legacy owners, and immutable release
  certification; those remain Step 13.

## Decision gates

### Frozen now

- Target the legacy default **classic hybrid** layout. Do not implement the
  optional all-floating profile in the first Step 12 pass. Add it only after the
  default parity gate if the user explicitly requests it.
- Mobile does not persist desktop geometry.
- Native Dockview active-front behavior is sufficient unless the overlap fixture
  disproves it.
- Map/Room Image pairing is initial placement only.
- Connection Health/app chrome remains the connection-state replacement.
- Keep Dockview snapshot version 1. Existing preview users use the current Reset
  workspace action once to adopt the new default; Step 12 does not add a storage
  migration merely to force a reset.
- Room and Chat are documented Step 12 exclusions. Step 13 cannot silently treat
  them as replaced.

### Future expansion gates

1. **Automatic layout migration.** Add only on explicit request, with an additive
   preservation schema and recovery/rollback tests. Rejecting snapshot version 1
   is not a migration.
2. **Room and Chat.** Resolve in a separately approved functional slice or grant
   an explicit parity waiver before Step 13.
3. **Optional all-floating profile.** Add only on explicit request after MH1–MH8;
   it is not necessary to reproduce the legacy default the user identified.

## Dependency-ordered implementation slices

Do not begin a slice until the preceding exit conditions pass. Each slice is one
reviewable Green PR candidate; the user approves any commit separately.

### Green PR 1 — Freeze the behavior and visual baseline

**Outcome:** Turn this plan into executable evidence without changing product behavior.

**Owned files:** new Step 12 parity/behavior matrix, one new
`e2e/phase2-look-and-feel.spec.ts` scaffold and its screenshot baselines, and
Playwright config entries only after the spec is stable.

**Work:**

- Record each panel's owner, class, initial visibility, placement/size, controls,
  persistence, mobile behavior, and intentional exclusions.
- Capture legacy and Phase 2 reference states at fixed 1440×900, 1024×768,
  800×800, and 390×844 viewports using deterministic fixture content.
- Add semantic geometry assertions before screenshots. Disable animations and
  mask only proven nondeterminism.
- Record the existing terminal, persistence, transient, and mobile behavior
  before product changes.
- Add a test-only adapter experiment that builds two ordered 260px multi-pane
  rails plus the center Terminal, exercises rail overflow, floats and redocks one
  rail panel, and proves Terminal identity. Use only the current vendor-neutral
  placement contract.

**Exit:** matrix has no unknown owner except the documented Room/Chat exclusions;
snapshots are stable across two runs; the adapter experiment proves the classic
rail structure without a vendor leak. If it fails, stop and replan the shell
architecture before PR 2. The current focused 50/50 panel/layout/background/
theme/persistence baseline remains green; no production file changes.

### Green PR 2 — Full-height shell and classic base layout

**Outcome:** Replace the demo shell with the frozen desktop structure.

**Root-owned shared files:** `client/app/App.svelte` and
`client/workspace/WorkspaceHost.svelte`.

**Disjoint worker files after markup freezes:** scoped workspace/Dockview CSS and
focused shell/layout assertions.

**Work:** make the app a `100dvh` column; remove the demo subtitle, placeholder,
height cap, and button rack; create terminal center plus frozen rails/order; move
panel launching into compact chrome; preserve Zork-only, overlays, focus, and
existing app controls.

**Exit:** MH1 and structural MH2 pass at all four target viewports, including the
800px compact single-rail policy; existing shell, terminal, settings,
notifications/audio, and specialty specs remain green; one terminal island
survives create/reset; no Dockview handle leaks into Svelte.

### Green PR 3 — Pane chrome and explicit mechanics

**Outcome:** Existing Phase 2 panels look and behave like Darkflow panes.

**Root-owned shared files:** `client/workspace/workspace.ts` only if one
vendor-neutral command is proven needed, `client/workspace/dockview-workspace.ts`,
and `WorkspaceHost.svelte` integration.

**Disjoint worker files:** scoped Dockview/pane CSS and adapter/interaction tests.

**Work:** apply compact themed chrome; add labelled keyboard
collapse/float/dock actions where policy permits; retain authoritative close
guards; enforce minimums and viewport bounds; add the smallest movement
snap/feedback policy supported by the adapter; prove native active-front and
Enemy priority. Collapse keeps the header usable and never remounts panel content.

**Exit:** MH3–MH5 pass for Terminal, a persistent panel, server window, IDE,
Enemy, and world panel; directions are exact/single-shot; 25 mount/dispose cycles
remain leak-free; screenshots no longer show stock Dockview.

### Green PR 4 — Defaults, persistence, and responsive isolation

**Outcome:** Layout survives reload and responsive use without stale transients or
mobile geometry corruption.

**Root-owned shared files:** `WorkspaceHost.svelte`, `persistence.ts` only for the
approved reset policy, and `dockview-workspace.ts` only for a proven gap.

**Work:** apply frozen defaults to owned panels; keep Room/Chat absent; preserve
transient save suppression and authoritative close; keep snapshot version 1 and
apply the new default through fresh state or Reset workspace; persist collapse
only for persistent launcher panels; capture/suppress/restore desktop state
around compact and mobile presentation.

**Exit:** MH2/MH6/MH7 pass across fresh load, reload, reset, malformed storage,
desktop→800px→desktop, desktop→mobile→desktop, compact/mobile reload, and
transition disposal; transients never resurrect; stored bytes do not change from
compact- or mobile-only selection.

### Green PR 5 — Theme, backgrounds, and panel-specific presentation

**Outcome:** Existing surfaces share one Darkflow presentation without domain changes.

**Root-owned shared files:** `App.svelte`, `SettingsDialog.svelte`, settings
integration, and placement-only `WorkspaceHost.svelte` changes.

**Disjoint worker files:** background presentation/style, bounded pane styles, and
focused theme/background tests.

**Work:** reuse retained backgrounds and `darkwind-client-settings`; map existing
variables into scoped chrome; preserve unknown settings; add only capability-backed
Map controls and placement/bounds/priority polish; do not port Room/Chat data or
style terminal ANSI.

**Exit:** MH8/MH9 pass across themes/backgrounds/reduced motion/forced colors and
all target widths; the completion record names Room/Chat as Step 12 exclusions
and Step 13 blockers absent a separate decision; settings never remount
terminal/panels; built assets stay local.

### Green PR 6 — Integrated evidence and completion record

**Outcome:** Certify Step 12 without performing Step 13 cutover.

**Root-owned:** test/config integration, final diff review, master/parity/plan/
completion reconciliation, live gate, and commit-permission gate.

**Exit:** focused and full Node, check/lint/format/diff, build/artifact, development
and built Chromium/mobile, full development browser matrix, and targeted packaged
Electron smoke pass. Authenticated live `/phase2/` verifies terminal continuity,
launcher/sheet, allowed float/dock/resize/close, theme/background switch, reload,
and transient close/reopen. Reset uses a disposable character profile; without
one, it remains pending unless the user explicitly approves losing that profile's
saved Phase 2 geometry. Capture and restore the prior theme/background settings.
Evidence does not claim Room/Chat, optional all-floating mode, unrun browsers, or
Step 13 certification.

## Writer boundaries

- Root alone writes `workspace.ts`, `dockview-workspace.ts`, `WorkspaceHost.svelte`,
  `App.svelte`, persistence, Playwright config, and final evidence docs in their
  integration windows.
- Concurrent workers own only disjoint new tests/snapshots, scoped CSS, or one
  bounded style component after markup/API freezes.
- Every returned diff is reviewed before integration. A dependent Green PR does
  not start until the preceding exit passes.

## Verification

Use Node `22.15.0`. Exact counts are recorded evidence, not frozen expectations.

```sh
node --test --test-concurrency=1 \
  test/panel-manager-layout.test.mjs \
  test/panel-snap-bounds.test.mjs \
  test/background-manager.test.mjs \
  test/theme-manager.test.mjs \
  test/workspace-persistence.test.mjs

npm run check
npm run lint
npm run format:check
git diff --check
npm test
npm run build
npm run verify:client-artifact

npm run test:browser -- e2e/phase2-look-and-feel.spec.ts \
  --project=chromium --project=mobile-chromium
npm run test:browser:production -- e2e/phase2-look-and-feel.spec.ts \
  --project=chromium --project=mobile-chromium
npm run test:browser
npm run desktop:smoke
npm run desktop:pack
npm run desktop:smoke:packaged
```

If a repository script does not accept that positional spec filter, use the
equivalent existing Playwright config invocation; do not change scripts to match
this document.

## Assumptions

- Dockview 7 remains the engine. If false, stop: replacement is a separate architecture phase.
- The target is the default classic hybrid. If immediate optional all-floating
  support is required, expand the matrix before Green PR 2.
- Existing `--df-*` variables/background assets remain available. If false, stop
  that styling slice and inventory the missing source rather than inventing it.
- Room/Chat are not required to begin presentation work. If either becomes a
  Step 12 exit, pause before Green PR 5 and approve a functional owner.
- Authenticated live access and a disposable character profile will be available
  for the Reset gate. If false, run the non-destructive live checks and leave Reset
  pending unless the user explicitly approves losing the saved Phase 2 geometry.

## Risks and mitigations

- **Terminal remount/data loss:** retain `always`/`reuseExistingPanels`; assert
  identity, buffer, focus, scroll, and exactly-once disposal at every transition.
- **Compact/mobile views corrupt desktop layout:** capture normal desktop state,
  suppress writes in both responsive modes, restore on return, and compare stored
  bytes.
- **Saved previews hide the new default:** keep snapshot version 1 readable and
  make Reset workspace explicit in the evidence path; do not force migration.
- **Dockview CSS drifts:** scope overrides and pair small screenshots with semantic geometry.
- **Server geometry escapes viewport:** retain contract validation and clamp only at adapter placement.
- **Presentation changes protocol lifecycle:** use public Session only and rerun exact-direction/reconnect/disposal fixtures.
- **Pixel baselines become noisy:** freeze fixtures/viewports/fonts, disable animation,
  and mask only proven nondeterminism.
- **Missing functionality leaks into Step 12:** retain the Room/Chat gate.

## Rollback

- Keep legacy `/`, managers/CSS, `darkwind-panel-state`, and local assets untouched.
- Keep the version-2 character envelope and its one legacy fallback readable.
- Each Green PR is independently revertible to `bff841e` behavior without protocol
  or legacy-data changes.
- Step 12 does not change the Dockview snapshot version. Any future approved
  migration must preserve previous bytes without deleting, nesting, or rewriting
  legacy storage accidentally.
- Step 13 alone may cut over or remove rollback owners.

## Success criteria

- [ ] MH1 full-height shell.
- [ ] MH2 classic hybrid default.
- [ ] MH3 terminal identity/lifecycle.
- [ ] MH4 accessible pane mechanics.
- [ ] MH5 geometry/bounds/overlap/Enemy priority.
- [ ] MH6 persistence/recovery/transient exclusion.
- [ ] MH7 compact/mobile responsive isolation.
- [ ] MH8 theme/background consistency.
- [ ] MH9 honest inventory and explicit Room/Chat Step 12 exclusions.
- [ ] MH10 development, built, full-browser, package, and live evidence.
- [ ] Step 13 remains unstarted.

## Execution fit

- Scope: multi-run Step 12 with six dependency-ordered Green PR candidates.
- Lead: Claude Opus as the orchestrator at high reasoning effort (xhigh at the
  Green PR 1 rail experiment and Green PR 3 mechanics) — shell/adapter/persistence
  integration and evidence live in the main session, not a subagent.
- Workers: bounded Claude subagents via the Agent tool (Sonnet for disjoint
  tests/snapshots, scoped CSS, and docs after contracts freeze; Haiku only for
  mechanical file sweeps). Use `Explore` for read-only inventory and the
  `build-code` skill for implementer handoffs. Each subagent gets one disjoint
  file set and returns a diff; no subagent writes a root-owned shared file.
- Delegation shape: staged handoff; parallel subagents only on disjoint files.
  Prefer a `Workflow` fan-out only if the user opts into multi-agent orchestration;
  otherwise sequential Agent calls with the orchestrator integrating each diff.
- Ownership: the orchestrator (main session) owns shared integration, returned-diff
  review, live verification, completion reconciliation, and every
  commit-permission gate.
- Replan triggers: the rail experiment cannot express the classic layout without
  a Dockview leak; screenshots need broad masking; Room/Chat or per-pane
  customization become Step 12 exits; or optional all-floating is requested.
- Confidence: high on ownership; medium on rail composition and exact snap until
  the Green PR 1 experiment passes.

Plan self-review: **PASS (9/10)**

Room/Chat and optional all-floating/per-pane customization are deliberately not
hidden inside the implementation plan. Their expansion gates are explicit.

## Rail-group spike findings (2026-08-17)

**Verdict: use option 3 (`RailPanel`).** The subclass can render a scrolling
rail and retains native drag-out, but Dockview cannot natively derive a vertical
card insertion index when a panel returns to the rail. Adding that gesture to
the subclass would duplicate the custom drop work option 3 already requires.

### Probe results

- **S1 passed for the public injection seam.** `DockviewComponent` was
  constructible and `createGroup` was overridable; marker attributes reached
  every group, the focused workspace serialization/recovery tests passed, and
  check, lint, format, build/artifact, and the 681-test Node suite passed. One
  plan detail was stale: `dockview` does not export `GroupOptions` by name, so
  the spike derived the public parameter type from
  `DockviewComponent["createGroup"]` instead of importing a private declaration.
- **S2 passed, but required two public event interceptions plus DOM takeover.**
  Tagged groups were created through public `api.addGroup` calls with
  `rail-left` and `rail-right` ids. The subclass listened to
  `group.model.onDidAddPanel` and `onDidActivePanelChange`, then re-appended every
  public `panel.view.content.element` in panel order. It made the public content
  container a vertical overflow scroller, overrode Dockview's active-panel
  height, hid the stock strip, and reparented each existing `.dv-tab` wrapper as
  the corresponding card header. All ten left-rail panels rendered in document
  order inside one scrolling group without patching a private field.
- **S3 failed at return-drop ordering.** Native pointer drag moved a reparented
  card out of the rail into the main grid. A generic center-zone drop could also
  put it into the opposite tagged group and stock serialization restored that
  membership. However, dropping on a particular vertical card header did not
  resolve, and dropping on the group supplied no pointer-derived vertical index.
  Dockview's tab reorder listener remains on the original tabs-list element and
  computes insertion from horizontal `clientX`; reparenting the tab wrappers
  does not move that listener or change its axis. Passing S3 would therefore
  require a custom vertical hit test and explicit indexed move.

### Option 3 drag consequence

Keep each rail as one ordinary Dockview `RailPanel` and its cards as Svelte
content. Float-out and return must use one bounded custom pointer/keyboard
gesture: hit-test the vertical card headers, preserve the panel id, destroy and
recreate the panel at the requested Dockview location, and insert it at the
pointer-derived rail index. Do not retain the `DockviewComponent` subclass; it
adds private-DOM coupling without removing this custom gesture.

## Standalone Scrollview spike findings (2026-08-17)

**Technical verdict: viable, but not yet an adoption pass.** A standalone root
kept content-height rails and completed rail-to-main, main-to-rail, and
rail-to-rail transfers with the terminal island unchanged. The throwaway also
showed that adoption changes the coordinate, persistence, mobile, and pane-chrome
boundaries broadly enough that it must be a planned Green PR rather than a rail
component swap. The strict spike gate remains open because the scrolled-column
case was not explicitly driven and the full browser matrix was red.

### Probe results

- **S0 passed through native HTML5 data, not Dockview's private transfer writer.**
  `dockview-core/dist/esm/dnd/dataTransfer` is blocked by the package `exports`
  map (`ERR_PACKAGE_PATH_NOT_EXPORTED`). A custom
  `application/x-darkflow-scrollview-panel` payload reached the public
  `api.onUnhandledDragOver` event; calling `accept()` rendered Dockview's native
  overlay, and `api.onDidDrop` exposed the same payload through
  `nativeEvent.dataTransfer`. No package patch or private import was required.
- **S1's rendering question passed.** The left root rendered all ten frozen rail
  panels in document order as `flex: 0 0 auto` cards under one `overflow-y: auto`
  scroller, including cards below 100px, while reusing the existing Svelte
  renderer rather than copying it. The production regression half of S1 did not
  pass; see the integration result below.
- **S2 passed.** An HTML5 rail card activated Dockview's native overlay and was
  recreated in the selected Dockview group with the same product panel id, kind,
  title, and state owner. The Svelte content remounted; the terminal did not.
- **S3 passed all three transfer directions and the unscrolled vertical index.**
  The Scrollview root read Dockview's public `getPanelData()` during the pointer
  drag, calculated the index from its own card rectangles, and handled the drop
  before Dockview cleared the process-wide payload. The explicit
  non-zero-`scrollTop` case was missed, so this is not the plan's complete S3
  pass even though the owned-DOM algorithm is scroll-coordinate independent.
- **S4 passed focused persistence and recovery.** Reload restored a panel moved
  into the non-default opposite rail, and the existing two malformed-layout
  scenarios stayed green. The spike required `WorkspaceSnapshot` to change; all
  runtime and test changes were then removed as required.

### Required public surfaces and snapshot shape

The working path depended on public `dockview` exports/events only:
`getPanelData`, `DockviewApi.onUnhandledDragOver`,
`DockviewUnhandledDragOverEvent.accept`, `DockviewApi.onDidDrop`,
`DockviewApi.addPanel`/`removePanel`, and ordinary panel/group accessors. Outbound
rail drags used HTML5 `DataTransfer`; inbound Dockview drags used a capture-phase
`pointermove`/`pointerup` listener owned by Scrollview. Production work must add a
keyboard-equivalent transfer before claiming accessibility parity.

The minimum composite contract was:

```ts
{
  version: 2,
  layout: {
    dockview: unknown,
    scrollviews: Record<"left" | "right", string[]>,
  },
}
```

Version 1 remained readable as one legacy Dockview tree. Version 2 stored one
Dockview tree plus ordered panel-id trees for the left and right roots. This is a
real vendor-neutral contract change, not an adapter-only detail.

### Integration result

Focused Scrollview, save/reload, and malformed-recovery tests passed. `npm run
check`, lint, format check, production build/artifact verification, and all
681 Node tests passed. The full Chromium/mobile matrix finished **89 passed, 13
skipped, 9 failed**. Failures exposed four adoption tasks:

1. Floating/default bounds must use the center Dockview host rather than the old
   full workspace host; IDE and restored server-window geometry shifted.
2. Existing persistent-pane collapse/float/dock controls need a Scrollview card
   owner instead of disappearing with Dockview tabs.
3. Compact/mobile must remove or inert the rail roots; empty 260px roots
   intercepted mobile pointer input.
4. The four intentional shell screenshot changes need new baselines only after
   the geometry and mobile regressions are fixed.

Do not merge the spike. If Scrollview is selected, implement those four items,
add the explicit scrolled-index and keyboard-transfer checks, then require the
full browser matrix before replacing option 3 in the main plan.
