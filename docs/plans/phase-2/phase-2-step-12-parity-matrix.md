# Phase 2 Step 12 — Panel parity and behavior matrix

Green PR 1 artifact for
[`phase-2-step-12-legacy-look-and-feel.md`](./phase-2-step-12-legacy-look-and-feel.md).
This records, at base `bff841e`, the single Phase 2 owner, class, current
placement, frozen target, controls, persistence, and mobile behavior for every
workspace panel. The approved Room/Chat functional slice resolved the last two
inventory exclusions. It is the reference the
executable parity/behavior tests assert against; the plan's "Frozen target" and
"Pane behavior by class" tables are the authority when this file and the plan
disagree.

**Closeout:** COMPLETE on 2026-09-07. Candidate `a50290a` passed the Step 13
cutover gates; the project owner confirmed successful CI deployment and active
beta use.

Primary source:
[`client/workspace/WorkspaceHost.svelte`](../../../client/workspace/WorkspaceHost.svelte)
(inventory, renderer registry, restore set, transient save suppression).

## Classes

Four classes from the plan's "Pane behavior by class" table:

- **Terminal** — always present, never closable, one preserved DOM island.
- **Persistent launcher** — visibility toggled by launcher controls; placement,
  size, collapse, and selected state restore across reload.
- **Session-owned transient** — an existing domain owner opens/closes it; never
  restored; save is suppressed while any transient is open.
- **Mobile sheet** — selection only; must not write desktop geometry.

## Panel inventory

Every row has exactly one existing Phase 2 owner. "Current placement" is the
code at `bff841e`; "Frozen target" is the Step 12 goal (mostly realized in
Green PR 4). Where they differ, the delta column names the slice that closes it.

| Panel (id)                                                                             | Owner (component + lifecycle)                                                                                                                           | Class                   | Initial visibility                | Current placement                                                                 | Frozen target                                                             | Restored?                       | Delta                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| `terminal`                                                                             | `TerminalPanel`, `preserveDomWhenHidden`; host `onMount`                                                                                                | Terminal                | Always visible                    | grid center                                                                       | flexible center, min 420×260                                              | yes (island identity preserved) | shell min-size is Green PR 3                        |
| `panel-placeholder`                                                                    | `PlaceholderPanel`; `openPlaceholder`/`closePlaceholder`                                                                                                | Persistent launcher     | Visible                           | grid right of terminal                                                            | removed once real rails exist                                             | yes                             | placeholder retired in Green PR 2                   |
| `avatar` `status` `vitals` `guildVitals` `xpmon` `omens` `sky` `stats` `buffs` `worth` | `InformationPanel`; `session.information`, `toggleInformationPanel`                                                                                     | Persistent launcher     | Hidden until launched             | grid right of terminal                                                            | left rail (260px), legacy order                                           | yes                             | rail geometry is Green PR 2/4                       |
| `group` `inventory` `quests` `achievements`                                            | `InformationPanel`; `session.information`                                                                                                               | Persistent launcher     | Hidden until launched             | grid right of terminal                                                            | right rail (260px)                                                        | yes                             | rail geometry is Green PR 2/4                       |
| `cyberware`                                                                            | `InformationPanel`; `session.information`                                                                                                               | Persistent launcher     | Hidden                            | grid right of terminal                                                            | right rail, available but hidden                                          | yes                             | —                                                   |
| `connection-health`                                                                    | `ConnectionHealthPanel`; `session.information`                                                                                                          | Persistent launcher     | Hidden until launched             | grid right of terminal                                                            | semantic replacement for legacy Connection; app chrome owns state         | yes                             | no legacy Connection pane added                     |
| `room`                                                                                 | `RoomPanel`; `session.world` owns Room.Info and the room-player lifecycle                                                                               | Persistent launcher     | Visible in a fresh desktop layout | right rail                                                                        | right rail, first in legacy order                                         | yes                             | resolved by the approved Room/Chat functional slice |
| `map`                                                                                  | `MapPanel` (`state.mapZoom`); `session.world`, `toggleWorldPanel`                                                                                       | Persistent launcher     | Hidden until launched             | grid by default; optionally either 260px rail or floating                         | float 400×350 right/top                                                   | yes                             | rail placement and zoom now restore                 |
| `roomImage`                                                                            | `RoomImagePanel`; `session.world`                                                                                                                       | Persistent launcher     | Hidden until launched             | grid by default; optionally either 260px rail or floating                         | float 400×225, initial 8px below Map (placement only)                     | yes                             | rail placement now restores                         |
| `roomPlaylist` (Jukebox)                                                               | `RoomPlaylistPanel`, `preserveDomWhenHidden`; `session.world` `playlistOpenVersion`                                                                     | Persistent launcher     | Hidden until available            | grid by default; optionally either 260px rail or floating                         | float 440×560 left/bottom                                                 | yes                             | controlled rail remount rejoins shared playback     |
| `chat`                                                                                 | `ChatPanel`, `preserveDomWhenHidden`; `session.notifications` owns validated channel metadata, roster count, active channels, and a bounded message log | Persistent launcher     | Hidden until launched             | float 750×370 right/bottom when launched; grid on compact/mobile                  | same geometry, launcher-hidden; passive channel labels and a combined log | yes                             | resolved by the approved Room/Chat functional slice |
| `areaMap` (Area Map)                                                                   | `MapPanel`; `session.world` `browseOpenVersion`                                                                                                         | Session-owned transient | Hidden until requested            | floating 520×420 left/top 40,40                                                   | float 400×350 left/top                                                    | **no**                          | size delta 520×420→400×350, Green PR 4              |
| `enemy` (Enemy)                                                                        | `CombatPanel`; Step 11 `session.combat`, `presentationAllowed` gate                                                                                     | Session-owned transient | Hidden outside combat             | grid right of terminal; `canClose` dismisses encounter                            | float 580×465 centered, raised while active (only explicit auto-front)    | **no**                          | float/raise is Green PR 3/4                         |
| `fishing` (Fishing)                                                                    | `FishingPanel`; `session.interactions` fishing                                                                                                          | Session-owned transient | Hidden until fishing              | floating 420×500 left/top 40,40                                                   | float 420×500 centered                                                    | **no**                          | centering is Green PR 4                             |
| `ide` (IDE)                                                                            | `IdePanel`, `preserveDomWhenHidden`, `canClose` guard; `session.ide`                                                                                    | Session-owned transient | Hidden until opened               | floating 900×620 centered (viewport-clamped)                                      | float 900×620 centered, foreground                                        | **no**                          | matches target                                      |
| `server-window-<id>`                                                                   | `ServerWindowPanel`, `canClose`/`showCloseButton` per `window.closable`; `session.interactions`                                                         | Session-owned transient | Server-driven                     | `serverPanelPlacement` (float / left / bottom / right; shared-video geometry key) | honor server placement/resize                                             | **no**                          | matches target                                      |

Restore set is exactly `[terminal, ...informationPanels, ...worldPanels,
chatPanel]` (`WorkspaceHost.svelte` restore call). `areaMap`, `enemy`,
`fishing`, `ide`, and every `server-window-*` are intentionally outside it, and
`hasTransientPanels()` cancels pending saves while any is open — so a transient
never resurrects and never persists geometry.

## Controls by class

| Class                   | Open/close                                                                         | Dock/float/resize             | Collapse                                      | Close button                                    |
| ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Terminal                | none (always present)                                                              | keyboard + pointer dock/float | never                                         | never                                           |
| Persistent launcher     | launcher toggle (`removePanel`) hides                                              | dock, float, resize           | accessible; restores                          | target: yes (Green PR 3)                        |
| Session-owned transient | domain owner; `enemy`/`ide` have `canClose` guards; `server-window` per `closable` | honor server/domain placement | local only where owner permits; not persisted | conditional (`server-window` `showCloseButton`) |
| Mobile sheet            | one active panel, sheet selection                                                  | none                          | hidden on mobile                              | none                                            |

## Resolved exclusions

| Former gap | Resolution                                                                                                                                                                                           | Evidence                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Room**   | `Session.world` now owns validated Room.Info plus Players/AddPlayer/RemovePlayer state; `RoomPanel` renders room metadata, occupants, and command-backed exits.                                      | `test/session-world.test.mjs`; `e2e/phase2-world.spec.ts`         |
| **Chat**   | Existing `session.notifications` Comm.Channel ownership now retains validated channel metadata, active channels, online count, and a 200-message log; `ChatPanel` renders only that public snapshot. | `test/session-notifications.test.mjs`; `e2e/phase2-world.spec.ts` |

No legacy panel lacks a Phase 2 owner. Connection Health remains the semantic
replacement for the legacy Connection pane.

## Optional world-panel rail evidence

Map, Room Image, and Jukebox are rail-eligible without joining either default
rail order. Public Dockview pointer events identify docked-tab and floating
single-panel drags; one awaited transfer owns teardown, remount, visibility,
focus, and persistence. Multi-panel floating windows are rejected intact.
The user removed the new left/right destination buttons from the Panels
dropdown on 2026-09-05. Cross-rail movement uses header dragging, matching
existing rail cards; no replacement context menu was added.

The version-2 composite snapshot retains optional rail Map zoom without a
version bump. If malformed input claims both a Dockview and rail owner,
Dockview wins deterministically. Compact/mobile presentation leaves persisted
desktop bytes unchanged and restores the captured rail owner on return.

Evidence: `test/workspace-persistence.test.mjs`,
`e2e/phase2-workspace.spec.ts`, and `e2e/phase2-world.spec.ts`. The player
fixture verifies actual iframe geometry at or above 200 by 200 CSS pixels,
exactly-once destroy/create, authoritative-playhead rejoin, stale callback
rejection, autoplay recovery, and explicit Stop persistence. An anonymous live
YouTube API probe rendered the real player and central play control at 229.5
by 200 CSS pixels in the 260px rail. The hidden transport bar could not be
certified from the headless screenshot. This does not mark Phase 2 production
certification complete.
