# Phase 2 Step 12 - Spike 2: standalone Scrollview root per rail

Status: proposed spike, not a Green PR. Throwaway branch, no commit gate.
Follows spike 1 (`DockviewComponent.createGroup` subclass), which failed at S3.

## What spike 1 settled

Spike 1 proved more than it disproved. Carry these forward as facts, not
assumptions:

- A scrolling, content-height rail **renders correctly** when you own the
  container. Ten left-rail panels in document order, one scroller, no 100px
  floor, achieved by re-appending each `panel.view.content.element` in panel
  order and overriding the active-panel height.
- **Native drag-out works.** A card dragged from the rail into the main grid
  docked by Dockview's own machinery, and stock serialization restored group
  membership across a reload.
- The failure was narrow and specific: **Dockview cannot supply a vertical
  insertion index on return.** Its tab-reorder listener stays bound to the
  original tabs-list element and computes from horizontal `clientX`. Reparenting
  tab wrappers moves neither the listener nor its axis.

## Why that failure argues for this design

Spike 1's verdict was "adding a vertical hit test to the subclass duplicates the
work option 3 needs anyway". That is true **for a subclass**, where the hit test
is a bolt-on fighting a listener we do not own, on top of private-DOM coupling.

In a Scrollview root the same vertical hit test is not debt - it is the
component's own drop logic, exactly as Paneview owns its vertical drop logic
today. This design keeps spike 1's two wins, drops the private-DOM coupling, and
converts its one failure into ordinary component code.

Note on a non-differentiator: `DockviewPanel`'s constructor requires a
`DockviewComponent` accessor and a group, so rail cards here are Scrollview's own
panel type and rail-to-main is a transfer with a preserved id. Spike 1 did not
deliver a live panel move either, so this does not separate the two designs.
Rail members are stateless renderers over `Session`; the remount is invisible.

## The question

Can a Scrollview root own the vertical drop axis while keeping the native
drag-out that spike 1 already demonstrated?

## Time box

**Under an hour, one agent.** Stop at the first kill.

| Probe | Estimate |
| --- | --- |
| S0 payload plumbing | 5 min |
| S1 Scrollview root | 15 min |
| S2 outbound drag | 10 min |
| S3 inbound drag and vertical index | 15 min |
| S4 composite persistence | 10 min |

## Verified before writing

`node_modules/dockview-core/dist/dockview-core.js`, version 7.0.4, unpatched.

1. **The drag payload is process-wide by design.** `LocalSelectionTransfer` is a
   singleton (:93). `PointerDragController` carries an explicit comment (:4632):
   targets in instance B receive hit-tests from drags originating in instance A,
   "intentional for cross-instance drops".
2. **Foreign payloads have a documented seam.** Built-in targets reject another
   instance's drag - `data.viewId !== host.id` in `RootDropTargetService`
   (:13817), `data.viewId === this.accessor.id` in the group content target
   (:11386) - then fall through to `dispatchUnhandledDragOver`, surfacing as
   `DockviewUnhandledDragOverEvent` (:10088) with `getData()`. `onWillDrop` /
   `onDidDrop` (`dockviewComponent.d.ts:211-212`) carry the same accessor.
3. **Reading the payload is public.** `esm/index.d.ts:1` exports `getPanelData`
   and `PanelTransfer`; the `dockview` wrapper is `export * from 'dockview-core'`.
4. **Writing it is not.** `LocalSelectionTransfer` is declared in
   `esm/dnd/dataTransfer.d.ts:18` but not re-exported from `index.d.ts`;
   `PointerDragController` is not exported at all. That is S0.
5. **Persistence goes composite.** `save()` is `{ layout: api.toJSON(), version: 1 }`
   (`client/workspace/dockview-workspace.ts:360`, :767), `restore` calls
   `api.fromJSON` at :792. Three roots means `WorkspaceSnapshot` in
   `client/workspace/workspace.ts` holds three trees - the first Step 12 change
   to the vendor-neutral contract.
6. **Name check for the agent:** `dockview` does not export `GroupOptions` by
   name. Spike 1 hit this. Derive public parameter types from the method type
   rather than importing private declarations.

## Probes

### S0 - Payload plumbing (5 min)

1. Confirm whether
   `import { LocalSelectionTransfer } from "dockview-core/dist/esm/dnd/dataTransfer"`
   resolves under the package `exports` map and survives the Vite build.
2. If not, confirm a plain HTML5 `dataTransfer` payload plus a
   `PanelTransfer`-shaped object reaches Dockview's `onUnhandledDragOver` with
   usable data.

**Pass:** Scrollview can originate a drag that Dockview's targets hit-test.

**Kill:** neither path works without patching dockview-core.

### S1 - Scrollview root (15 min)

1. `client/workspace/scrollview.ts`: a root owning a host element and an ordered
   panel list, rendered in an `overflow-y: auto` flex column with
   `flex: 0 0 auto` children. Explicitly **not** built on `Splitview` - splitview
   distributes a fixed extent among children, which is the bug being escaped.
2. Reuse the Svelte mounting path from `dockview-workspace.ts`
   (`SvelteDockviewRenderer`, `createComponent` at :314). Do not write a second
   renderer.
3. Mount in the left rail slot; main Dockview keeps the terminal and the rest.

**Pass:** ten left-rail panels at content height, one scroller, nothing clipped,
suite green - chromium 61, mobile 36, node 681, plus build, lint, format, check.

**Kill:** content-height rendering fails in a container we fully own. Spike 1
already achieved this by DOM takeover, so a failure here means the new component
is wrong, not the approach - fix it rather than abandoning the spike.

### S2 - Outbound drag, rail to main (10 min)

1. Give each card a drag handle publishing a `PanelTransfer`-shaped payload via
   whichever mechanism S0 established.
2. Subscribe the main Dockview to `onWillDrop` / `onDidDrop`, detect the foreign
   `viewId`, and on drop remove the card and `addOrUpdatePanel` it into Dockview
   with the same id, kind, title, and state.
3. Confirm Dockview's own overlays render during the drag.

**Pass:** dragging a rail card into the main grid docks it with native overlay
preview and no bespoke hit-testing on the Dockview side.

**Kill:** overlays do not appear for a foreign payload, or drop position cannot
be read from the event without reimplementing `Droptarget`. Spike 1 got native
drag-out from a tagged group; if a separate root cannot, the process-wide
transfer claim is wrong and this design has no advantage left.

### S3 - Inbound drag and vertical index (15 min)

The probe that killed spike 1, now on our own drop target.

1. Scrollview accepts drags whose payload came from the main Dockview.
2. Derive an insertion index from pointer position within the scrolling column,
   correct while the column is scrolled. This is Scrollview's own listener on its
   own elements, on the vertical axis - not a reparented Dockview listener.
3. On drop, remove from Dockview and insert at that index.
4. Then drag the same panel to the **other** rail, exercising
   Scrollview-to-Scrollview.

Drive with the `mouseDrag` helper at `e2e/phase2-workspace.spec.ts:51`.

**Pass:** all three directions on chromium, terminal island identity unchanged
throughout (`data-terminal-identity`).

**Kill:** the vertical hit test cannot be written against our own DOM without
reimplementing Dockview overlay geometry. That would mean the axis problem is not
about listener ownership after all, which contradicts spike 1's diagnosis and is
worth reporting loudly.

### S4 - Composite persistence (10 min)

Only if S0 through S3 pass. Laborious rather than uncertain.

1. Extend `WorkspaceSnapshot` to three serialized trees. Keep `version: 1`
   handling for old payloads, bump to `version: 2` - `phase2-workspace.spec.ts:99`
   asserts on the envelope.
2. Malformed-layout recovery still lands on the default layout
   (`phase2-workspace.spec.ts:113`).
3. Responsive controller still captures and restores across all three zones -
   `presentTerminalCentric` currently removes rail panels by id from one root.

**Pass:** save/reload/restore round-trips with panels in non-default rails, both
malformed-layout tests still green.

## Non-goals

- Mobile. The 700px zone collapses rails already.
- The right rail beyond S3's two-rail check.
- The terminal - stays in the main Dockview, out of the drag path.
- Floating panels originating from a rail. S2 docking is enough signal.
- Generalising Scrollview past what the rails need. Thrown away either way.

## Deliverable

Findings appended to `phase-2-step-12-legacy-look-and-feel.md`:

1. Probe results, and for S0 which payload mechanism was required.
2. Verdict, and if it is Scrollview: the dockview-core surfaces it depends on and
   the composite snapshot shape, written down before the risk is taken on.
3. Whether `WorkspaceSnapshot` had to change - that contract outlives the spike.
4. If S3 fails: the precise reason, since it would contradict spike 1's
   diagnosis and reopens the whole question.

Branch deleted after write-up. Nothing merges directly.

## Ordering

S0 is five minutes and can end the spike before a component exists. S1 is the
prize and spike 1 already proved it is achievable. S2 confirms the process-wide
transfer claim. S3 is the decisive probe - it is exactly what spike 1 could not
do, attempted where we own the listener and the axis. S4 is last because it is
the only part guaranteed to be tedious rather than uncertain.
