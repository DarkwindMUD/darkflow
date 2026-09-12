# Performance notes

What has been measured about the client's main-thread cost, and the rules
that fell out of it. Measurements come from a headless Chromium (Edge) run
driven by Playwright with the CDP profiler attached, against a stand-in MUD
sending forty coloured lines and ten GMCP frames a second for twenty seconds.
Headless has no vsync, so frame counts are inflated; ratios between runs are
what matter.

## Findings, in order of cost

1. **Bar fills animated `width`.** A CSS transition on `width` forces a layout
   on every frame while it runs, and in a fight vitals arrive often enough
   that a bar is always mid-transition. With nothing but vitals flowing the
   renderer laid out once per frame. Fills now animate `transform: scaleX()`
   with `transform-origin` on the left (right for danger-when-full meters).
   Layouts per frame fell from one to roughly one in fourteen.
2. **The terminal kept three DOM copies of every line.** The history and live
   copies for the split scrollback were maintained even under the default
   pause behaviour, and every streaming line was rebuilt once per ANSI
   fragment into all three. The copies now exist only while the split
   behaviour is on, and line content is painted once per frame from a dirty
   set. Steady-state DOM size fell by about two thirds.
3. **The Scene loop read layout every frame.** The stage's tick read the
   pane's client size, forcing the terminal's pending layout early. The size
   is cached by the resize observer and the tick trusts it.
4. **GMCP variable flattening was quadratic in payload depth.** Both the
   session runtime and the legacy `gmcp-variables.js` re-normalised the whole
   variable path with three regexes at every node. Segment normalisation is
   memoised and names are built incrementally on the way down. A 600-item
   `Char.Items.List` frame went from about forty milliseconds to about
   thirteen. The two flatteners still both run; see below.
5. **Highlights compared styles by `JSON.stringify`, per character.** Replaced
   with a field comparison, and compiled highlight and trigger patterns are
   cached per definition object. The automation module also caches the
   derived definition lists between configuration changes instead of
   rebuilding them per line.
6. **Every information panel redrew on every publish.** Snapshots keep
   unchanged slices by reference, so a panel now skips its `innerHTML`
   rebuild when its slice is the same object or shallow-equal.
7. **`deepFreeze` re-walked already-frozen subtrees** on every snapshot
   publish; it remembers what it has frozen. The GMCP diagnostics recorder,
   which hears every frame, keeps a plain ring and builds its frozen snapshot
   only when something reads it. The transport reuses one `TextEncoder`.

## Results

Renderer busy time under the standard load, default layout: 49% before, 21%
after. With the Scene and a vital bar open at three times the text rate: 67%
before, 32% after. Long tasks from large payloads: a 58 KB inventory frame
took 52 ms in the handler before the flattener change.

## Rules of thumb

- Never transition `width`, `height`, `top`, or `left` on something that
  updates on a timer or a stream. Use `transform` or `clip-path`.
- Anything that runs per frame must not read layout (`clientWidth`,
  `scrollHeight`, `getBoundingClientRect`). Cache it from a resize observer.
- Per-line and per-packet code paths should not allocate per character or
  serialise for comparison. Cache compiled patterns by definition identity.
- A subscriber to a snapshot should compare its own slice by reference before
  redrawing.

## GMCP variables are flattened on read

Every frame used to be flattened into automation variables twice: once by
the session's own wildcard handler and once through the legacy compat bridge
(`registerGmcpVariables` in `public/js/gmcp-variables.js`, which the
bootstrap also registers on the bus). Under the dev server the two are even
different module instances, because imports from TypeScript get a `?import`
copy while the legacy graph loads the plain URL, so the legacy copy flattened
into a map only it could see.

Both flatteners now queue the latest payload per package and flatten when
the variables are read: when an alias, trigger, or function expands, or the
settings dialog lists them. Duplicate deliveries of one frame collapse to a
single queue entry, a fight's worth of frames nobody read costs nothing, and
the wiring is unchanged. The one semantic difference: if a package arrives
twice before a read, keys present only in the older payload are not kept.

## The Scene and tab drift

Connection Health's "tab drift" is the one-second local timer firing late,
which needs the main thread blocked for a hundred milliseconds or more at a
time. Profiled in headless Chromium at a 2x pixel ratio through a fight with
room art changing every few seconds, the Scene's draw costs well under a
millisecond per frame and the timer never drifted, so on a machine where
the Scene does drift the cost is in raster and compositing rather than in
the script. Three things were done about it:

- Per-frame work that scales with pixel count was trimmed: portraits are
  drawn from a pre-scaled disc instead of downscaling the full portrait
  every frame, token halos and side tints come from cached sprites instead
  of fresh gradients, the ring glow is a second stroke instead of a
  `shadowBlur` (a blur rasterised every frame), the draw no longer reads
  layout, and colour parsing is memoised. The head draw fell by two thirds.
- A pixel budget: past about 2.2 million device pixels the stage eases its
  pixel ratio down towards 1, so a large floating Scene on a 2x display
  rasterises about half the pixels for a slightly softer painting.
- A readout: set `localStorage.darkflow-scene-stats` to `"1"` (or pass
  `showStats` to the stage) and reload, and the canvas shows its smoothed
  draw time, the worst frame of the last five seconds, its size, and the
  pixel ratio in use. If draw time is small while drift persists, the Scene
  is not the cause; look at image loads, other panels, or the GPU process.

Room art is a stall in its own right: the shipped paintings are 1254 px
square PNGs of about 2.7 MB, and the first composition of a new painting
was the one long task (about 76 ms) in the run. Decoding is already
off-thread; the remaining option is to downscale off-thread as well with
`createImageBitmap` and its resize options before the first draw.
## The Auto-Angler and Connection Health

Running the Auto-Angler lit up all three Connection Health axes at once.
Profiled against a stand-in MUD that plays the whole fishing protocol,
two things were wrong, neither of them in the angler itself:

- **The workspace resubscribed every panel on every fishing event.** The
  host re-added the Fishing panel on each interactions snapshot even when
  it already existed. Dockview reported a layout change each time, the
  host re-synced its visible panels, and both the information and world
  runtimes sent a full `Darkwind.Client.Subscriptions` frame regardless of
  whether the set had changed: 34 such frames a minute, two per bite,
  hook, and catch, each asking the server to re-evaluate every panel. The
  host now adds the panel only when it is missing, and both runtimes skip
  the send when the panel set matches the last one sent on this
  connection (the memo clears on disconnect). A minute of fishing now
  carries only the fishing steps and health pings.
- **The Fishing panel wrote layout properties every frame.** The bite bar,
  cast meter, catch and tension meters, and the fish and bar markers were
  positioned with `width`, `height`, and `bottom`, forcing a layout on
  every frame of a cast, bite, and fight: 12,510 layouts in a minute.
  They now use `scaleX`, `scaleY`, and `translateY` in container-height
  units (`cqh`) on a size-contained track; the same minute lays out 113
  times. The fight snapshot is raw state and the `aria-valuenow` values
  are rounded so attribute writes happen when a whole number changes.

The angler's own loop is a handful of messages per cycle, spaced by
human-shaped delays, and its steering costs a fraction of a millisecond
per frame. What remains while it runs is the panel's CSS animation paint
(the water strip animates `background-position`; two pulses animate
`border-color` and `box-shadow`), which is bounded to those elements.
## Still open

- `Char.Vitals` fans out to every information panel, the combat, audio,
  notifications, and visual-effects runtimes, and the legacy panel manager.
  Panels now skip unchanged slices, but the runtimes still rebuild and freeze
  whole snapshots per frame.
- The inventory panel rebuilds its full list through `innerHTML` whenever the
  list changes; a keyed diff would help players with large inventories.
- The stand-in dev server run and `npm test` contend for CPU; the dev-server
  integration test resets its connection under that load and passes alone.
