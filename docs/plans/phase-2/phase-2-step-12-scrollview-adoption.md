# Phase 2 Step 12 - Scrollview adoption

Supersedes the rail portion of the original Green PR 4. Follows the standalone
Scrollview spike findings (2026-08-17) in
`phase-2-step-12-legacy-look-and-feel.md`.

## Planning selection

- Mode: phase map, with a detailed implementation plan for Phase 1 only
- Complexity: 7/10 - a public contract change (`WorkspaceSnapshot`), a new view
  root, a reworked responsive controller, and cross-environment verification,
  against uncertainty the spike already reduced to two known-method gates
- Hard triggers: two independently deployable outcomes - rails that render and
  persist correctly, and mouse drag between roots
- Current planning horizon: Phase 1 - Scrollview rails with button and keyboard
  transfer. Phase 2 is outcome-only.
- Evidence horizon: rail construction and responsive control in
  `WorkspaceHost.svelte`, the adapter's constraint/save/restore path, the
  `WorkspaceSnapshot` contract, and the Playwright project matrix
- Adversarial review: focused - on the snapshot migration and the responsive
  controller, the two places a mistake is not caught by a unit test

## Goal

Replace the two fixed-width grid rails with Scrollview roots so rail cards size
to their content under a single per-rail scrollbar, which is the original defect:
ten left-rail panels need 1000px of grid slices in a 643px sidebar, so Worth, XP
monitor, and Stats render clipped and unreachable.

## Must-have outcomes

- [MO1] Rail cards render at content height with exactly one scrollbar per rail -
  phase exit: no rail card has its own scrollbar, and the rail root scrolls
- [MO2] A rail panel can leave its rail and return, by pointer and by keyboard -
  phase exit: an accessible control performs both directions
- [MO3] Layout survives reload, including a panel currently floated out -
  phase exit: save/reload/restore round-trip green, v1 payloads still load
- [MO4] Mouse drag places a panel at a chosen rail position -
  phase exit: vertical drop index correct including at non-zero `scrollTop`

## Out of scope

- Mouse drag and vertical drop index - Phase 2; MO2 ships the accessible path
  first, which drag then enhances rather than replaces
- Rail-to-rail direct move - Phase 2; Phase 1's return goes to the origin rail
- Float defaults for Map, Room Image, Jukebox, and Enemy - unchanged Green PR 4
  work, independent of the rail container
- Theme and backgrounds - Green PR 5
- Generalising Scrollview beyond the two rails - no options bag, no plugin
  surface, no serialization interface until a third caller exists

## Assumptions

- The vertical drop index is scroll-coordinate independent because
  `getBoundingClientRect()` is viewport-relative - if false: Phase 2 grows a
  scroll-offset correction; Phase 1 is unaffected
- No rail renderer sets `preserveDomWhenHidden`, so remount on transfer is
  invisible - if false: that panel loses DOM state on float-out and needs
  `renderer: "always"` handling
- Storing rail membership and collapsed state as id arrays is sufficient; rails
  need no per-card size persistence because cards are content-height by
  definition - if false: the snapshot grows a size map and the migration must be
  redone

## Risks

- **Snapshot v2 migration** - mitigation: v1 stays readable as a bare Dockview
  tree; a v2 payload read by reverted code fails validation and falls to the
  default layout through the existing recovery path
  (`e2e/phase2-workspace.spec.ts:113`), which is the rollback
- **Responsive controller rework** - `presentTerminalCentric`
  (`client/workspace/WorkspaceHost.svelte:711`) removes fourteen panels by id
  from one root; three roots break that assumption, and the spike saw empty
  260px roots swallow mobile pointer input - mitigation: Step 4 replaces removal
  with inerting the two root elements, and the existing responsive round-trip
  test is the gate
- **Pane chrome regression** - PR3 shipped accessible collapse/float/dock on
  Dockview tabs that rail cards no longer have - mitigation: Step 1 reuses
  `WorkspaceTabRenderer` rather than writing a second header

## Phase map

### Phase 1 - Scrollview rails with accessible transfer

**Outcome:** rails render at content height, one scrollbar each, and rail panels
move out and back by button and keyboard.
**Owns:** the `Scrollview` root, the composite `WorkspaceSnapshot`, rail card
chrome, and the responsive contract for three roots.
**Depends on:** nothing outstanding; the spike closed S0 through S4.
**Exit evidence:** full Playwright matrix green with regenerated baselines, plus
the 681-test Node suite, check, lint, format, and build.
**Not planned yet:** nothing - this is the current horizon.

### Phase 2 - Drag transfer and vertical drop index

**Outcome:** a rail card can be dragged to the main area or either rail and lands
at the pointer-derived index.
**Owns:** the outbound HTML5 payload, the capture-phase pointer listener, and the
index calculation.
**Depends on:** Phase 1 shipped, because drag reuses its transfer function.
**Exit evidence:** all three directions on chromium, plus an explicit non-zero
`scrollTop` insertion case - the gate the spike left open.
**Not planned yet:** exact files. Plan it once Phase 1's transfer function has a
settled signature.
**Detailed-plan gate:** Phase 1 merged and the transfer entry point named.

## Current planning horizon - Phase 1

### Must-haves

- [MH1] Rail cards are content-height; each rail root is the only scroller -
  acceptance: for every rail card, `scrollHeight <= clientHeight`; for each rail
  root, `scrollHeight > clientHeight` when panels overflow
- [MH2] Each rail card carries collapse, float, and close controls with live
  aria-labels - acceptance: the existing MH4 test in
  `e2e/phase2-look-and-feel.spec.ts` passes unchanged
- [MH3] Float and dock work from the card control, reachable by keyboard -
  acceptance: a panel floated by keyboard returns to its origin rail at its
  original index
- [MH4] `WorkspaceSnapshot` v2 round-trips a floated-out panel; v1 payloads still
  load - acceptance: reload restores the floated panel; both malformed-layout
  scenarios stay green
- [MH5] Compact and mobile zones inert both rail roots - acceptance: the
  responsive round-trip test passes and no rail root intercepts mobile pointer
  input
- [MH6] Floating bounds clamp against the Dockview host, not the old workspace
  host - acceptance: IDE and restored server-window geometry unchanged from
  today's baselines

### Steps

#### Step 1 - Scrollview root

**Files:** `client/workspace/scrollview.ts` (new)
**Intent:** a class owning a host element and an ordered id array, rendering each
panel as a `flex: 0 0 auto` card inside one `overflow-y: auto` column. Reuse
`SvelteDockviewRenderer` (`client/workspace/dockview-workspace.ts:314`) for card
bodies and `WorkspaceTabRenderer` (`:80`) for card headers - it is Dockview-shaped
in only `init` and `update` (`:144`, `:151`), which read `title` and subscribe
`onDidTitleChange`; give it a plain title setter instead. Collapse is hiding the
card body, not `COLLAPSED_HEIGHT` constraint juggling (`:497`) - that is grid
splitview logic with no meaning in a flex column.
**Verify:** `npx playwright test phase2-look-and-feel --project=chromium`
**Done when:** ten left-rail cards render in document order, MH1 holds.

#### Step 2 - Adapter seams

**Files:** `client/workspace/dockview-workspace.ts`
**Intent:** delete the rail branch of `applyPaneConstraints` (`:477`) and the
`size.width` pinning it exists for - rails leave the grid, so pinned 260px
columns are dead code. Point `clampFloatingBounds` (`:557`) at the Dockview host
element. Export a transfer entry point taking a panel spec and a destination.
**Verify:** `npm run check && npx playwright test phase2-workspace --project=chromium`
**Done when:** MH6 holds and no constraint code references `RAIL_WIDTH`.

#### Step 3 - Composite snapshot

**Files:** `client/workspace/workspace.ts`, `client/workspace/dockview-workspace.ts`
**Intent:** `WorkspaceSnapshot` becomes
`{ version: 2, layout: { dockview: unknown, scrollviews: Record<string, string[]>, collapsed: Record<string, string[]> } }`.
Use `Record<string, string[]>`, not `Record<"left" | "right", string[]>` - rail
identity is layout, and this file is the vendor-neutral contract. `save()`
(`:765`) and `restore()` (`:770`) fan out; a v1 payload loads as one Dockview
tree with default rail membership.
**Verify:** `npx playwright test phase2-workspace --project=chromium`
**Done when:** MH4 holds, including both malformed-layout scenarios.

#### Step 4 - Host wiring and responsive controller

**Files:** `client/workspace/WorkspaceHost.svelte`
**Intent:** mount two Scrollview roots flanking the Dockview host. `buildRail`
(`:157`) fills a Scrollview instead of calling `addOrUpdatePanel` with grid
placement; `railPanelSpec` (`:138`) loses `size` and `placement`. Replace
`presentTerminalCentric` (`:711`) - instead of removing fourteen panels by id,
hide the two roots with `display: none`, which also removes them as pointer
targets. That deletes the removal loop, the restore path it required, and the
mobile hit-testing problem in one change.
**Verify:** `npx playwright test --project=chromium --project=mobile-chromium`
**Done when:** MH5 holds and the responsive round-trip test passes.

#### Step 5 - Verification and baselines

**Files:** `e2e/phase2-look-and-feel.spec.ts`, screenshot baselines
**Intent:** add the MH1 scroller assertion and the MH3 keyboard float/dock
round-trip. Regenerate the four intentional shell baselines only after Steps 1
through 4 are green, so a geometry regression cannot be baked into a baseline.
**Verify:** `npm run check && npm run lint && npm test && npx playwright test`
**Done when:** the full matrix is green across chromium, mobile-chromium,
firefox, and webkit.

### Success criteria

- [ ] Worth, XP monitor, and Stats are visible and reachable in the left rail
- [ ] One scrollbar per rail; no card has its own
- [ ] A rail panel floats out and returns by keyboard alone
- [ ] Reload restores a floated-out panel; v1 payloads still load
- [ ] Full Playwright matrix, 681 Node tests, check, lint, format, and build all
      exit clean

### Rollback

Snapshot v2 is the only persistent change. Reverting the code leaves v2 payloads
in `localStorage`; they fail validation and fall through the existing recovery
path to the default layout (`e2e/phase2-workspace.spec.ts:113`). Blast radius is
one user's rail arrangement, not session or character data. Go/no-go before
merge: both malformed-layout scenarios green.

## Program success criteria

- [ ] MO1 through MO3 pass at Phase 1 exit
- [ ] MO4 passes at Phase 2 exit, including the non-zero `scrollTop` case
- [ ] `WorkspaceSnapshot` changed exactly once across both phases

## Execution fit

- Scope: multi-run phase - Phase 1 is one Green PR with a commit gate; Phase 2 is
  planned separately
- Lead: Opus orchestrator at high effort - the snapshot migration and the
  responsive rework are the two places a wrong call is expensive
- Workers: up to two Sonnet subagents via the Agent tool, using the `build-code`
  skill, on disjoint files - Step 1 (`scrollview.ts`) and Step 3
  (`workspace.ts` plus the adapter's save/restore) do not overlap. Steps 2 and 4
  stay with the lead; both touch files a worker would already hold.
- Delegation shape: parallel owned slices for Steps 1 and 3, then staged handoff
- Ownership: the orchestrator owns integration, the full matrix, baseline
  regeneration, and the commit gate
- Replan trigger: `WorkspaceTabRenderer` turns out not to be reusable for card
  headers, or inerting the rail roots does not clear the mobile pointer
  interception - either invalidates a step's premise, not just its code
- Confidence: high for Steps 1 through 3, medium for Step 4 - the responsive
  controller is the only part the spike did not exercise directly

Plan self-review: PASS (9/10)

notes:
- Step 4 is the riskiest and is deliberately not delegated.
- The `scrollviews` ordering and `collapsed` fields are written in Phase 1 (a
  floated-out panel is absent from its rail list) and reused unchanged by Phase
  2, so user storage migrates once, not twice.
- MO2 before MO4 is deliberate: the accessible transfer is simpler than drag
  hit-testing and is required for parity with PR3's committed controls, so drag
  becomes an enhancement over a working path rather than the only path.
