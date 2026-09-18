# Darkwind.Window GMCP Protocol Specification

This document specifies the `Darkwind.Window` GMCP package as implemented by the current web client renderer and manager.

## Package Overview

Support declaration advertised by the client:

```json
["Darkwind.Window 2"]
```

| Message | Direction | Purpose |
|---------|-----------|---------|
| `Darkwind.Window.Open` | Server -> Client | Open or replace a modal or panel window |
| `Darkwind.Window.Update` | Server -> Client | Apply supported element updates to an existing window |
| `Darkwind.Window.Close` | Server -> Client | Close an existing window |
| `Darkwind.Window.Submit` | Client -> Server | Submit collected form data for a submit action |
| `Darkwind.Window.Action` | Client -> Server | Invoke a non-submit, non-close button action |
| `Darkwind.Window.Closed` | Client -> Server | Notify the server that the user closed a closable window |

## Darkwind.Window.Open

Direction: `Server -> Client`

Opens a new window. If the `id` already exists, the client closes the existing window first and replaces it.
Windows whose layout contains `youtube_embed` are instanced by the client so each shared video opens in a fresh window instead of replacing another video from the same source id. The client remembers the last closed shared-video window rectangle and reuses that location and size for later shared videos.

### Schema

```json
{
  "id": "string",
  "type": "modal",
  "title": "string",
  "closable": true,
  "width": 420,
  "height": "60vh",
  "dock": "right",
  "order": 99,
  "layout": { "type": "vertical", "children": [] }
}
```

### Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | Yes | Stable window identifier |
| `type` | string | No | `panel` opens in a dock; any other value is treated as a modal |
| `title` | string | No | Modal header title or panel title |
| `closable` | boolean | No | `false` disables modal close affordances |
| `width` | string or number | No | Modal width; numbers are interpreted as pixels |
| `height` | string or number | No | Modal height; numbers are interpreted as pixels |
| `dock` | string | No | Panel dock, default `right` |
| `order` | number | No | Panel ordering value, default `99` |
| `defaultFloatW` | number | No | Initial width hint when `dock` is `float` |
| `defaultFloatH` | number | No | Initial height hint when `dock` is `float` |
| `defaultFloatX` | number | No | Initial X coordinate hint when `dock` is `float` |
| `defaultFloatY` | number | No | Initial Y coordinate hint when `dock` is `float` |
| `defaultBelowPanel` | string | No | Panel id to position below when `dock` is `float` |
| `defaultSnapLeft` | boolean | No | Initial float snap preference |
| `defaultSnapTop` | boolean | No | Initial float snap preference |
| `defaultSnapRight` | boolean | No | Initial float snap preference |
| `defaultSnapBottom` | boolean | No | Initial float snap preference |
| `layout` | object | Yes | Root node rendered by the window renderer |

### Supported Node Types

The current client supports only these node types.

#### Layout nodes

- `vertical`
- `horizontal`
- `grid`

`grid` also accepts `columns` as either a number or a `grid-template-columns` string.

#### Display nodes

- `heading`
- `paragraph`
- `text`
- `divider`
- `progress`
- `image`
- `youtube_embed`
- `ansi_text`
- `paged_text` (Window v2; panel windows only)
- `npc_dialogue`
- `player_row`
- `finger_profile`
- `street_samurai_dashboard`

#### Input nodes

- `text`
- `password`
- `number`
- `select`
- `checkbox`
- `button`
- `hidden`

Node `id` values are important for later updates. They are rendered as `data-dw-id` on node wrappers. Inputs also use `id` as their submitted form key.

### Shared Node Properties

| Field | Type | Applies To | Notes |
|-------|------|------------|-------|
| `id` | string | All nodes | Enables targeted updates; for inputs it also becomes the submission key |
| `style` | object | All nodes | Only allowlisted CSS properties are applied |

Allowlisted style properties:

```text
color, background, backgroundColor, fontSize, fontWeight, fontStyle,
textAlign, padding, paddingTop, paddingBottom, paddingLeft, paddingRight,
margin, marginTop, marginBottom, marginLeft, marginRight,
gap, justifyContent, alignItems, flexDirection,
width, maxWidth, minWidth, height, maxHeight, minHeight,
border, borderRadius, opacity, gridTemplateColumns, overflow,
lineHeight, textTransform
```

### Node-Specific Fields

| Node Type | Fields Read By Client |
|-----------|-----------------------|
| `heading`, `paragraph`, `text` | `text` |
| `progress` | `value`, `color`, `label` |
| `image` | `src`, `alt`, `loading`, `loadingText` |
| `youtube_embed` | `src`, `url`, `title` |
| `ansi_text` | `text` |
| `paged_text` | required `id` and complete `text`; rendered as a locally paged ANSI-safe reader |
| `npc_dialogue` | `npc`, `title`, `text`, `choices` |
| `player_row` | Character summary fields used by login and `who` |
| `finger_profile` | Structured player profile fields |
| `street_samurai_dashboard` | `state`, `active_tab`; see [Street Samurai](gmcp-darkwind-street-samurai.md) |
| `text`, `password` | `label`, `value`, `placeholder` |
| `number` | `label`, `value`, `min`, `max`, `step` |
| `select` | `label`, `value`, `options[]` with `value` and optional `label`; optional `dependsOn` and `optionsByValue` for cascading selects |
| `checkbox` | `label`, `checked` |
| `button` | `text`, `label`, `action` |
| `hidden` | `value` |

For buttons, the supported `action` values are:

- `submit`
- `close`
- `action`

`submit` buttons are treated as primary buttons by the client. `close` buttons dispatch a local close flow and do not send `Darkwind.Window.Action`.

For a dependent `select`, `dependsOn` names another input node by `id` and
`optionsByValue` maps each controlling value to that select's option array. The
client replaces the dependent options immediately when the controlling input
changes and selects the first available option when the previous value is not
present.

## Runtime Behavior

### Controlled paged output (Window v2)

A panel with a `paged_text` root is one complete paging session. Its stable
window id replaces the prior session with that id, starts at the top, and has
no Window callback or action messages. The client owns native scrolling plus
Previous Page, Next Page, Top, and Bottom controls; it does not capture
Terminal input for paging.

### Closable modal handling

For modals, `closable !== false` enables all user-initiated close paths:

- header close button
- backdrop click
- `Escape`

When the user closes a closable modal or panel through the client UI, the client sends:

```json
{ "id": "window_id" }
```

as `Darkwind.Window.Closed`, then removes the window locally.

If `closable` is `false`, the modal close button is not rendered and the client ignores backdrop-click and `Escape` close attempts.

### Enter submit behavior

When a modal is open, pressing `Enter` clicks the first `.dw-button-primary` button if one exists, except:

- when focus is inside a `TEXTAREA`
- when focus is on a non-primary button

The current renderer does not create a textarea control, but the guard exists in the manager.

## Darkwind.Window.Update

Direction: `Server -> Client`

Applies supported updates to elements inside an open window. The current client only applies the operations implemented in `updateElements`.

### Schema

```json
{
  "id": "window_id",
  "updates": [
    {
      "id": "element_id",
      "text": "new text",
      "style": { "color": "red" }
    }
  ]
}
```

### Supported Update Operations

| Field | Applies To | Client Behavior |
|-------|------------|-----------------|
| `id` | All | Required target element identifier |
| `style` | Any node with matching `data-dw-id` | Merges allowlisted inline styles |
| `text` | Display nodes and buttons | Replaces element text content |
| `value` | `progress` | Updates progress fill width |
| `color` | `progress` | Updates progress fill color |
| `label` | `progress` | Updates progress label text |
| `src` | `image` | Sets or replaces image source and removes loading text if present |
| `alt` | `image` | Updates image alt text when an image element exists |
| `value` | Inputs | Updates checkbox checked state or input/select value |
| `placeholder` | Text-like inputs | Updates placeholder |
| `disabled` | Inputs | Updates disabled state |
| `options` | `select` | Replaces all options and then restores the prior selected value if possible |

### Important Limits

- Updates target existing nodes only.
- The client does not support structural patch operations such as insert, remove, replace-node, or append-child.
- The client does not re-run layout creation from update payloads.
- `text` updates operate on rendered DOM text, not on a stored schema tree.
- `youtube_embed` is rendered as a sandboxed iframe.

## Darkwind.Window.Close

Direction: `Server -> Client`

Closes a window by `id`.

```json
{
  "id": "window_id"
}
```

This is a silent close from the client's perspective; it does not send `Darkwind.Window.Closed` back to the server.

## Darkwind.Window.Submit

Direction: `Client -> Server`

Sent when a `button` with `action: "submit"` is clicked, or when modal `Enter` handling triggers that button.

```json
{
  "id": "window_id",
  "button": "button_id",
  "data": {
    "username": "Gandalf",
    "password": "mellon",
    "remember": true
  }
}
```

### Form Data Rules

- Any rendered input with an `id` participates.
- Checkboxes submit booleans.
- Number inputs submit `valueAsNumber`.
- Other inputs submit strings.

## Darkwind.Window.Action

Direction: `Client -> Server`

Sent when a `button` with `action: "action"` is clicked.

```json
{
  "id": "window_id",
  "button": "button_id"
}
```

## Darkwind.Window.Closed

Direction: `Client -> Server`

Sent when the user closes a window through a supported client close path.

```json
{
  "id": "window_id"
}
```

## Transport

GMCP frames are sent as:

```text
PackageName JSONPayload
```

Example:

```text
Darkwind.Window.Update {"id":"login","updates":[{"id":"error","text":"Invalid password"}]}
```
