## Planning selection

- Mode: phase map
- Complexity: 8/10 — full-app visuals, floating behavior, persistence, and unported panels cross several boundaries.
- Hard triggers: multiple deployable slices; user-visible behavior.
- Current planning horizon: define and prove the desktop floating-workspace contract.
- Evidence horizon: legacy panel manager/CSS, current Dockview adapter/host, existing E2E.
- Adversarial review: focused — geometry, z-order, and terminal preservation are the regression risks.

Short version: Dockview already floats, redocks, resizes, persists, and preserves the terminal island. We need to turn its current “workbench demo” presentation into the Darkflow workspace—and add the legacy-specific pane policy that Dockview deliberately does not provide.

| Area | Legacy | New Dockview today | Required |
|---|---|---|---|
| App canvas | Full-window floating workspace, fixed side docks | A bordered host capped at `60vh` with developer-style controls | Make Dockview the full client canvas; move panel controls into real app chrome |
| Floating panes | Fixed-position panes, custom header/buttons, native resize, min sizes | Floating groups with titlebar drag and serialized geometry | Darkflow floating frame/chrome, visible float/dock affordance, resize constraints |
| Layout behavior | Optional 16px grid, edge snapping, panel defaults, per-pane z-layer | Native drag/dock/resize/persistence | Adapter-private snap/clamp policy; explicitly decide whether z-layer parity is needed |
| Panel inventory | Includes Room, Enemy, Chat and all legacy widgets | Current host covers information/world/server/IDE/fishing surfaces, not all legacy widgets | Finish remaining panel ports before claiming full parity |
| Styling | Dense Darkflow headers, borders, shadows, panel controls | Dockview’s stock CSS plus minimal wrapper styling | Scoped `.dv-*` theme overrides and panel-level component polish |

Evidence: the legacy panes are `position: fixed`, resizable, and min-sized; its terminal is larger still. [panels.css](/Users/anderson/src/games/darkwind/darkflow/public/css/panels.css:668) Legacy also owns float/dock buttons, collapse, pane settings, optional 16px snapping, and per-pane layer state. [panel-manager.js](/Users/anderson/src/games/darkwind/darkflow/public/js/panel-manager.js:419) [panel-manager.js](/Users/anderson/src/games/darkwind/darkflow/public/js/panel-manager.js:1167) [panel-manager.js](/Users/anderson/src/games/darkwind/darkflow/public/js/panel-manager.js:2029)

The new adapter already enables pointer DnD, floating titlebar dragging, floating placement, serialization, and terminal-safe restoration. [dockview-workspace.ts](/Users/anderson/src/games/darkwind/darkflow/client/workspace/dockview-workspace.ts:254) [dockview-workspace.ts](/Users/anderson/src/games/darkwind/darkflow/client/workspace/dockview-workspace.ts:395) [dockview-workspace.ts](/Users/anderson/src/games/darkwind/darkflow/client/workspace/dockview-workspace.ts:582) Its biggest visual mismatch is structural: the host is still a bounded `60vh` panel with a button rack. [WorkspaceHost.svelte](/Users/anderson/src/games/darkwind/darkflow/client/workspace/WorkspaceHost.svelte:670)

## Goal

Make `/phase2/` feel like the legacy Darkflow floating workspace: full-screen terminal-centered canvas, familiar pane chrome and defaults, reliable float/dock behavior, and persisted layouts—without reintroducing the legacy panel manager.

## Must-have outcomes

- Full-window desktop workspace with legacy-equivalent visual hierarchy.
- Every migrated panel can open, close, dock, float, resize, and restore its layout.
- Legacy pane defaults are intentionally recreated: terminal, map/image pairing, chat, combat, IDE, etc.
- Terminal identity, focus, scroll position, and disposal remain intact through all workspace operations.
- Panel chrome and theming match the legacy look.
- Mobile remains a panel-sheet experience; it should not attempt desktop floating panes.

## Out of scope

- Browser pop-out windows: legacy “floating” is in-page fixed positioning, not separate OS/browser windows.
- Copying `darkwind-panel-state` into the new runtime: retain it only as rollback data.
- Replacing Dockview or exposing its API outside the existing workspace adapter.

## Phase map

### Phase 1 — Lock the parity target

**Outcome:** A screenshot/interaction matrix identifies the legacy appearance and behavior to reproduce for desktop and mobile.  
**Owns:** Exact panel inventory, dimensions/default placement, controls, and intentional exclusions.  
**Depends on:** Nothing.  
**Exit evidence:** Side-by-side captures plus a per-panel behavior matrix.  
**Not planned yet:** CSS implementation.  
**Detailed-plan gate:** Agreement that “visual parity” means legacy-like chrome and behavior, while retaining Dockview tabs/docking conventions.

### Phase 2 — Replace the demo shell with the Darkflow workspace

**Outcome:** Dockview occupies the actual desktop app surface, with terminal-first sizing and proper toolbar/status layering.  
**Owns:** Full-height canvas, panel launcher, desktop/mobile split, Darkflow theme tokens.  
**Depends on:** Phase 1.  
**Exit evidence:** Desktop visual regression captures at normal and narrow widths; mobile sheet still passes.  
**Not planned yet:** Per-panel special behavior.

### Phase 3 — Floating-pane behavior and chrome

**Outcome:** Floating groups look and act like Darkflow panes.  
**Owns:** Header/title/close styling, explicit float/dock control, resize bounds, default geometry, edge/grid snap, drag/drop feedback, and z-order policy.  
**Depends on:** Phase 2.  
**Exit evidence:** Drag, float, resize, redock, reload, viewport resize, and overlap tests.  
**Not planned yet:** Remaining content-panel ports.

The 16px move snapping can use Dockview’s floating-drag hook; resize snapping and legacy edge behavior need a small adapter extension. Keep it there—`WorkspaceHost` should remain unaware of Dockview internals.

### Phase 4 — Finish panel inventory and panel-specific presentation

**Outcome:** No missing legacy surface prevents parity.  
**Owns:** Remaining Room/Enemy/Chat and any still-unported panel behavior, combat auto-front/size policy, pane-level settings, map-specific controls.  
**Depends on:** Phase 3 and the corresponding public `Session` capabilities.  
**Exit evidence:** Every legacy definition has a new-owner row in the matrix and a scenario test.  
**Not planned yet:** Legacy deletion.

The legacy catalog still includes Room, Enemy, Chat, connection, and others beyond the new host’s declared set. [panel-defs.js](/Users/anderson/src/games/darkwind/darkflow/public/js/panel-defs.js:1) [WorkspaceHost.svelte](/Users/anderson/src/games/darkwind/darkflow/client/workspace/WorkspaceHost.svelte:37)

### Phase 5 — Persistence, accessibility, and release parity gate

**Outcome:** Layouts survive real use without corrupting rollback data, and visual behavior is stable across supported browsers.  
**Owns:** Layout migration/recovery, keyboard access to controls, focused browser evidence, rollback/cutover readiness.  
**Depends on:** Phases 2–4.  
**Exit evidence:** Reload recovery, malformed-layout recovery, terminal preservation, desktop/mobile interaction, and screenshot baselines pass.  
**Not planned yet:** Removing legacy UI; retain it until the default-route cutover is separately approved.

## Current planning horizon

1. Build the behavior matrix from the legacy definitions, panel manager, and screenshots at desktop/mobile breakpoints.
2. Classify each row as:
   - Dockview-native: float, resize, redock, serialize.
   - Adapter work: full-screen shell, Darkflow chrome, defaults, snap/clamp, explicit commands.
   - Panel/domain work: missing surfaces and special behavior.
3. Add visual baselines to the existing workspace E2E suite, which already proves persistence, mobile behavior, and terminal identity. [phase2-workspace.spec.ts](/Users/anderson/src/games/darkwind/darkflow/e2e/phase2-workspace.spec.ts:117)
4. Implement Phase 2 as one vertical slice: full-height canvas plus scoped Dockview styling. Do not touch panel data contracts in that slice.

## Execution fit

- Scope: multi-phase program
- Lead: Sol at high reasoning — layout/persistence/lifecycle boundaries are coupled.
- Workers: none initially
- Delegation shape: solo
- Ownership: lead owns adapter integration and browser verification
- Replan trigger: a required legacy interaction cannot be expressed through the current Dockview adapter without leaking vendor APIs
- Confidence: high — the workspace foundation already covers the hard lifecycle and persistence mechanics

Plan self-review: PASS (9/10)
