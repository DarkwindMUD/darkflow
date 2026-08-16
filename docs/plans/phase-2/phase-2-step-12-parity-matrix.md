# Phase 2 Step 12 — Panel parity and behavior matrix

Green PR 1 artifact for
[`phase-2-step-12-legacy-look-and-feel.md`](./phase-2-step-12-legacy-look-and-feel.md).
This records, at base `bff841e`, the single Phase 2 owner, class, current
placement, frozen target, controls, persistence, and mobile behavior for every
workspace panel — plus the two explicit exclusions. It is the reference the
executable parity/behavior tests assert against; the plan's "Frozen target" and
"Pane behavior by class" tables are the authority when this file and the plan
disagree.

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

| Panel (id) | Owner (component + lifecycle) | Class | Initial visibility | Current placement | Frozen target | Restored? | Delta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `terminal` | `TerminalPanel`, `preserveDomWhenHidden`; host `onMount` | Terminal | Always visible | grid center | flexible center, min 420×260 | yes (island identity preserved) | shell min-size is Green PR 3 |
| `panel-placeholder` | `PlaceholderPanel`; `openPlaceholder`/`closePlaceholder` | Persistent launcher | Visible | grid right of terminal | removed once real rails exist | yes | placeholder retired in Green PR 2 |
| `avatar` `status` `vitals` `guildVitals` `xpmon` `omens` `sky` `stats` `buffs` `worth` | `InformationPanel`; `session.information`, `toggleInformationPanel` | Persistent launcher | Hidden until launched | grid right of terminal | left rail (260px), legacy order | yes | rail geometry is Green PR 2/4 |
| `group` `inventory` `quests` `achievements` | `InformationPanel`; `session.information` | Persistent launcher | Hidden until launched | grid right of terminal | right rail (260px) | yes | rail geometry is Green PR 2/4 |
| `cyberware` | `InformationPanel`; `session.information` | Persistent launcher | Hidden | grid right of terminal | right rail, available but hidden | yes | — |
| `connection-health` | `ConnectionHealthPanel`; `session.information` | Persistent launcher | Hidden until launched | grid right of terminal | semantic replacement for legacy Connection; app chrome owns state | yes | no legacy Connection pane added |
| `map` | `MapPanel` (`state.mapZoom`); `session.world`, `toggleWorldPanel` | Persistent launcher | Hidden until launched | grid right of terminal | float 400×350 right/top | yes | float defaults are Green PR 4 |
| `roomImage` | `RoomImagePanel`; `session.world` | Persistent launcher | Hidden until launched | grid right of terminal | float 400×225, initial 8px below Map (placement only) | yes | float defaults are Green PR 4 |
| `roomPlaylist` (Jukebox) | `RoomPlaylistPanel`, `preserveDomWhenHidden`; `session.world` `playlistOpenVersion` | Persistent launcher | Hidden until available | grid right of terminal | float 440×560 left/bottom | yes | float defaults are Green PR 4 |
| `areaMap` (Area Map) | `MapPanel`; `session.world` `browseOpenVersion` | Session-owned transient | Hidden until requested | floating 520×420 left/top 40,40 | float 400×350 left/top | **no** | size delta 520×420→400×350, Green PR 4 |
| `enemy` (Enemy) | `CombatPanel`; Step 11 `session.combat`, `presentationAllowed` gate | Session-owned transient | Hidden outside combat | grid right of terminal; `canClose` dismisses encounter | float 580×465 centered, raised while active (only explicit auto-front) | **no** | float/raise is Green PR 3/4 |
| `fishing` (Fishing) | `FishingPanel`; `session.interactions` fishing | Session-owned transient | Hidden until fishing | floating 420×500 left/top 40,40 | float 420×500 centered | **no** | centering is Green PR 4 |
| `ide` (IDE) | `IdePanel`, `preserveDomWhenHidden`, `canClose` guard; `session.ide` | Session-owned transient | Hidden until opened | floating 900×620 centered (viewport-clamped) | float 900×620 centered, foreground | **no** | matches target |
| `server-window-<id>` | `ServerWindowPanel`, `canClose`/`showCloseButton` per `window.closable`; `session.interactions` | Session-owned transient | Server-driven | `serverPanelPlacement` (float / left / bottom / right; shared-video geometry key) | honor server placement/resize | **no** | matches target |

Restore set is exactly `[terminal, placeholder, ...informationPanels,
...worldPanels]` (`WorkspaceHost.svelte` restore call). `areaMap`, `enemy`,
`fishing`, `ide`, and every `server-window-*` are intentionally outside it, and
`hasTransientPanels()` cancels pending saves while any is open — so a transient
never resurrects and never persists geometry.

## Controls by class

| Class | Open/close | Dock/float/resize | Collapse | Close button |
| --- | --- | --- | --- | --- |
| Terminal | none (always present) | keyboard + pointer dock/float | never | never |
| Persistent launcher | launcher toggle (`removePanel`) hides | dock, float, resize | accessible; restores | target: yes (Green PR 3) |
| Session-owned transient | domain owner; `enemy`/`ide` have `canClose` guards; `server-window` per `closable` | honor server/domain placement | local only where owner permits; not persisted | conditional (`server-window` `showCloseButton`) |
| Mobile sheet | one active panel, sheet selection | none | hidden on mobile | none |

## Explicit exclusions (not unknown work)

| Missing | Status | Gate before Step 13 |
| --- | --- | --- |
| **Room** | No panel. May render from `Session.world.room` after a bounded audit. | Separately approved functional slice, or parity waiver |
| **Chat** | No panel. Legacy default 750×370 right/bottom; needs a real output/channel ownership decision. Must not be inferred from terminal DOM. | Separately approved functional slice, or parity waiver |

No panel outside these two lacks a Phase 2 owner. Connection Health is a
semantic replacement for the legacy Connection pane, not a gap. This satisfies
the Green PR 1 exit: "matrix has no unknown owner except the documented
Room/Chat exclusions."
