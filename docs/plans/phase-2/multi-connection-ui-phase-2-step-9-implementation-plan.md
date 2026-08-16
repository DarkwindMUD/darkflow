# Phase 2 Step 9 Implementation Plan

## Planning horizon

- Current horizon: Step 9 only — the IDE transfer/editor workflow and bundled
  CodeMirror.
- Dependency gate: Steps 6-8 are committed; Step 8 is commit `182b474`.
- Parity owner: `P2-9-ide`.
- Baseline: 45/45 focused IDE contract, lifecycle-census, and legacy panel-layout
  tests pass on 2026-08-15. No retained test currently opens an editor.
- Deferred: full Electron/release certification and default-root cutover remain
  Step 12. Step 9 owns only editor-specific packaged execution.

## Objective

Replace the Phase 2 IDE's legacy singleton/CDN path with one transient workspace
panel backed by a narrow `Session.ide` capability and locally bundled CodeMirror 6. Preserve single-file open/edit/save/diagnostic/close behavior, inline and
chunked GMCP transfers, keyboard/focus/mobile behavior, reconnect safety, and
silent disposal. Prove the editor executes in development, built web, and the
source-free packaged Electron application without requesting an editor CDN.

## Repository-backed constraints

- The legacy manager owns `Darkwind.IDE.Open`, `OpenStart`, `OpenChunk`,
  `OpenFinish`, and `SaveResult`; it sends `Save`, `SaveStart`, `SaveChunk`,
  `SaveFinish`, `SaveAbort`, and `Close`.
- Live mudlib payloads use `0|1` for `readOnly`, `editable`, and `success`; virtual
  documents may include `title`. Phase 2 must accept and normalize those shapes.
- Inline save is at most 256 KiB. Larger saves use 32 KiB JavaScript-string
  chunks, optional UTF-8 SHA-1, ordered Start/Chunk/Finish frames, and transport
  backpressure. The server ceiling is 512 chunks and 4 MiB.
- One active editor is parity. A new server Open replaces the previous editor
  silently, including a dirty buffer. User Close, Escape, workspace reset, and
  panel close retain dirty confirmation.
- The current syntax modes are C/C++, JSON, and Markdown. LPC/Python/text remain
  plain text; do not add an unneeded Python grammar.
- Svelte may consume only `Session.ide`; it must not import GMCP, transport,
  facade handles, event buses, resource scopes, or compatibility managers.
- The IDE panel is transient. Document content and an open IDE panel must never
  enter workspace/local-storage persistence.
- `public/js/ide-manager.js`, `public/js/ide-editor.js`, `public/css/ide.css`, and
  legacy `/` remain intact as rollback owners.

## Frozen behavior decisions

1. **Reconnect:** preserve the visible local buffer and dirty state, mark it
   stale/disconnected, disable Save, clear partial inbound transfers, cancel the
   active save generation/watchdog, and send no late chunks. Reconnect alone does
   not auto-save or re-authorize the buffer; a fresh server Open restores an
   authoritative editable document.
2. **Replacement:** preserve legacy server-authoritative semantics: a new valid
   Open replaces the active editor without a Close frame. The replacement
   invalidates pending save results so a late result cannot mark the new file
   saved. If a connected chunked save already sent `SaveStart`, replacement
   best-effort sends one `SaveAbort` so the server does not retain a partial
   transfer until its TTL.
3. **User close during save:** if connected, best-effort `SaveAbort` once, then
   exact `Close`; always stop local work. Session disposal is silent and sends
   neither Abort nor Close.
4. **SaveResult correlation:** accept a result only while the current open/save
   generation awaits one; when `path` is present it must match the active path.
   No speculative wire request id is added.
5. **Trust limits:** reject 513+ chunks, declared or accumulated content over
   4 MiB, bad indexes, missing chunks, and exact-length mismatch before publishing
   a document. `chunks` must be an integer in `1..512`; `totalLength` must be an
   integer in `0..4 MiB`; validation happens before allocation.
6. **Live gate:** authenticated read/open, local edit/dirty confirmation,
   discard, and Close only. Production Save is excluded without explicit approval
   and a disposable builder-owned file; deterministic fixtures own save mutation
   evidence.

## Public boundary

Add one frozen `Session.ide` capability:

- snapshot: connection state; active normalized document plus `openVersion`;
  inbound transfer progress/failure; save state/message; normalized diagnostics.
- named actions: `save(content)` and `close()`.
- subscriptions: one per session, removed by the session resource scope.

The capability owns validation, inbound reassembly, save generation, hashing,
chunking, typed sends, backpressure polling, timeout, reconnect invalidation, and
disposal. The panel owns CodeMirror text, selection, dirty baseline, focus,
confirmation UI, diagnostic navigation, and `EditorView.destroy()`.

## Minimum dependency set

Add the eight packages the legacy editor already uses, as exact dev dependencies:

- `codemirror`
- `@codemirror/view`
- `@codemirror/state`
- `@codemirror/theme-one-dark`
- `@codemirror/lang-cpp`
- `@codemirror/lang-json`
- `@codemirror/lang-markdown`
- `@codemirror/lint`

The resolved exact versions are `codemirror@6.0.2`,
`@codemirror/view@6.43.8`, `@codemirror/state@6.7.1`,
`@codemirror/theme-one-dark@6.1.3`, `@codemirror/lang-cpp@6.0.3`,
`@codemirror/lang-json@6.0.2`, `@codemirror/lang-markdown@6.5.2`, and
`@codemirror/lint@6.9.7`.

`codemirror` supplies `basicSetup`. Do not split it into more direct packages,
add Python support, introduce an editor abstraction, or change CSP in this step.
Ordinary client imports under `client/` let Vite create a lazy local editor
chunk; the copied legacy `public/js/ide-editor.js` stays unchanged.

## Green PR 1 — Install the bundled editor dependencies

**Files:** `package.json`, `package-lock.json` only.

**Implement:** install the exact eight packages and verify that a clean npm
install resolves them without changing unrelated dependency policy.

**Exit:** package/lock diff contains only the requested dependency graph; npm
install/build can resolve the local packages.

## Green PR 2 — Freeze `Session.ide` and transfer lifecycle

**Files:** `client/gmcp/contracts/darkwind-ide.ts`, shared validator/bus/session
composition files, new `client/runtime/ide.ts`, focused GMCP tests, and new
`test/session-ide.test.mjs`.

**Implement:** live-compatible wire types, named outbound helpers, validated
ingress, frozen snapshots, one-document generations, bounded out-of-order open
reassembly, inline/chunked save, SHA-1, injected internal buffered-amount read,
send failure/Abort, SaveResult correlation, reconnect policy, and silent disposal.
Reject save re-entry while one result is outstanding so a pathless SaveResult
cannot be misattributed to two saves of the same document.

**Required tests:**

- numeric and boolean Open/SaveResult shapes; title/editable normalization;
- malformed ingress ignored by `Session.ide` while advisory legacy dispatch
  remains unchanged;
- out-of-order and duplicate open chunks publish once; missing/bad/oversize/
  length-mismatched transfers do not publish or remain retained; negative,
  fractional, zero, and 513-chunk declarations are rejected before allocation;
- two sessions using the same transfer id remain isolated;
- exactly 262,144 characters use `Save`; 262,145 use Start, ordered 32 KiB
  Chunks, Finish, and deterministic hash; include non-ASCII content;
- backpressure delays later chunks; send/finish failure sends one Abort;
- replacement, path mismatch, disconnect, close, and disposal invalidate late
  digest/timer/chunk/result work without leaking listeners or timers; connected
  replacement aborts a started chunked save once; Save re-entry is rejected.

**Exit:** the public interface is frozen before UI work starts; no Svelte/runtime
consumer can access internal handles.

## Green PR 3 — Build the lazy bundled editor panel

**Files:** new client-owned CodeMirror module and new
`client/workspace/IdePanel.svelte` only.

**Implement:** ordinary local package imports behind a lazy panel import; one
EditorView; basic setup, one-dark theme, C/JSON/Markdown modes, lint compartment,
line/cursor status, dirty marker, read-only badge, Save/Close buttons, Mod-S,
Escape, dirty confirmation, diagnostic activation, focus capture/restore, save
status, and guarded destroy/lazy continuation.

**Exit:** the component imports only `Session`/public types and local CodeMirror
packages, retains existing `ide.css` classes, and destroys every editor/listener/
timer it creates.

## Green PR 4 — Integrate transient workspace behavior and browser evidence

**Root-owned integration files:** `WorkspaceHost.svelte`, Phase 2 HTML,
`dockview-workspace.ts`, Playwright project matching, and the integrated IDE
browser fixture.

**Implement:** register one `ide` renderer, open/activate it only when
`openVersion` advances, default to a centered/clamped 900x620 desktop float,
provide the normal mobile workspace panel, load `/css/ide.css`, exclude IDE from
workspace persistence/reset saves, and restore terminal focus only when the
closing editor still owns focus or focus falls to `body`.

Add the smallest workspace close-guard seam needed for the IDE: native Dockview
close, toolbar close, and Reset must ask the active panel whether removal may
continue before `api.removePanel`. Register the IDE renderer with
`preserveDomWhenHidden: true` so tab deactivation cannot destroy unsaved text.

**Development and built Chromium/mobile fixture:**

- single-frame writable Open, edit, dirty state, Save button and Mod-S exact
  payloads, success baseline reset, compile diagnostics, diagnostic navigation,
  Escape/Close exact path, and terminal focus restoration;
- numeric read-only Open has no Save and cannot edit;
- chunked Open arrives out of order and opens once; oversized/broken transfers
  stay bounded and closed;
- large save asserts Start/Chunk/Finish/Abort directions;
- new Open replacement and stale SaveResult cannot mutate the replacement;
- disconnect preserves stale dirty text, disables Save, cancels transfers, and a
  fresh Open restores editing;
- dock/float/resize/focus, 390x844 controls, dirty reset confirmation, transient
  non-persistence, native close cancel/accept, edit-hide-reactivate buffer
  continuity, repeated open/close, and session disposal/remount;
- abort every `esm.sh` request and assert none is attempted.

**Exit:** development and built desktop/mobile fixtures pass, including malformed,
reconnect, focus, layout, and disposal facets.

## Green PR 5 — Execute the editor in the source-free Electron package

**Files:** `desktop/main.cjs`, the packaged smoke runner, and their focused
contract tests only; avoid a product-only editor hook or default-route change.

**Implement:** launch the unpacked packaged executable, connect its Phase 2 page
to a local fake WebSocket fixture, inject a real `Darkwind.IDE.Open`, wait for the
local `.cm-editor`, edit/close through the packaged UI, record failed/external
requests, and assert no `esm.sh` or other editor CDN traffic. Reuse the existing
package validator to prove the ASAR contains the exact built client and excludes
`client/`, `public/`, tests, and build configuration.

**Exit:** `desktop:pack`, package validation, and packaged IDE smoke pass from the
same build artifact. This is editor-specific proof, not Step 12 release
certification.

## Green PR 6 — Integration, live gate, and completion record

**Root-owned:** final cross-slice review, plan/parity/completion documents, and
all verification orchestration.

**Verify:** focused Node; full `npm test`; check/lint/format/diff; build;
development and built Chromium/mobile IDE fixtures; full development browser
regression; typecheck baseline comparison; package/ASAR validation; packaged IDE
execution; authenticated live read/edit/discard/Close.

**Exit:** `P2-9-ide` is replaced only by observed evidence, the user is asked for
Step 9 commit permission, and Step 10 does not start before approval.

## Shared-file ownership

The orchestrator alone integrates `package.json`, `package-lock.json`, validators,
bus, `session.ts`, `session-factory.ts`, `WorkspaceHost.svelte`,
`dockview-workspace.ts`, Phase 2 HTML, Playwright configuration, desktop smoke
integration, and Phase 2 evidence docs.
After Green PR 2 freezes the capability, workers may concurrently own only
disjoint new runtime-test, editor-component, browser-fixture, or packaged-test
files.

## Success criteria

- [x] Live-compatible IDE shapes validate and malformed frames cannot mutate the
      new capability.
- [x] Inline/chunked open, save, abort, result, and close directions pass exact
      bounded two-session lifecycle tests.
- [x] CodeMirror loads lazily from local bundled assets with the existing feature
      set and no editor CDN request.
- [x] The transient IDE passes dirty/read-only/diagnostic/focus/layout/mobile/
      reconnect/disposal behavior without persisting source content.
- [x] Development, built web, and source-free packaged Electron execute the same
      editor path.
- [x] Authenticated live read/edit/discard/Close passes without a production save.
- [x] `P2-9-ide` is replaced; Step 12 retains full Electron/release ownership.

## Rollback

Revert the Step 9 commit and use legacy `/`. The legacy IDE manager/editor, CDN
path, CSS, package support declaration, and server protocol remain intact. Step 9
adds no storage schema and persists no source content; the eight bundled packages
revert with the commit.

## Execution fit

- Lead: Sol/high for transfer trust boundaries, session composition, workspace/
  packaged integration, live safety, and the commit gate.
- Workers: one runtime/test implementer, one editor component implementer after
  the API freezes, and one browser/package evidence implementer with disjoint
  ownership.
