# Phase 2 Step 7 Completion

## Status

**COMPLETE** on 2026-08-15 at revision
`66199ec` plus the uncommitted Step 7 worktree.

The non-default `/phase2/` path now owns the four Step 7 parity rows. The user
confirmed authenticated live login and previously completed Phase 2 behavior,
then authorized the Step 7 commit. Packaged Electron, default-root cutover,
hosted CI, and release certification remain Step 12 work and are not claimed
here.

## Replacement evidence

| Parity row                 | Local result                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P2-7-generic-window`      | Modal, NPC-dialogue, workspace-panel, and instanced-video windows passed validated Open/Update/Close, exact Submit/Action/Closed directions, auth input preservation, stale-auth cleanup, focus, reconnect, transient persistence, disposal, development/built web, and 390x844 mobile Chromium. |
| `P2-7-snoop-announcements` | Snoop open/append/status/close and command/stop/closed plus announcement list/new/update/state and mark-read passed exact directions, focus, reconnect reset, teardown, development/built web, and mobile Chromium.                                                                              |
| `P2-7-media-broadcast`     | Giphy and broadcast passed repeated server events, safe replacement and hiding, focus/accessibility, mobile layout, reconnect reset, disposal, development web, and built web.                                                                                                                   |
| `P2-7-rescue-fishing`      | Linux rescue retained its command core; fishing passed Open/Bite/Fight/Caught/Escaped/Art/End, Cast/Hook/Result/Cancel, late art, panel-close cancel, sticky End dismissal, keyboard/pointer/mobile behavior, reconnect, animation cleanup, development web, and built web.                      |

## Phase 2 interaction ownership

`client/runtime/interactions.ts` owns validated reads for the Step 7 inbound
packages and exposes one frozen `Session.interactions` snapshot. Its named
actions are the only new public outbound boundary:

- Window Submit, Action, and Closed
- Snoop Command, Stop, and Closed
- Announcements List request and MarkRead
- Fishing Cast, Hook, Result, and Cancel

Svelte imports neither GMCP nor internal session handles. Compatibility delivery
remains advisory: malformed modeled frames are still diagnosed and delivered to
legacy handlers, while `Session.interactions` ignores them.

Generic windows continue to reuse `public/js/window-renderer.js`; announcements,
Linux rescue, and fishing reuse their existing retained Markdown/simulation
cores and styles. No dependency, generic interaction framework, second workspace
abstraction, or speculative protocol was added.

## Verification

| Command or boundary                               | Result                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Step 6 prerequisite gate                          | `PASS` — 589/589 Node tests, 0 Svelte diagnostics, clean staged/unstaged diff checks before Step 7.                    |
| Focused Step 7 interaction Node suite             | `PASS` — 34/34.                                                                                                        |
| `npm test`                                        | `PASS` — 595/595.                                                                                                      |
| `npm run check`                                   | `PASS` — 0 errors, 0 warnings.                                                                                         |
| `npm run lint`                                    | `PASS`.                                                                                                                |
| `npm run format:check`                            | `PASS`.                                                                                                                |
| `npm run build`                                   | `PASS`, including bundle and client-artifact verification.                                                             |
| Development Chromium/mobile Step 7 fixture        | `PASS` — 10/10.                                                                                                        |
| Built Chromium/mobile Step 7 fixture              | `PASS` — 10/10.                                                                                                        |
| Full development Chromium/mobile regression suite | `PASS` — 62 passed, 4 intentionally skipped.                                                                           |
| User live verification                            | `PASS` — authenticated login and previously completed functionality confirmed on 2026-08-15.                           |
| `npm run typecheck`                               | Repository baseline only: 14 TS5097 diagnostics in 10 existing files; Step 7 adds no new diagnostic category or count. |
| `git diff --check`                                | `PASS`.                                                                                                                |

The full browser gate initially exposed a terminal-island registry leak in the
existing no-session `TerminalPanel` teardown path. The shared owner now disposes
that island on unmount; the focused lifecycle suite passes 4/4 and the full
development browser gate passes.

## User gate

The user confirmed the following with a real Darkwind connection from
`/phase2/`:

1. The login form opens, accepts credentials, submits, and reaches the game.
2. Reconnect preserves a partially typed login form but clears stale windows
   after an explicit disconnect.
3. Previously completed settings, terminal input/output, workspace restore,
   character/inventory/progress panels, and connection diagnostics still work.
4. Desktop and mobile presentation remain usable for the exercised surfaces.

The user reported this gate passed and explicitly authorized the Step 7 commit
on 2026-08-15.

## Rollback and deferred proof

Legacy `/`, all seven legacy Step 7 managers, compatibility registrations,
renderer/simulation cores, styles, and legacy workspace state remain intact as
rollback owners. Revert the Step 7 commit and use legacy `/` if a live
regression is found.

Step 12 still owns packaged Electron proof, hosted/release certification,
default-root cutover, and any legacy deletion.
