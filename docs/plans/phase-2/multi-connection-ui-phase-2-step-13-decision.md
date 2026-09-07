# Phase 2 Step 13 — Cutover decision

## Decision

**COMPLETE — 2026-09-07.** Phase 2 is the default Darkflow frontend and Phase 3
multi-connection work is unblocked.

- Runtime candidate: `a50290a12a50e6548e42d3293634d850080a8572`
- Rollback revision: `97fc72f9130af8dac11aec6ef25ab95e17a2f6c7`
- Root ownership: `/`, normal Electron, packaged Electron, and Docker use the
  Svelte/Dockview client. `/phase2/` remains a temporary equivalent route.

## Evidence

- Local candidate gates passed: 712 Node tests; 296 development-browser tests
  with 30 expected skips; 113 production-browser tests with 13 expected skips;
  typecheck, Svelte check, lint, formatting, build/artifact validation,
  transports, Electron source/package smoke, Docker, MCP, and diff checks.
- The rollback revision was rebuilt and smoke-tested as the pre-cutover legacy
  artifact before the candidate was restored.
- On 2026-09-07 the project owner confirmed the candidate deployed successfully
  through CI and beta testers were actively using it. This is project-owner
  acceptance; CI job URLs and a separate reproduced live transcript were not
  copied into this checkout.

## Phase 3 interface freeze

- Svelte consumes the public `Session` capabilities; internal facade handles,
  raw transport/GMCP objects, mutable map graphs, and Dockview handles stay
  private.
- Server, character, and session identities remain stable, with at most one live
  session per character profile.
- Application, workspace, client-settings, audio, map, and portable-bundle data
  retain their current versioned owners.
- Session resources and cross-session events remain session-scoped; Phase 3 must
  not infer ownership from the active tab or global DOM.

## Deferred cleanup

Phase 3 owns tabs, simultaneous sessions, background-session policy,
session-aware notifications, and shared-set workflows. Phase 4 owns deletion of
legacy `public/js/**`, compatibility adapters, the temporary `/phase2/` route,
and obsolete harnesses after the four-session isolation gate passes.

Historical plans and compatibility identifiers are not executable legacy code.
Legacy storage cleanup remains a separate data-compatibility decision and must
not run automatically.
