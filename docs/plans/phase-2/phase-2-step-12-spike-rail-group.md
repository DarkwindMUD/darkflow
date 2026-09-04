# Phase 2 Step 12 - Spike: scrolling rail group inside Dockview

Status: proposed spike, not a Green PR. Time-boxed, throwaway branch, no commit
gate. Produces a decision and a findings section, not shippable code.

## The question

Can a side rail be a real `DockviewGroupPanel` that stacks all its panels
vertically and scrolls, so rail panels are ordinary Dockview panels that travel
natively between rail, main grid, and floating - without forking dockview-core?

If yes, the rails keep Dockview's drag machinery for free and Step 12's parity
requirement (drag a rail panel out to float, then back into the other rail) needs
no custom gesture code.

If no, we fall back to `RailPanel` (option 3): the rail is one Dockview panel,
its cards are Svelte, and float-out is destroy-and-recreate with the same id.

## Time box

**One working day.** Stop at the first kill criterion. If S1 and S2 both pass but
S3 is still open at the end of the day, that is a "no" - report and fall back.

| Probe | Estimate |
| --- | --- |
| S1 subclass injection | ~1 hour |
| S2 content takeover | ~3 hours |
| S3 DnD round trip | ~2 hours |
| Write-up | ~1 hour |

## What we already verified

Evidence gathered before writing this plan, so the spike does not re-derive it.
All line numbers are `node_modules/dockview-core/dist/dockview-core.js` unless
noted. Installed version is 7.0.4, unpatched (no `patches/`, no `overrides`).

1. **The four view components are parallel roots, not nestable containers.**
   `DockviewComponent extends BaseGrid` (:15555),
   `GridviewComponent extends BaseGrid` (:18687),
   `SplitviewComponent extends Resizable` (:18951),
   `PaneviewComponent extends Resizable` (:19300). A `Paneview` is never placed
   inside a Dockview grid. There is no existing "panel container" seam to copy.

2. **`createGroup` is public and overridable.**
   `dist/esm/dockview/dockviewComponent.d.ts:602` declares
   `createGroup(options?: GroupOptions): DockviewGroupPanel`. Only
   `createGroupAtLocation` is private (:604). A subclass override typechecks.

3. **But the body depends on private state, so it cannot be reimplemented.**
   `createGroup` (:18459) allocates an id from `this.nextGroupId`, checks
   `this._groups`, calls `view.init(...)`, then wires six subscriptions -
   `onTabDragStart`, `onGroupDragStart`, `onMove`, `onDidDrop`, `onWillDrop`,
   `onWillShowOverlay` - into `this._advancedDnDService` and `this._onDidDrop`.
   All of those fields are private. The only viable override shape is
   `super.createGroup(options)` followed by mutation of the returned group.

4. **Injecting a subclass is trivial.** `createDockview` (:19675) is three lines:
   `new DockviewComponent(element, options)` then `return component.api`. The
   adapter calls it at `client/workspace/dockview-workspace.ts:292`.
   `node_modules/dockview/dist/esm/index.d.ts:1` is `export * from 'dockview-core'`,
   so `DockviewComponent`, `DockviewGroupPanel`, and `GroupOptions` are already
   importable from the `dockview` specifier the adapter uses. No new dependency,
   no change to the vendor-neutral boundary in `client/workspace/workspace.ts`.

5. **The one-panel-at-a-time behavior lives two layers down.**
   `DockviewGroupPanelModel` (:10345) owns a `ContentContainer` (:5879), whose
   `openPanel` (:6021) calls `renderPanel` for a single panel and whose
   `closePanel` removes the previous panel's element when its renderer is
   `onlyWhenVisible`. Neither object is injectable; the model is constructed
   internally at :11917. `group.model.contentContainerId` is public, so the
   container is reachable by DOM query even though the object is not.

6. **`renderer: "always"` is not the escape hatch.** It routes the panel into the
   shared overlay render container, absolutely positioned over the group's
   content box. That stacks panels on top of each other, not in flow. The spike
   must keep rail panels on `onlyWhenVisible` and defeat `closePanel` some other
   way, or find that it cannot.

## Probes

Run in order. Each has a pass bar and a kill criterion. A kill ends the spike.

### S1 - Subclass injection

Prove a subclass reaches the grid without breaking anything that works today.

1. Branch `spike/rail-group`. Add `client/workspace/rail-dockview.ts` with

   ```ts
   class RailDockviewComponent extends DockviewComponent {
     override createGroup(options?: GroupOptions): DockviewGroupPanel {
       const group = super.createGroup(options);
       // marker only in S1
       group.element.dataset.spikeGroup = "1";
       return group;
     }
   }
   ```

2. In `dockview-workspace.ts:292`, replace `createDockview(host, options)` with
   `new RailDockviewComponent(host, options).api`. Keep the same options object.

**Pass:** full suite green unchanged - chromium 61, mobile-chromium 36, node 681,
plus build, lint, format, check. Every group carries the marker attribute.

**Kill:** `DockviewComponent` is not constructible from the published typings, or
the subclass breaks serialization round-trip in `phase2-workspace.spec.ts`.
Fall back to option 3.

### S2 - Content takeover

The real question. Make one group render all of its panels stacked and scrolling.

Tag rail groups via `GroupOptions` (an id prefix such as `rail-left` is enough for
a spike - do not design a general mechanism). For a tagged group:

1. Query the content container by `group.model.contentContainerId`.
2. Style it `overflow-y: auto; display: flex; flex-direction: column`, children
   `flex: 0 0 auto`.
3. Subscribe to `group.model.onDidAddPanel` / `onDidRemovePanel` and append or
   remove each panel's `view.content.element` yourself.
4. Neutralize the single-panel path: `openPanel` must not swap, `closePanel` must
   not remove. Try, in order of increasing ugliness - (a) always-active panel
   trickery, (b) patching the model's content container instance in place after
   construction, (c) intercepting `group.model` accessor calls. Record which rung
   was needed; that is the maintenance cost.
5. Stop the group forcing each panel to full height: `DockviewGroupPanel.layout`
   drives `activePanel.layout(width, height)` (:11226). Rail panels must size to
   content instead.

**Pass:** all ten left-rail panels visible in document order inside one group, the
container scrolls, no panel is clipped at the 100px group floor, and the tab bar
is either hidden or repurposed as per-card headers.

**Kill:** neutralizing `openPanel`/`closePanel` requires reaching into a field
that is not on the public typings and has no DOM-level equivalent, or the fix
needs more than two interception points. That is a fork in disguise. Fall back.

### S3 - Native DnD round trip

Only if S2 passes. This is the entire justification for the approach.

1. Drag a rail panel's header out into the main grid area. It must become a
   floating or docked panel by Dockview's own machinery, with no custom gesture
   code.
2. Drag it into the opposite rail. It must insert at the drop index and the rail
   must re-flow and scroll correctly.
3. Save, reload, and confirm the layout restores - serialization must survive,
   since `toJSON` on the group is stock.

Drive this with the existing `mouseDrag` helper in `e2e/phase2-workspace.spec.ts`,
not by hand.

**Pass:** all three, on chromium, without touching drag code.

**Kill:** the drop overlay does not resolve against a stacked container, or drop
index cannot be derived from pointer position without reimplementing
`Droptarget`. Fall back - at that point option 1 costs the same custom gesture
work as option 3 but with a subclass to maintain on top.

## Non-goals

- Mobile. The 700px zone already collapses rails; the spike is desktop-only.
- Persistence format changes. Reuse the stock group `toJSON`.
- The terminal. It stays out of the rail path entirely.
- The right rail. Prove the left rail; the right is the same code.
- Any change to `client/workspace/workspace.ts`. If the spike needs the
  vendor-neutral contract to grow, that is itself a finding worth reporting.
- Tidy code. This branch is thrown away either way.

## Deliverable

A findings section appended to `phase-2-step-12-legacy-look-and-feel.md` covering:

1. Which probes passed, with the actual interception points S2 required.
2. A verdict: option 1 (subclass), option 3 (RailPanel), or neither.
3. If option 1 - the list of dockview-core internals the subclass depends on, so
   the upgrade risk is written down before it is taken on.
4. If option 3 - what S2/S3 taught us about the drag gesture we then have to
   write ourselves.

The branch is deleted after the write-up. Nothing from it merges directly.

## Why this ordering

S1 is cheap and de-risks the plumbing. S2 is the load-bearing question and is
where the spike most likely dies - Dockview's group is built around exactly one
visible panel, and every layer that assumption touches is private. S3 only
matters if S2 works, and it is the only thing that makes the subclass worth its
maintenance cost: if native drag does not come for free, option 1 has no
advantage left over option 3.
