# Char GMCP Protocol Support

Darkflow advertises the standard `Char` package family and uses it to render
character panels, inventory, active defences, and combat targets.

## Advertised Support

```text
Char 1
Char.Vitals 1
Char.Status 1
Char.StatusVars 1
Char.Stats 1
Char.RealStats 1
Char.Worth 1
Char.Enemy 1
Char.Items 1
Char.Defences 1
```

## Messages

| Message | Direction | Client behavior |
| --- | --- | --- |
| `Char.Vitals` | Server -> Client | Render HP, SP, movement, level progress, carry load, and an embedded opponent |
| `Char.StatusVars` | Server -> Client | Store the server's status-variable metadata |
| `Char.Status` | Server -> Client | Merge character identity/status deltas and render the Status panel |
| `Char.Stats` | Server -> Client | Store current attributes |
| `Char.RealStats` | Server -> Client | Store base attributes for comparison with current values |
| `Char.Worth` | Server -> Client | Render dedicated gold and bank values |
| `Char.Enemy` | Server -> Client | Render or close the authoritative combat target; also feeds visual Combat mode |
| `Char.Items.List` | Server -> Client | Replace inventory state for `location: "inv"` |
| `Char.Items.Add` | Server -> Client | Add one inventory item |
| `Char.Items.Remove` | Server -> Client | Remove one inventory item by id |
| `Char.Items.Update` | Server -> Client | Replace one inventory item by id |
| `Char.Defences.List` | Server -> Client | Replace the active buff/debuff list |
| `Char.Defences.Add` | Server -> Client | Add or replace one buff/debuff |
| `Char.Defences.Remove` | Server -> Client | Remove one buff/debuff by name |

## Char.Vitals

The full Darkwind snapshot includes:

```json
{
  "hp": 420,
  "maxhp": 500,
  "sp": 180,
  "maxsp": 220,
  "rested": 0
}
```

Darkwind cached deltas retain the core HP/SP fields, so after the initial
snapshot Darkflow treats the full-only `rested` field as the full-snapshot
marker. Payloads without it merge into the previous snapshot. The following
fields have visible behavior:

| Field | Notes |
| --- | --- |
| `hp`, `maxhp` | Hit-point bar |
| `sp`, `maxsp` | Spell-point bar; optional as a pair |
| `fp`, `maxfp` | Movement bar; optional as a pair |
| `level_pct` | Percent toward the next player level |
| `carry`, `maxcarry` | Carry-load reverse meter |
| `encumberance_label` | Carry-meter tooltip |
| `opponent` | Embedded enemy object processed like `Char.Enemy` |
| `avatar_charge*`, `avatar_active_*`, `divine_patron` | Avatar charge/active-state display |

For cross-MUD compatibility, Darkflow normalizes `mhp` to `maxhp`; accepts
`mana`, `mp`, or `sp`; accepts `mmana`, `maxmana`, `maxmp`, `mmp`, or `maxsp`;
and accepts `move`/`fp` plus `mmove`/`maxmove`/`maxfp`.

## Status And Stats

`Char.Status` is sticky state. The initial snapshot and later deltas are merged.
The renderer recognizes `name`, `fullname`, `race`, `class`, `level`, `xp`,
`nl`, `align`, `title`, `gender`, `gold`, `bank`, `dead`, `drunk`, `invis`,
`sit`, and `viking`. If no dedicated `Char.Worth` has arrived, `gold` and
`bank` also feed the Worth panel.

`Char.StatusVars` may be any object. Darkflow stores the latest complete object
for inspection and future rendering, but the current Status panel uses its
fixed field list rather than generating rows from this metadata.

`Char.Stats` uses `str`, `int`, `wis`, `dex`, `con`, and `chr`.
`Char.RealStats` uses `realstr`, `realint`, `realwis`, `realdex`, `realcon`,
and `realchr`. Current values are compared with base values to show increases
or decreases.

`Char.Worth` accepts:

```json
{ "gold": 1250, "bank": 6000 }
```

## Char.Enemy

Darkwind's native shape is:

```json
{
  "enemy_name": "a training construct",
  "enemy_curhp": 75,
  "enemy_maxhp": 100,
  "enemy_cursp": 20,
  "enemy_maxsp": 30,
  "enemy_hp_string": "wounded",
  "enemy_is_npc": 1,
  "enemy_image": "/assets/generic-monster.png"
}
```

Darkflow also accepts a generic shape with `name`, `hp`, `mhp` or `maxhp`,
`mn`/`mana`/`sp`, `mmn`/`maxmana`/`maxsp`, `level`, `image`/`avatar`, and
`hp_string`. An empty name or `"None"` closes the target panel.

The optional [Darkwind.Combat](gmcp-darkwind-combat.md) package changes the
existing Enemy pane into a visual Combat scene during an active encounter, but
does not replace this message. During the recipient's own fight,
`Char.Enemy` remains authoritative for the staged target's name, HP,
condition, NPC identity, and art. `enemy_is_npc` is `1` for NPC targets and
`0` for player targets, allowing the client to choose the correct missing-art
fallback without guessing from health text. Until generated NPC art is cached,
Darkwind sends `/assets/generic-monster.png` as `enemy_image`; a later
`Char.Enemy` update replaces it with the generated URL. A passive observed fight instead uses the Combat State
roster for participant identity and does not reuse recipient-private or stale
`Char.Enemy` values. Combat State supplies lifecycle and roster identity,
while Combat Events supply transient outcomes.

## Char.Items

The current UI consumes inventory updates only. Room and container locations
may be received and inspected in the GMCP debug surfaces, but they do not alter
the Inventory panel.

```json
{
  "location": "inv",
  "items": [
    { "id": "sword-1", "name": "a steel sword (main weapon)", "attrib": "l" }
  ]
}
```

`Char.Items.Add`, `Char.Items.Remove`, and `Char.Items.Update` use
`{ "location": "inv", "item": { ... } }`. Item `id` is the stable update
key. The renderer uses `name` and `attrib`; `attrib` containing `l`, `w`, or
`c` marks wielded, worn, or container items.

## Char.Defences

```json
{
  "name": "stoneskin",
  "desc": "Your skin is hardened.",
  "kind": "buff",
  "duration": 120,
  "remaining": 85
}
```

`kind` is `buff`, `debuff`, or `unknown`; other values render as `buff`.
`duration` and `remaining` are seconds. `List` carries an array of these
objects, `Add` carries one object, and `Remove` may carry either a string name
or `{ "name": "stoneskin" }`.
