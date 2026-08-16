# Phase 2 Step 11 Completion

## Status

**COMPLETE** on 2026-08-16; commit pending user approval. Step 11 is based on
the committed Step 10 revision `5856d44`.

Enemy/Combat, Tutorial, Visual Effects, and Street Samurai now have Phase 2
functional owners behind the public `Session` boundary. The targeted Step 11
browser fixture passes 8/8 in development Chromium/mobile and 8/8 against the
built client. The full Node suite passes 681/681, the full development browser
matrix passes 202 with 6 intentional skips and no failures, and the build,
postbuild, client-artifact, and Svelte checks pass. The authenticated `/phase2/`
live gate passed for all four domains by user confirmation; no finer live
behavior is claimed beyond that confirmation.

Step 11 does not freeze the final workspace appearance. Step 12 remains the
presentation-only owner for geometry, chrome, z-order, snapping, and visual
polish. Step 13 remains the release, default-root cutover, and legacy-deletion
owner.

## Replacement evidence

| Parity row               | Current result                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enemy/Combat             | Bounded validated State/Events and singular Event data feed the fixed `enemy` workspace panel through `Session.combat`. Browser evidence covers text continuity, authoritative Enemy/Vitals/Avatar inputs, readiness-before-Resync ordering, reduced motion, ordered/stale events, focus preservation, manual-close suppression, encounter change, end, and disposal; focused runtime tests cover reconnect. The authenticated live domain passed by user confirmation. |
| Tutorial                 | Validated State/Control and exact Action/Resync directions feed `TutorialOverlay.svelte` through `Session.tutorial`. Browser evidence covers healthy shell readiness, semantic target highlighting, fill-and-focus without sending, directions, hints, skip confirmation, Control hiding, action timeout, completion, Zork-only gating, recovery, and disposal; focused runtime tests cover reconnect. The authenticated live domain passed by user confirmation.       |
| Visual Effects           | Optional retained effects and settings feed a cosmetic, pointer-inert layer through `Session.visualEffects`; terminal text remains independent. Browser evidence covers default-off settings, persisted enablement, subscriptions, world/health/event/preview semantics, cooldown, stale rejection, reduced motion, forced colors, recovery, reconnect, and disposal. The authenticated live domain passed by user confirmation.                                        |
| Street Samurai dashboard | Validated initial `Darkwind.Window.Open` state and later full replacements remain inside the existing instance-local `Session.interactions` window owner. Browser evidence covers labelled rendering, active-tab preservation, literal text, keyboard tabs, responsive containment, exact close, late-update rejection, reconnect unregister, and disposal. The authenticated live domain passed by user confirmation.                                                  |

## Ownership

`Session.combat`, `Session.tutorial`, and `Session.visualEffects` expose only
deeply frozen snapshots and named actions. Street Samurai extends the existing
`Session.interactions` window lifecycle rather than adding a second capability
or dashboard owner. Svelte receives no GMCP bus, transport, raw socket, event
bus, resource scope, storage facade, compatibility facade, retained manager, or
DOM handle.

Combat owns functional Enemy-pane state, renderer readiness, text fallback,
auto-open/end, same-encounter close suppression, ordering, and lifecycle.
Tutorial owns authoritative progress and actions, healthy-shell readiness,
fixed semantic targets, draft-only examples, confirmation, recovery, and
lifecycle. Visual Effects owns validated cosmetic meanings, retained settings
and timing, accessibility fallbacks, recovery, and cleanup. Street Samurai owns
validated live replacement only inside the existing server-window instance.

The legacy `/` route and the retained Combat, Tutorial, Visual Effects, and
Street Samurai managers, cores, renderers, CSS, settings key, global Street
wrapper, and registrations remain intact as rollback sources.

## Verification

| Command or boundary                         | Result                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Node suite under Node v22.15.0         | `PASS` — 681/681, 0 failed, 0 skipped, 0 todo in 258555.914125 ms with loopback available.                                                                                                    |
| `npm run check`                             | `PASS` — 0 errors and 0 warnings.                                                                                                                                                             |
| `npm run build`                             | `PASS` — 393 modules transformed.                                                                                                                                                             |
| Postbuild and client artifact               | `PASS` — 86 JavaScript files verified; client artifact version 1.5.6 passed.                                                                                                                  |
| Development Chromium/mobile Step 11 fixture | `PASS` — 8/8.                                                                                                                                                                                 |
| Built Chromium/mobile Step 11 fixture       | `PASS` — 8/8.                                                                                                                                                                                 |
| Full development browser regression matrix  | `PASS` — 202 passed, 6 intentional skips, 0 failed.                                                                                                                                           |
| Authenticated `/phase2/` live gate          | `PASS` — the user confirmed Enemy/Combat, Tutorial, Visual Effects, and Street Samurai all passed. No domain-specific live action or observation beyond that blanket confirmation is claimed. |

## Live gate

The authenticated `/phase2/` live gate is satisfied by the user's explicit
confirmation that all four Step 11 domains passed: Enemy/Combat, Tutorial,
Visual Effects, and Street Samurai. This record does not infer which character,
server payload, action, setting, or visual state produced that result, and it
does not claim builder-only Preview, administrative mutation, tutorial restart,
or any other finer observation that the user did not state.

## Rollback and deferred ownership

Step 11 is additive. Revert its eventual commit and serve the retained legacy
`/` root if a regression is found. The retained managers, cores, renderers,
styles, settings key, global Street wrapper, and server-window behavior remain
available; no schema migration or legacy deletion is required for rollback.
False Combat/Tutorial readiness restores server text fallback, and Visual
Effects remain optional and cosmetic.

For the four Step 11 surfaces, Step 12 may change presentation only: exact
workspace geometry, floating chrome, z-order/auto-front behavior, snapping,
placement, and visual polish. It must continue consuming the Step 11 public
capabilities and must not introduce a second Enemy, Tutorial, Visual Effects,
or Street Samurai functional owner. Step 13 owns immutable-candidate and release
certification, hosted proof, default-root cutover, and any later legacy deletion.
