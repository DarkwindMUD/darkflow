# Phase 2 Step 6 Completion

## Status

**COMPLETE locally** on 2026-08-15 at revision `66199ec`.

The non-default `/phase2/` path now owns the three Step 6 parity rows. Packaged
Electron, default-root cutover, hosted CI, and release certification remain Step
12 work and are not claimed here.

## Replacement evidence

| Parity row                          | Local result                                                                                                                                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P2-6-character-group-vitals`       | Character panels passed valid/malformed wire data, loading/empty state, keyboard interaction, reconnect reset/rehydration, disposal, built web, and 390x844 mobile Chromium. Room image/media remains exclusively `P2-8-room-image`.                       |
| `P2-6-inventory-progress-cyberware` | Inventory, quests, achievements, and cyberware passed full/delta reducers, malformed-frame rejection, outbound detail requests, mismatched detail rejection, dialog focus return, reconnect replacement, disposal, built web, and 390x844 mobile Chromium. |
| `P2-6-lag-rfc2549`                  | Connection health and RFC 2549 passed ping/status handling, malformed-status rejection, reconnect gaps, full-check ownership, QoS/RED controls, keyboard close, disposal, and built Chromium.                                                              |

## Phase 2 GMCP ownership

`client/runtime/information.ts` owns validated reads for:

- `Char.Vitals`, `Char.Status`, `Char.StatusVars`, `Char.Stats`,
  `Char.RealStats`, and `Char.Worth`
- `Char.Items.List`, `Char.Items.Add`, `Char.Items.Remove`, and
  `Char.Items.Update`
- `Char.Defences.List`, `Char.Defences.Add`, and `Char.Defences.Remove`
- `Group`, `Darkwind.Char.Avatar`, `Darkwind.Divine`, `Darkwind.Sky`,
  `Darkwind.GuildVitals`, and `Darkwind.XPMon`
- `Darkwind.Quests.List`, `Darkwind.Quests.Active`,
  `Darkwind.Quests.Update`, and `Darkwind.Quests.Complete`
- `Darkwind.Achievements.List` and `Darkwind.Achievements.Update`
- `Darkwind.Cyberware.List`, `Darkwind.Cyberware.Details`, and
  `Darkwind.Cyberware.Image`

`client/runtime/connection-health.ts` owns validated reads for `Core.Ping` and
`Darkwind.Lag.Status`.

The controller census asserts all 30 registrations against those two Phase 2
owners and their retained legacy registrations. Compatibility delivery remains
advisory: malformed modeled frames are still diagnosed and delivered to legacy
handlers, while the Phase 2 read models reject them.

## Frozen seams for Steps 7-11

1. Svelte consumes narrow session-owned read models through `getSnapshot()` and
   `subscribe()`; it does not import GMCP, transport, sockets, event buses,
   resource scopes, legacy state, or compatibility handles.
2. New owners validate at their own ingress without changing advisory legacy
   dispatch.
3. Shared DOM renderers receive data and narrow action callbacks; outbound game
   behavior uses typed session methods or `Session.terminal.sendCommand()`.
4. Workspace ports use explicit panel IDs and the existing renderer registry;
   visibility is derived from `Workspace.hasPanel()` and sent through
   `Session.information`.

No generic panel SDK, universal GMCP store, base class, factory, registry, or new
dependency was added.

## Verification

| Command                                                       | Result                                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm test`                                                    | `PASS` — 589/589.                                                                         |
| Focused Step 6 Node suite from PRs 1-4 plus controller census | `PASS` — 85/85.                                                                           |
| `npm run check`                                               | `PASS` — 0 errors, 0 warnings.                                                            |
| `npm run lint`                                                | `PASS`.                                                                                   |
| `npm run format:check`                                        | `PASS`.                                                                                   |
| `npm run build`                                               | `PASS`, including bundle and client-artifact verification.                                |
| Development Chromium/mobile Step 6 specs                      | `PASS` — 7/7.                                                                             |
| Built Chromium/mobile Step 6 specs                            | `PASS` — 7/7.                                                                             |
| `npm run typecheck`                                           | Repository baseline only: 14 TS5097 diagnostics in 10 pre-Step-6 files; Step 6 adds none. |
| `git diff --check`                                            | `PASS`.                                                                                   |

The first full runs stopped after `session-bootstrap.test.mjs`: successful test
sessions retained the connection-health interval introduced in Green PR 4. The
shared bootstrap harness now disposes its retained session in `t.after()`. Its
focused file passes 10/10 and the exact full command reaches the 589-test terminal
summary.

## Rollback and deferred proof

Legacy `/`, `public/js/panel-manager.js`, `public/js/lag-monitor.js`,
`public/js/rfc2549-debug.js`, their compatibility registrations, legacy panel
state, and existing adapters remain intact as rollback owners.

Step 12 still owns packaged Electron proof, hosted/release certification,
default-root cutover, and any legacy deletion.
