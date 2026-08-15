# Phase 2 Step 8 Completion

## Status

**COMPLETE** on 2026-08-15 at revision `80dbf73` plus the uncommitted Step 8
worktree.

The non-default `/phase2/` path now owns the four Step 8 parity rows. The live
gate passed against `darkwind.ai:4242` over WSS. Packaged Electron, default-root
cutover, hosted CI, and release certification remain Step 12 work and are not
claimed here.

## Replacement evidence

| Parity row                  | Result                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P2-8-map-hydration-render` | Retained map algorithms now run through world-keyed repositories and stable session adapters. Authoritative hydration/render, Browse pagination, reconnect, layout, desktop/mobile presentation, and disposal passed.                                                                                                                     |
| `P2-8-map-navigation`       | Pan, zoom persistence, keyboard speedwalk, unexpected-room cancellation, Resync, transient Area Map behavior, Reset, reconnect, and teardown passed without persisting session-only panels.                                                                                                                                               |
| `P2-8-room-image`           | Room/generation identity, stale preload rejection, room transition, reconnect/disposal, accessible zoom/focus, and desktop/mobile presentation passed. The authenticated live current-room image loaded with matching alt text.                                                                                                           |
| `P2-8-room-playlist`        | State-versus-Open, exact Action/Report directions, permissions/reorder, future start, pause/drift, retry/autoplay, reconnect freshness, entry identity, room departure, close/reopen, retained hidden lifecycle, and late-callback disposal passed. Live verification was read-only because the authenticated room had no shared jukebox. |

## Ownership

`client/runtime/world.ts` owns validated per-session map view, room media,
speedwalk, and playlist state behind the frozen `Session.world` capability.
Shared normalized graphs are keyed by world identity; current room, browse view,
speedwalk, media, and player lifecycle remain session-owned. Svelte imports no
GMCP, transport, event bus, scope, storage facade, or internal session handle.

The existing map algorithms, renderer, pan/zoom/storage behavior, playlist
math, CSS, and legacy `/` route remain retained rollback owners. Step 8 added no
dependency, generic world store, second workspace abstraction, or speculative
protocol.

## Verification

| Command or boundary                               | Result                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retained Step 8 baseline                          | `PASS` — 93/93 before implementation.                                                                                                                                           |
| `npm test`                                        | `PASS` — 613/613.                                                                                                                                                               |
| `npm run check`                                   | `PASS` — 0 errors, 0 warnings.                                                                                                                                                  |
| `npm run lint`                                    | `PASS`.                                                                                                                                                                         |
| `npm run format:check`                            | `PASS`.                                                                                                                                                                         |
| `npm run build`                                   | `PASS` — 335 modules; bundle and client artifact verified.                                                                                                                      |
| Development Chromium/mobile Step 8 fixture        | `PASS` — 10/10.                                                                                                                                                                 |
| Built Chromium/mobile Step 8 fixture              | `PASS` — 10/10.                                                                                                                                                                 |
| Full development Chromium/mobile regression suite | `PASS` — 70 passed, 4 intentionally skipped before the final evidence-only world-spec expansion; the expanded fixture then passed 10/10.                                        |
| Authenticated live connection                     | `PASS` — authoritative map rendered the current room, current-room image loaded with accessible text, and the Jukebox correctly reported no shared playlist without a mutation. |
| `npm run typecheck`                               | Repository baseline only: 14 TS5097 diagnostics in 10 existing files; Step 8 adds no new diagnostic category or count.                                                          |
| `git diff --check`                                | `PASS`.                                                                                                                                                                         |

## Live gate

The authenticated WSS session proved that the real server's MapData2/Room.Info
stream renders the current Darkwind area and room, that asynchronous room-image
generation resolves into the matching accessible figure, and that a room with
no shared playlist presents the correct read-only Jukebox state. Playlist
mutations were intentionally left to deterministic browser fixtures rather than
changing shared live-room state.

## Rollback and deferred proof

Legacy `/`, retained singleton wrappers, renderer/playlist cores, styles, map
storage, playlist settings, and legacy panels remain intact. Revert the Step 8
commit and use legacy `/` if a live regression is found.

Step 12 still owns packaged Electron proof, hosted/release certification,
default-root cutover, and any legacy deletion.
