# Phase 2 Step 4 Implementation Plan

_Ponytail full keeps this step to one public terminal capability, one imperative
terminal instance, the frozen effective-configuration snapshot, and one browser
fixture. It does not port definition editors, panels, or a generic event API._

## Planning selection

- Mode: detailed implementation plan
- Complexity: 5/10 — this is one terminal vertical slice with established
  transport, GMCP, automation, workspace, persistence, and lifecycle seams, but
  it must replace several legacy singletons without exposing factory internals
- Hard triggers: none; the Phase 2 master phase map makes Step 4 the current
  bounded horizon after Step 3
- Current planning horizon: Phase 2 Step 4 only — complete parity rows `P2-4-*`
  in the non-production `/phase2/` entry
- Evidence horizon: the completed Step 3 workspace host, public `Session`, text
  transport path, completion protocol, effective configuration, automation
  runtime/executor, legacy terminal/input controllers, history persistence, and
  development/built/mobile browser gates
- Adversarial review: focused — public-boundary leakage, lost early text,
  singleton state, duplicate command sends, completion direction, reconnect
  reset, persisted-history clobbering, timer disposal, and terminal remounting

## Planning status

Step 3 is locally `COMPLETE` for implementation revision
`ce22a89154cef7d854d3e3fa4afc3a82c5c364a6`. `/phase2/` owns one real-session
Dockview workspace and preserves one terminal DOM island; the island still shows
placeholder text and Step 4 owns its real behavior
(`multi-connection-ui-phase-2-step-3-implementation-plan.md:16-35`,
`client/workspace/WorkspaceHost.svelte:13-24`).

The default `/` root remains the production owner. This plan authorizes no
production cutover, packaged-Electron claim, legacy deletion, or Step 5/6 work.
Step 12 remains the only cutover and release-certification gate
(`multi-connection-ui-phase-2-implementation-plan.md:242-247`,
`multi-connection-ui-phase-2-step-1-parity-matrix.md:43-50`).

## Goal

Replace the Step 3 placeholder with one session-scoped terminal command loop
inside the existing workspace island. Preserve the current ANSI/output,
scrollback, focus, history, paste/batch, completion, alias, trigger, timer,
function, key-map, highlight, variable, and disposal behavior while removing
their runtime dependence on the legacy toolbar DOM and compatibility facades.

The step succeeds when `P2-4-terminal-output`, `P2-4-command-input`,
`P2-4-completion`, `P2-4-definitions`, and `P2-4-gmcp-variables` pass in
development and built web, with the owned mobile, keyboard/focus, reconnect, and
disposal facets. Terminal identity must remain stable through live workspace
movement; a document reload creates exactly one fresh terminal for the reused
character profile.

## Evidence and constraints

- Step 4 explicitly owns the terminal command loop, public-session automation
  consumption, history, completion, key mappings, aliases, triggers, timers, and
  variables; its exit requires development, built-web, mobile, reconnect, and
  disposal evidence (`multi-connection-ui-phase-2-implementation-plan.md:265-279`).
- The five frozen rows require one imperative output island, one input owner,
  direction-correct completion, representative execution of all six definition
  kinds, GMCP-variable reset/isolation, and no packaged-Electron claim
  (`multi-connection-ui-phase-2-step-1-parity-matrix.md:126-136`).
- The current public `Session` exposes connection and lifecycle operations but no
  text subscription, command send, completion, configuration subscription, or
  automation runtime (`client/runtime/session.ts:27-51`). Internal
  `SessionFacadeHandles` contains transport, GMCP, scope, and automation wiring
  and is expressly not a Phase 2 API
  (`client/runtime/session-factory.ts:22-35`,
  `../phase-1/multi-connection-ui-phase-1-step-16-decision.md:26-28`).
- The Phase 2 boot currently supplies `onText: () => {}`, so real inbound text is
  intentionally discarded by the preview (`client/app/phase2.ts:127-132`). The
  common boot transaction already has an ordered text sink used by legacy
  startup (`client/app/bootstrap-transaction.ts:164-184`,
  `client/app/bootstrap-transaction.ts:302-305`).
- Transport already preserves text-frame delivery, string command sends,
  send-result/error accounting, reconnect, and scope disposal. Step 4 must expose
  only the needed behavior, not the socket or transport object
  (`client/transport/types.ts:77-96`, `client/transport/connection.ts:421-468`).
- The session GMCP bus already supports scoped handlers and sends, while
  `Darkwind.Completion.Request` and `.Result` remain unmodeled pass-through
  packages. Step 4 owns their typed request/result contract and representative
  fixtures before consuming validated results
  (`client/gmcp/bus.ts:72-86`, `client/gmcp/contracts/validators.ts:140-174`,
  `../../gmcp-darkwind-completion.md:9-16`).
- Effective configuration is already a frozen, character-specific snapshot of
  aliases, triggers, highlights, functions, key mappings, and timers
  (`client/configuration/snapshot.ts:14-29`). The service already publishes fresh
  snapshots by character after valid commits (`client/configuration/service.ts:62-88`,
  `client/configuration/service.ts:204-220`).
- Automation variables and timer handles already live in a session-owned runtime
  backed by the root resource scope (`client/runtime/automation-runtime.ts:18-38`,
  `client/runtime/automation-runtime.ts:106-135`). The executor already carries
  the tested behavior for waits, scripts, recursive aliases/functions, toggles,
  timer control, and trigger steps, but it imports singleton managers directly
  (`public/js/automation-executor.js:1-20`,
  `public/js/automation-executor.js:672-832`).
- Character profiles already own a bounded `commandHistory` array
  (`client/model/profiles.ts:47-57`), and Phase 1 migration copied the active
  legacy history there without deleting the legacy key
  (`client/storage/legacy-migration.ts:112-125`,
  `client/storage/legacy-migration.ts:159-179`). No new storage key or schema
  version is needed.
- Legacy `output.js` contains the proven imperative line store, ANSI parsing,
  render scheduling, scrollback, focus helpers, trigger/highlight hooks, and
  deterministic reset (`public/js/output.js:1626-1818`,
  `public/js/output.js:1851-1879`). Legacy `input.js` still owns global DOM,
  socket, manager, history, batch, paste, and keyboard coupling
  (`public/js/input.js:1-35`, `public/js/input.js:758-918`).
- The Step 3 terminal component is intentionally small and preserves DOM identity
  with `preserveDomWhenHidden`; Step 4 must replace its placeholder implementation,
  not register a second panel or terminal (`client/workspace/TerminalPanel.svelte:1-50`,
  `client/workspace/WorkspaceHost.svelte:81-113`).
- Existing scripts already cover unit, type, Svelte, lint, format, build,
  development browser, production browser, and transport checks. No dependency,
  state library, terminal package, or new test runner is required
  (`package.json:20-55`).

## Decisions

### Add one public terminal capability, not public factory handles

Extend `Session` with a cohesive `terminal` property whose contract contains
only the behavior a mounted terminal needs:

```ts
interface SessionTerminal {
  readonly automation: AutomationRuntimeState;
  sendCommand(text: string): boolean;
  subscribeText(listener: (text: string) => void): Unsubscribe;
  requestCompletion(request: CompletionRequest): boolean;
  subscribeCompletion(listener: (result: CompletionResult) => void): Unsubscribe;
  subscribeConfiguration(listener: (snapshot: EffectiveConfigurationSnapshot) => void): Unsubscribe;
}
```

`subscribeText` fans out from the existing ordered boot text sink and owns each
listener with the session scope. `sendCommand` delegates to `transport.send` with
existing command metadata and returns its boolean result. The completion methods
are the only public GMCP surface added in this step: request sends the outbound
typed package; subscription accepts only validated inbound results. Configuration
subscription emits the current frozen snapshot immediately and then follows the
existing character subscription. `automation` is the existing session-owned
runtime object, not `SessionFacadeHandles` or a copied wrapper.

Do not expose `SessionTransport`, `SessionGmcpBus`, `SessionEventBus`,
`ResourceScope`, a WebSocket proxy, generic `sendGmcp`/`onGmcp`, generic `own`,
or the four compatibility bridges. If Step 4 needs another capability, stop and
replan the public contract rather than passing `handles` into Svelte.

### Extract instance cores; keep legacy wrappers

Preserve behavior by moving the reusable algorithms, not by importing the
legacy singleton graph into `/phase2/`:

- Extract the imperative output model/render scheduler from `output.js` into one
  DOM-targeted terminal-output instance. Inject only line processing, command
  send, geometry send, and optional media-link hooks. Keep `output.js` as the
  legacy wrapper around that same instance so `/` and its tests retain behavior.
- Extract manager-neutral alias matching/template resolution, trigger matching,
  highlighting, function lookup, and automation execution into instance/pure
  cores consumed by both the legacy managers and the Phase 2 automation owner.
  Reuse `alias-expression-core.mjs` and `automation-script-core.mjs`; do not copy
  their parsers or keep a second execution engine.
- Leave legacy editor CRUD, old storage fallback, compatibility-bridge imports,
  settings dialogs, sounds, media panels, and DOM event dispatch in the legacy
  wrappers. Step 5 owns the editors; Step 10 owns sound/media.

This is the minimum boundary that can support Phase 3's multiple session
instances. A temporary singleton imported by `/phase2/` would pass one-session
tests while preserving the root cause of cross-session state leakage.

### Let the terminal component own DOM; let Session own runtime state

`TerminalPanel.svelte` renders the existing output shell controls, output panes,
screen-reader live region, command input, send button, and accessible batch
drawer into the preserved Dockview renderer. On mount it creates exactly one
terminal-output instance and one input controller against those concrete
elements, subscribes to `session.terminal`, and disposes both on unmount/session
disposal.

`WorkspaceHost` passes the public `Session` through the panel state or renderer
context without persisting it in the JSON workspace snapshot. The terminal panel
remains `preserveDomWhenHidden`, non-closable, and singular. Remove the Step 3
placeholder buffer and helper registry only after the real renderer satisfies the
same identity/focus/scroll observations; keep test observation read-only.

Use Svelte only for markup and stateful controls. Keep ANSI parsing, line
virtualization, scroll anchoring, and render scheduling imperative. Do not add a
Svelte store, context framework, terminal emulator dependency, canvas rewrite,
or second buffer.

### One character history, one input owner

Add focused history load/save functions beside the other character-owned
persistence helpers. Load `commandHistory` from the validated graph, update only
the active character, cap it through the existing schema limit, re-read before
commit, and preserve the legacy `darkwind-cmd-history` bytes. Debounce one latest
write and flush on `pagehide` and disposal.

The input controller owns Enter, ArrowUp/Down, Tab, paste/batch, PageUp/Down,
Escape, printable-key focus, and effective key mappings. It uses native input,
textarea, dialog/focus behavior, and session methods. It must not inspect the
toolbar endpoint, global `state.ws`, legacy `dom`, `panelManager`, or a WebSocket
ready state. Shortcuts for settings and Step 6 panels remain with their owning
steps; Step 4 does not create empty callbacks for them.

### Completion is local-first and direction-correct

Move the current local alias and history completion algorithms into the input
core. A Tab press tries enabled alias completion, then enabled history completion,
then sends one `Darkwind.Completion.Request`. Track one pending line/cursor and
ignore a response after input changes, reconnect reset, or disposal. Repeated
ambiguous completion appends the formatted matches through the same terminal
output instance.

Define `CompletionRequest` and `CompletionResult` from the protocol document,
register their validators, and add representative valid/malformed wire fixtures.
The Phase 2 consumer never handles an invalid result. Do not generalize a GMCP
request broker for one package.

### One automation owner consumes the frozen snapshot

Create one terminal-automation instance per `Session` using the public effective
snapshot and the existing `AutomationRuntimeState`. It compiles/matches aliases,
triggers, highlights, functions, key mappings, and timers without editing them.
It sends through `session.terminal.sendCommand`, appends through the terminal
renderer, schedules waits/timers through `automation`, and reconciles timers on
each configuration snapshot without restarting unchanged timers.

All wildcard GMCP frames continue entering the existing session-owned variable
runtime. Reset GMCP variables when a connection transitions away from connected;
new frames repopulate them after reconnect. Do not persist variables, timer
handles, match state, recursion state, or compiled regexes.

`play_sound` remains an explicit no-op-with-message in Step 4 only if an existing
definition reaches it; Step 10 supplies the real session-owned sound effect. Do
not pull sound ownership forward merely to make the automation executor generic.

## Must-haves

- [MH1] The public boundary stays narrow — acceptance: Svelte imports only
  `Session`/`SessionTerminal`; no Phase 2 file imports `SessionFacadeHandles`,
  transport, bus, scope, socket proxy, or compatibility facade; command, text,
  completion, configuration, and automation tests use the public contract.
- [MH2] One real terminal replaces the placeholder — acceptance: real inbound
  ANSI text renders once; output scrolls, pauses/resumes, clears, announces in
  screen-reader mode, and retains one DOM identity/focus/native scroll through
  dock, float, resize, hide/show, mobile-sheet cycles, reconnect, and restore.
- [MH3] Command input has one owner — acceptance: Enter/send, empty command,
  history up/down, repeat setting, paste, multiline batch, PageUp/PageDown,
  Escape, printable-key focus, mobile keyboard focus, and effective key mappings
  work without a legacy DOM or direct socket read.
- [MH4] History is character-owned and reversible — acceptance: load/save/reload
  changes only the active character's capped history in one validated graph
  commit; another character and all unrelated fields are unchanged; the legacy
  history key is byte-identical; pending history flushes before disposal.
- [MH5] Completion is typed and ordered — acceptance: alias then history then
  server fallback matches legacy behavior; exactly one request is sent when
  needed; valid results update line/cursor; malformed, stale, post-reconnect, and
  post-disposal results do nothing; repeated ambiguity renders matches.
- [MH6] Definitions execute from one frozen snapshot — acceptance:
  representative alias, trigger/gag, timer, function, key-map, and highlight
  fixtures run with the editor-defined behavior; shared/local precedence is
  preserved; a new snapshot updates execution and reconciles timers once.
- [MH7] Automation state is session-only — acceptance: user and GMCP variables,
  recursion/match state, waits, and timers do not enter storage; reconnect clears
  GMCP variables but not user variables; two unit-created sessions cannot observe
  or cancel each other's state.
- [MH8] Disposal is complete and late work is inert — acceptance: disposing the
  session cancels renderer RAFs, observers, input/history/batch timers,
  completion/GMCP/configuration subscriptions, automation waits/timers, and DOM
  listeners; late text/results/configuration cannot mutate DOM or send commands;
  repeated disposal is harmless.
- [MH9] Existing owners remain stable — acceptance: `/` uses the same extracted
  cores through legacy wrappers and its focused terminal/input/automation tests
  remain green; `/phase2/` never loads `/js/app.js`; the workspace/persistence
  and connection-control suites do not regress.
- [MH10] Evidence stays scoped — acceptance: only the five `P2-4-*` rows receive
  replacement evidence; packaged Electron remains `MISSING (Step 12)`, Step 5
  editors and Step 6 panels remain open, legacy sources/keys remain rollback, and
  `/` remains production-owned.

## Out of scope

- Replacing `/`, deploying `/phase2/`, packaged Electron, immutable release
  certification, or changing the Step 12 cutover rule.
- Definition create/edit/delete UI, provenance display, settings tabs, shared-set
  workflows, or configuration persistence changes — Step 5 owns them.
- Information panels, GMCP debug/lag/RFC views, maps, windows, IDE, notifications,
  sound/media, combat, tutorial, effects, and specialty surfaces — Steps 6-11
  own them.
- Generic GMCP exposure on `Session`, a public event bus, public resource scope,
  compatibility-facade deletion, or `SessionFacadeHandles` promotion.
- Rewriting ANSI parsing, automation script syntax, arithmetic parsing, terminal
  virtualization, transport framing, reconnect policy, or the four-protocol
  ladder.
- Multiple live sessions, active/inactive tab input policy, background rendering,
  cross-session notifications, or four-session browser certification — Phase 3.
- New dependencies, a terminal-emulator package, Svelte store framework, generic
  controller factory, or speculative plugin API.

## Assumptions

- [The legacy terminal algorithms can be made instance-owned by extracting their
  state and injecting current side effects without changing rendered behavior] —
  if false: stop after Green PR 1 and split terminal-core extraction into its own
  evidence-backed step; do not import the singleton into `/phase2/`.
- [The completion protocol document is sufficient to type request/result without
  a server change] — if false: keep completion fallback legacy-owned and return
  to the protocol owner before marking `P2-4-completion` complete.
- [The current Phase 1 graph remains the authority for command history] — if
  false: a schema/migration change is required and Green PR 2 must be replanned
  before any write.
- [The frozen effective definitions contain every runtime field required by the
  current executor] — if false: correct the Phase 1 model/migration contract;
  never read missing runtime fields from legacy manager storage.
- [Playwright mobile Chromium remains the supported mobile gate] — if false: add
  the named physical-device evidence before completing MH3/MH10.

## Risks

- A public terminal API could become a renamed internal handle — mitigation: add
  only the five listed capabilities, forbid generic transport/GMCP/resource
  methods, and contract-test the exported keys.
- Text could arrive before the terminal subscribes or after it disposes —
  mitigation: reuse the ordered deferred sink, bind once during mount, and test
  pre-bind queue plus post-disposal delivery.
- Extracting `output.js` could silently change ANSI, virtualization, scroll, or
  trigger ordering — mitigation: make the legacy wrapper use the extracted core
  first and keep the existing output/runtime tests green before Svelte mounting.
- Input and trigger paths could send a command twice — mitigation: route manual,
  alias, trigger, timer, function, key-map, and batch sends through one
  `sendCommand` function and assert socket frames, not just UI echoes.
- A configuration refresh could restart live timers or use mixed revisions —
  mitigation: consume one immutable snapshot per update and reuse
  `reconcileTimers` idempotence tests.
- History commits could overwrite concurrent workspace/configuration changes —
  mitigation: re-read immediately before commit, replace only
  `commandHistory`, and assert unrelated graph equivalence.
- Completion responses could apply to the wrong input or connection epoch —
  mitigation: bind pending state to line/cursor plus reconnect generation and
  clear it on input, disconnect/reconnect, and disposal.
- Mobile/global shortcuts could steal focus from future editors — mitigation:
  preserve the existing editable-target exclusion and test input, textarea,
  contenteditable, and CodeMirror-shaped targets without importing Step 9.

## Green PR sequence

The five Green PRs are sequential and independently reviewable. Every PR keeps
`/` functional and `/phase2/` non-production. Repair a failing slice before its
dependent slice. Evidence recording follows Green PR 5 and is not another
implementation PR.

### Green PR 1 — Add the public terminal session contract

**Files:** `client/runtime/session.ts`, `client/runtime/session-factory.ts`,
`client/app/bootstrap-transaction.ts`, `client/gmcp/bus.ts`,
`client/gmcp/contracts/completion.ts`, `client/gmcp/contracts/validators.ts`,
`test/session-runtime.test.mjs`, `test/session-bootstrap.test.mjs`,
`test/completion.test.mjs`

**Intent:** Implement the exact `SessionTerminal` contract above. Reuse the boot
text sink for ordered subscription, transport send for commands, the existing
GMCP bus for typed completion, the existing configuration subscription, and the
existing automation runtime. Register runtime disposal with the root scope.
Preserve the compatibility bridges for `/`; do not expose or duplicate them.

**Tests:** Prove pre-bind text order, one/multiple/unsubscribed listeners, command
metadata and failed send, valid/malformed completion direction, immediate and
updated configuration snapshots, automation object identity/isolation, disposal,
and an exact public-key census that excludes internal handles.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/session-runtime.test.mjs test/session-bootstrap.test.mjs test/completion.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run typecheck
```

**Done when:** A consumer can receive text, send commands, complete input, follow
configuration, and use the existing automation runtime through `Session.terminal`
without any internal handle or generic bus access.

### Green PR 2 — Extract one instance-owned terminal output core

**Files:** `public/js/output.js`, `public/js/terminal-output-core.mjs`,
`client/workspace/TerminalPanel.svelte`, `client/workspace/terminal-island.ts`,
`client/workspace/WorkspaceHost.svelte`, existing focused output tests,
`e2e/phase2-terminal.spec.ts`

**Intent:** Extract the proven imperative output state/render scheduler into one
DOM-targeted instance and make legacy `output.js` its wrapper. Mount that same
core inside the existing terminal panel, pass the public session without
serializing it, bind inbound text, and remove the placeholder buffer. Preserve
one identity and read-only observation while replacing Step 3's synthetic
append/replace registry.

Do not port input or automation yet. The test fixture may inject text through
the public session test transport already used by browser fixtures; do not add a
production window bridge.

**Tests:** Preserve existing ANSI/line/scroll tests and add a `/phase2/` scenario
for pre-bind/live text, ANSI rendering, pause/live/clear, screen-reader region,
focus, scroll, dock/float/resize/restore identity, reconnect delivery, and
renderer disposal.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm test
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-terminal.spec.ts --project=chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
```

**Done when:** `/` and `/phase2/` use the same terminal-output core, the preview
renders real session text in exactly one preserved island, and no placeholder or
second output buffer remains.

### Green PR 3 — Port input, character history, and completion

**Files:** `client/workspace/TerminalPanel.svelte`,
`client/terminal/input-controller.ts`, `client/terminal/history.ts`,
`public/js/input.js`, `public/js/completion.js`, focused input/completion/history
tests, `e2e/phase2-terminal.spec.ts`

**Intent:** Mount one native command input/send control and one input controller.
Move only reusable tokenization, history completion, alias completion, paste/
batch extraction, history navigation, and editable-target logic out of legacy
singletons; keep `input.js`/`completion.js` as legacy wrappers. Persist history
through one focused character-graph helper and retain the legacy key unchanged.

**Tests:** Cover Enter/button/empty send, echo and one wire frame, Arrow history,
reload/two-character persistence, paste and timed batch cancellation, key focus,
PageUp/PageDown/Escape, local completion precedence, server request/result,
ambiguity, stale/malformed/reconnect/disposal results, and mobile focus.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/completion.test.mjs test/session-storage.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-terminal.spec.ts --project=chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-terminal.spec.ts --project=mobile-chromium
```

**Done when:** One input owner drives the public session, character history and
all three completion tiers work, and no Phase 2 input path reads legacy global
DOM/socket state.

### Green PR 4 — Port definition execution and GMCP variables

**Files:** `client/terminal/automation.ts`,
`client/runtime/automation-runtime.ts`, `public/js/automation-executor.js`,
`public/js/alias-manager.js`, `public/js/trigger-manager.js`,
`public/js/timer-manager.js`, `public/js/function-manager.js`,
`public/js/highlight-manager.js`, existing automation core files, focused
definition/automation tests, `e2e/phase2-terminal.spec.ts`

**Intent:** Extract instance/pure runtime operations from the six legacy manager
wrappers and configure one Phase 2 automation owner from each frozen snapshot.
Route every execution effect through the public terminal and its existing
automation runtime. Reconcile timers, reset GMCP variables on connection loss,
and keep editor/storage/event behavior in the wrappers.

Do not add a seventh generic manager, copy the script/arithmetic parsers, or port
settings UI. Keep the one explicit Step 10 sound deferral described above.

**Tests:** Reuse and extend the current definition/automation tests for effective
precedence, alias recursion/waits/variables, trigger gag/send, timer auto-start/
refresh/dispose, functions, key maps, highlights, GMCP flatten/reset/isolation,
and legacy-wrapper parity. Add one browser flow that observes each kind through
the real terminal/session boundary.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/session-definition-adapters.test.mjs test/session-automation-runtime.test.mjs test/automation-executor.test.mjs test/automation-script-core.test.mjs test/alias-expression-core.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-terminal.spec.ts --project=chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run typecheck
```

**Done when:** All six definition kinds and GMCP/user variables execute from one
session-scoped snapshot/runtime, refresh and reconnect semantics pass, and the
legacy root still uses the same extracted cores.

### Green PR 5 — Complete built-web, mobile, reconnect, and disposal parity

**Files:** `e2e/phase2-terminal.spec.ts`, `e2e/phase2-workspace.spec.ts`,
`playwright.config.ts`, `playwright.production.config.ts`, `package.json`

**Intent:** Add the terminal fixture to the already-existing Chromium and
mobile-Chromium projects in development and built configurations. Exercise real
keyboard/touch/focus and session lifecycle surfaces, not direct controller calls.
Keep the workspace fixture's Step 3 assertions and `/` legacy scenario intact.

Update existing test matches/scripts only as needed; do not add another browser
config, test bridge, dependency, or physical-device claim.

**Tests:** Run the complete Step 4 terminal flow in desktop/mobile development
and built web; include disconnect/reconnect, layout movement/restore, disposal
during pending batch/completion/wait/timer/render work, late-event rejection,
and unchanged legacy-root terminal/input behavior.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-terminal.spec.ts --project=chromium --project=mobile-chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser:production -- e2e/phase2-terminal.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** All five `P2-4-*` cutover conditions are met in development and
built web with mobile, keyboard/focus, reconnect, and disposal facets green,
while packaged Electron remains explicitly deferred.

### Completion gate — Run the Step 4 battery and record evidence

**Files:**
`docs/plans/phase-2/multi-connection-ui-phase-2-step-1-parity-matrix.md`,
`docs/plans/phase-2/multi-connection-ui-phase-2-implementation-plan.md`,
`docs/plans/phase-2/multi-connection-ui-phase-2-step-4-implementation-plan.md`

**Intent:** After Green PR 5, select one clean implementation revision, run the
full battery, append replacement evidence only to `P2-4-*`, and mark Step 4
`COMPLETE` only when every owned facet is green. Keep `/`, legacy files/keys,
Steps 5-12, packaged Electron, release candidate, and cutover status unchanged.

Use the repository-pinned toolchain:

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm test
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run typecheck
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run lint
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run format:check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- --project=chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-terminal.spec.ts --project=mobile-chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser:production
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:transports
git diff --check
npx prettier --check docs/plans/phase-2/multi-connection-ui-phase-2-step-1-parity-matrix.md docs/plans/phase-2/multi-connection-ui-phase-2-implementation-plan.md docs/plans/phase-2/multi-connection-ui-phase-2-step-4-implementation-plan.md
```

**Done when:** One revision has all local Step 4 evidence, only five owned rows
are updated without overstating Electron/release status, the legacy rollback
path remains green, and Steps 5/6 can plan against the frozen terminal boundary.

## Success criteria

- [ ] MH1-MH10 are satisfied by Green PRs 1-5 and the completion gate.
- [ ] `/phase2/` owns one real terminal/input/automation loop through the public
      session while `/` remains the production owner.
- [ ] Terminal identity, output, scroll, focus, input, history, completion, all
      six definition kinds, and variables pass development and built web.
- [ ] Mobile keyboard/focus, reconnect reset/recovery, and deterministic disposal
      pass without a second terminal or legacy singleton import.
- [ ] Character history updates atomically while legacy history bytes and all
      unrelated application graph fields remain unchanged.
- [ ] Existing unit, type, Svelte, lint, format, build, browser, transport, and
      diff/plan-format checks exit cleanly.
- [ ] Only `P2-4-*` receives evidence; packaged Electron and later ports remain
      open.

## Rollback

Step 4 does not change `/` or delete legacy sources. Runtime rollback is to stop
serving or remove the non-linked `/phase2/` terminal port and return its terminal
panel to Step 3's inert placeholder. Revert Green PRs 5 through 1 in reverse
order: integrated evidence, automation, input/history/completion, output core,
then public session capability. Correct the completion record separately.

The original `darkwind-cmd-history` key is never modified or deleted. The
validated character graph remains readable by Step 3; a pre-Step-4 client ignores
the new public methods and continues using the legacy terminal/input wrappers.
Extracted cores must retain their legacy wrappers until Phase 4, so reverting the
Phase 2 mount does not require restoring copied algorithms.

If command, completion, history, or automation parity fails, leave Step 4
`OPEN`, preserve the last passing Green PR, and keep `/` as the functional
rollback. Do not bypass the failure by loading `/js/app.js`, exposing handles,
writing legacy keys, or switching the production root.

## Execution fit

- Scope: multi-run phase
- Lead: Terra at high reasoning — the implementation is bounded, but one owner
  must preserve the public session boundary, extract singleton algorithms without
  behavior drift, and integrate text/input/automation/disposal sequentially
- Workers: none — all five Green PRs share the terminal/session/automation
  contract and later slices depend on the previous slice's frozen behavior
- Delegation shape: solo staged handoff
- Ownership: the lead owns public API review, legacy-wrapper compatibility,
  terminal integration, persistence safety, candidate selection, rollback, and
  final evidence
- Replan trigger: output cannot become instance-owned without a behavioral
  rewrite; completion needs a server-contract change; history needs a schema
  migration; effective definitions omit an execution field; Step 4 needs generic
  GMCP/transport access; or legacy `/` regresses after core extraction
- Confidence: medium — transport, session, automation runtime, configuration,
  workspace, lifecycle, and test paths are proven; the main uncertainty is the
  size and safety of extracting the legacy output/executor singleton state

Plan self-review: PASS (9/10)

Notes:

- Every must-have maps to a Green PR and runnable completion check.
- The plan adds no dependency, generic event system, second terminal, duplicate
  automation engine, settings UI, panel port, or production cutover.
- The executor must freeze the Green PR 1 contract before touching the renderer;
  any need for internal handles is a replan trigger, not an implementation detail.
