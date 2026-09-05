# Comm GMCP Protocol Support

Darkflow advertises `Comm 1` and `Comm.Channel 1`. The package supplies the
Chat panel, desktop mention notifications, channel filters, and the player
roster used by the mention picker.

## Messages

| Message                | Direction        | Purpose                                     |
| ---------------------- | ---------------- | ------------------------------------------- |
| `Comm.Channel`         | Server -> Client | Receive a channel message                   |
| `Comm.Channel.Text`    | Server -> Client | Receive a channel message                   |
| `Comm.Channel.List`    | Server -> Client | Replace channel metadata                    |
| `Comm.Channel.Players` | Mixed            | Request or receive the online player roster |
| `Comm.Channel.Start`   | Server -> Client | Mark a channel active for this session      |
| `Comm.Channel.End`     | Server -> Client | Mark a channel inactive for this session    |
| `Comm.Channel.Enable`  | Client -> Server | Ask the server to enable one channel        |

## Channel Messages

Darkflow accepts both common field families:

```json
{
  "channel": "gossip",
  "talker": "Nacho",
  "text": "Hello there."
}
```

```json
{
  "chan": "gossip",
  "player": "Nacho",
  "msg": "Hello there."
}
```

The normalizer fills both aliases (`channel`/`chan`, `talker`/`player`, and
`text`/`msg`) before dispatch. A non-object payload becomes `{ "text": ... }`.
The Chat panel keeps the latest 200 distinct messages and suppresses an
immediately repeated message with the same channel, talker, and text. Channel
and active-channel labels are passive metadata above the combined log.

## Channel And Player Lists

`Comm.Channel.List` carries an array of channel objects. Darkflow preserves the
objects and uses common fields such as `name`, `caption`, and `command` when
rendering controls.

```json
[{ "name": "gossip", "caption": "Gossip", "command": "gossip" }]
```

`Comm.Channel.Players` is sent by Darkflow with an empty object after the first
character data confirms login:

```text
Comm.Channel.Players {}
```

The response is an array of player objects used by the Chat panel and mention
picker. The exact metadata is server-defined; `name` is the primary identity.

## Channel State

`Comm.Channel.Start` and `Comm.Channel.End` accept a channel string or an object
with `channel` or `name`. Darkflow maintains an active-channel list from these
messages.

To enable a channel, Darkflow sends its trimmed name as a JSON string:

```text
Comm.Channel.Enable "gossip"
```

Darkflow currently has no dedicated `Comm.Channel.Disable` helper.
