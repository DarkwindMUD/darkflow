# Core GMCP Protocol Support

This document describes the `Core` GMCP messages used by Darkflow. `Core` is
part of the GMCP handshake itself and is not listed as a package in
`Core.Supports.Set`.

## Messages

| Message | Direction | Purpose |
| --- | --- | --- |
| `Core.Hello` | Client -> Server | Identify Darkflow and report its runtime version and terminal geometry |
| `Core.Hello` | Server -> Client | Optional server identity used to scope the generic map cache |
| `Core.Supports.Set` | Mixed | Replace the sender's complete package support set |
| `Core.Supports.Add` | Server -> Client | Add packages to the server support set cached by Darkflow |
| `Core.Supports.Remove` | Server -> Client | Remove packages from the server support set cached by Darkflow |
| `Core.Ping` | Mixed | Payload-free request/echo used to measure game-path round-trip time |

## Core.Hello

Darkflow sends `Core.Hello` immediately after a WebSocket connection opens and
again when the player requests a full GMCP restart.

```json
{
  "client": "Darkflow",
  "version": "<runtime version>",
  "width": 120,
  "height": 34
}
```

The `version` value is loaded at runtime from `public/version.json`. `width` and
`height` are the latest measured terminal dimensions, with defaults of 75 by
24 if measurement is not available yet.

Darkflow also accepts a server-originated `Core.Hello` object. It passes that
object to the generic mapping source so maps learned from different games or
servers do not share the same local cache identity.

## Core.Supports

After `Core.Hello`, Darkflow sends `Core.Supports.Set` with the complete list in
[`public/js/gmcp.js`](../public/js/gmcp.js). Package names are followed by a
protocol version:

```text
Core.Supports.Set ["Char 1","Room 1","Darkwind.MapData2 2"]
```

Darkflow also accepts `Core.Supports.Set`, `Core.Supports.Add`, and
`Core.Supports.Remove` from a server. Array payloads and object payloads are
both accepted:

```json
["Darkwind.Sound 1", "Darkwind.Lag 1"]
```

```json
{
  "Darkwind.Sound": 1,
  "Darkwind.Lag": 1
}
```

The resulting server support map is used to gate optional client requests,
including `Darkwind.Lag.Get`, and to show or hide optional controls such as the
sound widget. Standard package names are canonicalized case-insensitively for
the packages listed in `gmcp-normalizer.js`.

## Core.Ping

When the connection-health monitor is enabled, Darkflow sends a payload-free
`Core.Ping` every five seconds while connected and visible:

```text
Core.Ping
```

The server echoes `Core.Ping` without a payload or with an empty string (`""`).
Darkflow accepts both empty forms and correlates one
outstanding request at a time and records the elapsed round-trip time. This is
separate from `Darkwind.Lag.Status`, which reports server-side driver health.

## Reset Behavior

On disconnect or a manual GMCP restart, Darkflow clears the cached server
support set. A restart sends a new `Core.Hello`, a new `Core.Supports.Set`, a
full `Darkwind.Client.Subscriptions` snapshot, and a media refresh request.
