# Darkwind.Divine GMCP Protocol Specification

This document specifies the `Darkwind.Divine` GMCP package, which carries divine-patron pressure and omen state for the Omens panel.

## Package Overview

Support declaration advertised by the client:

```json
["Darkwind.Divine 1"]
```

| Message | Direction | Purpose |
|---------|-----------|---------|
| `Darkwind.Divine` | Server -> Client | Replace the player's current omens/divine-patron state |

The package has no client -> server messages. Server pushes are driven by patron, holy-hour, and eclipse state changes.

## Darkwind.Divine

Direction: `Server -> Client`

Replaces the omens snapshot used by the Omens panel. The full payload is sent each time; clients should not attempt to merge older payloads.

### Schema

```json
{
  "patron": "mitra",
  "patron_label": "Mitra",
  "rank": 3,
  "rank_label": "Initiate",
  "modifier_pct": 25,
  "state": "ascending",
  "leader": "mitra",
  "leader_label": "Mitra",
  "changed_at": 1776834302,
  "pressure_scale": {
    "mitra": 100,
    "gaea": 40,
    "set": 0
  },
  "holy_hour": {
    "god": "mitra",
    "expires_at": 1776837902
  },
  "eclipse": {
    "active": false,
    "expires_at": 0,
    "seconds_left": 0,
    "cooldown_left": 0
  },
  "summary": "Mitra holds the heavens; the air is bright."
}
```

### Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `patron` | string | No | Lowercase patron key (`mitra`, `gaea`, `set`) or `""` for none |
| `patron_label` | string | No | Display-cased patron name; client falls back to a local label table |
| `rank` | number | No | Numeric rank within the patron's hierarchy |
| `rank_label` | string | No | Pre-formatted rank text shown as `Standing` |
| `modifier_pct` | number | No | Patron charge percentage; rendered as `Charge` via a local label helper |
| `state` | string | No | Server-side state machine token (e.g. `ascending`, `silent`); not rendered directly |
| `leader` | string | No | Lowercase ascendant god key, or `""` when no ascendant |
| `leader_label` | string | No | Display-cased ascendant name; client falls back to a local label table |
| `changed_at` | number | No | Unix timestamp of the last divine state change |
| `pressure_scale` | object | No | Per-god pressure values, normalized 0-100. Keys are `mitra`, `gaea`, `set` |
| `holy_hour` | object | No | Active Holy Hour, if any |
| `holy_hour.god` | string or 0 | No | Lowercase god key currently in Holy Hour; 0 means none |
| `holy_hour.expires_at` | number | No | Unix timestamp when the Holy Hour ends |
| `eclipse` | object | No | Set Eclipse state |
| `eclipse.active` | boolean or 0/1 | No | True or 1 when an eclipse is currently active |
| `eclipse.expires_at` | number | No | Unix timestamp of eclipse end |
| `eclipse.seconds_left` | number | No | Seconds remaining in the eclipse |
| `eclipse.cooldown_left` | number | No | Seconds remaining on the eclipse cooldown |
| `summary` | string | No | One-sentence narrative summary; defaults to `The omens are quiet.` when omitted |

### Client Behavior

- The payload is stored as `gmcpData.omens` and the Omens panel is re-rendered.
- `patron` is propagated into the active `Char.Vitals` cache (as `divine_patron`) so the avatar meter can theme itself per patron.
- The Omens panel renders the summary, a 2x2 status grid (Patron, Standing, Charge, Ascendant), per-god pressure bars from `pressure_scale`, and chips for any active Holy Hour or Set Eclipse. When `holy_hour.god` and `eclipse.active` are both falsy, the panel shows "No active divine event."
- Pressure values are clamped to the inclusive 0-100 range before rendering.

### Server Behavior

- Sent on login, on patron rank or modifier changes, on pressure updates, on Holy Hour and Eclipse transitions, and after manual refresh requests.
- The server populates `pressure_scale` by normalizing raw pressures to a 0-100 scale relative to the highest current pressure.

## Transport

GMCP frames are sent as:

```text
PackageName JSONPayload
```

Example:

```text
Darkwind.Divine {"patron":"mitra","rank_label":"Initiate","modifier_pct":25,"pressure_scale":{"mitra":100,"gaea":40,"set":0},"summary":"Mitra holds the heavens."}
```
