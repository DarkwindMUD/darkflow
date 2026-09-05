# Darkwind.Room.Playlist GMCP Protocol Specification

`Darkwind.Room.Playlist` synchronizes a shared YouTube jukebox among players in
one room. The server owns queue state, permissions, revision numbers, voting,
and the authoritative playhead. Playback remains opt-in in each browser.

## Support String

```text
Darkwind.Room.Playlist 1
```

## Messages

| Message | Direction | Purpose |
| --- | --- | --- |
| `Darkwind.Room.Playlist.State` | Server -> Client | Replace the authoritative room jukebox snapshot |
| `Darkwind.Room.Playlist.Open` | Server -> Client | Open the Jukebox pane after an explicit player inspection |
| `Darkwind.Room.Playlist.Action` | Client -> Server | Add, remove, reorder, pause, resume, skip, or vote |
| `Darkwind.Room.Playlist.Report` | Client -> Server | Report player readiness, completion, or playback error |

## State

```json
{
  "enabled": true,
  "room_id": "450359962737049",
  "revision": 12,
  "server_time": 1784700000,
  "name": "Temple Jukebox",
  "playback": {
    "status": "playing",
    "position": 35,
    "start_at": 1784699990,
    "current": {
      "id": 7,
      "video_id": "dQw4w9WgXcQ",
      "title": "Current song",
      "added_by": "Nacho",
      "duration": 212
    }
  },
  "queue": [
    {
      "id": 8,
      "video_id": "M7lc1UVf-VE",
      "title": "Next song",
      "added_by": "Player",
      "duration": 240,
      "can_remove": true
    }
  ],
  "skip_votes": 1,
  "skip_needed": 2,
  "permissions": { "add": true, "moderate": false }
}
```

`playback.status` is `stopped`, `playing`, `paused`, or `paused_empty`.
`can_remove` and `permissions.moderate` may be JSON booleans or LPC numeric
permission values (for example, the architect bitmask `32`). Zero is false;
nonzero is true. The client normalizes them to booleans before rendering.
`server_time` establishes the client/server clock offset. While playing, the
expected position is `position + (serverNow - start_at)`. Darkflow checks drift
every five seconds and seeks when playback differs by more than two seconds.

An unavailable room sends:

```json
{
  "enabled": false,
  "room_id": "450359962737049",
  "server_time": 1784700000
}
```

`Open` carries the same snapshot shape as `State`, but is reserved for a
player-driven interaction such as `look at jukebox`. Routine room entry,
reconnect, queue, and playback updates use `State` and must not open a pane the
player closed.

Entries require an 11-character YouTube `video_id`. The client clamps titles,
durations, positions, queue size, and numeric state before rendering.

## Actions

Every action includes the current `room_id` and `revision`:

```json
{
  "room_id": "450359962737049",
  "revision": 12,
  "action": "add",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

| Action | Additional fields |
| --- | --- |
| `add` | `url` |
| `remove` | `number` (one-based queue position) |
| `move` | `from`, `to` (one-based queue positions) |
| `vote_skip` | None |
| `pause` | None; moderator only |
| `resume` | None; moderator only |
| `skip` | None; moderator only |

The server rejects stale room/revision requests and publishes a new State after
accepted changes.

## Reports

Reports include the current entry id:

```json
{
  "room_id": "450359962737049",
  "revision": 12,
  "entry_id": 7,
  "report": "ready",
  "title": "Resolved YouTube title",
  "duration": 212
}
```

| Report | Additional fields | Purpose |
| --- | --- | --- |
| `ready` | `title`, `duration` | Supply metadata after the YouTube player loads |
| `ended` | None | Advance after authoritative playback reaches the end |
| `error` | `code` | Report a YouTube player error |

Darkflow dispatches a `darkflow:room-playlist-state` DOM event with each
normalized snapshot and a `darkflow:room-playlist-open` event for explicit
inspection requests, so browser extensions can observe the feature without
mutating the manager's internal state.
