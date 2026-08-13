# Phase 2 Step 5 Implementation Plan

_Ponytail full keeps this step to one public configuration capability, one
application-settings store, native Svelte forms, and one browser fixture. It
does not expand the Phase 1 graph, recreate the legacy 2,752-line settings
manager, or add shared-set attachment workflows._

## Planning selection

- Mode: detailed implementation plan
- Complexity: 5/10 — Step 5 joins one established public session boundary to
  application settings and six character/shared definition editors, with
  existing persistence and validation contracts but new visible UI evidence
- Hard triggers: none; this is one reversible, non-production Step 5 horizon
- Current planning horizon: Phase 2 Step 5 only — complete the three `P2-5-*`
  rows in the non-default `/phase2/` entry
- Evidence horizon: the public `Session`, Phase 1 application graph and
  configuration service, Step 4 effective-definition consumers, legacy settings
  and editor behavior, and development/built/mobile browser gates
- Adversarial review: focused — source ownership, public-boundary leakage,
  stale shared-set writes, local/shared identity conflicts, runtime-state
  persistence, legacy rollback, and mobile/focus behavior

## Planning status

Step 2's shell/profile boundary is complete, and the current `/phase2/` boot
passes one public `Session` into Svelte without loading `/js/app.js`
(`client/app/phase2.ts:87-132`). Step 4 already consumes the frozen six-kind
effective snapshot through `Session.terminal` and keeps automation variables and
timer handles session-owned (`client/runtime/session.ts:36-64`,
`client/terminal/automation.ts:24-48`).

The default `/` root remains the production and rollback owner. This plan does
not authorize production cutover, packaged-Electron evidence, legacy deletion,
or Steps 6-12 work. Step 12 remains the release-certification gate
(`multi-connection-ui-phase-2-implementation-plan.md:181-188`).

## Goal

Give the active character in `/phase2/` an accessible Svelte settings surface
that edits application settings and all six definition kinds through their real
Phase 1 owners. The UI must show whether an effective definition is local or
comes from an attached shared set, publish shared-set changes with compare-and-
swap, and keep variables and execution state out of persistence.

The step succeeds when `P2-5-general-settings`, `P2-5-definition-editors`, and
`P2-5-precedence-publication` pass in development and built web, including their
mobile, keyboard/focus, reload, stale-write, reconnect-snapshot, and runtime-
isolation facets (`multi-connection-ui-phase-2-step-1-parity-matrix.md:138-146`).

## Evidence and constraints

- The Phase 1 graph deliberately has four persisted owners: narrow application
  defaults, server profiles, character profiles, and configuration sets. Only
  `themeKey` is modeled as a general application default; definitions, history,
  workspace, and audio have their named owners
  (`client/model/profiles.ts:47-73`, `docs/session-model.md:73-88`).
- The exact six kinds are aliases, triggers, highlights, functions, key
  mappings, and timers. Shared sets hold one kind and positive revision; local
  definitions live on the character (`client/model/configuration.ts:5-7`,
  `client/model/configuration.ts:129-200`).
- Effective configuration already resolves built-ins, attached sets in order,
  and local definitions last, returning source metadata with shared-set ID and
  revision (`docs/session-model.md:127-140`,
  `client/configuration/snapshot.ts:14-29`). Do not create a second precedence
  implementation in Svelte.
- `publishConfigurationSet` already re-reads storage, rejects stale revisions,
  commits through the validated repository, and notifies subscribers only after
  success (`client/configuration/service.ts:95-153`).
  `replaceLocalDefinitions` already changes one character and leaves other
  profiles and shared sets alone (`client/configuration/service.ts:155-205`).
- The public `Session` exposes effective configuration for reading but no editing
  capability. `SessionFacadeHandles` exposes transport, GMCP, scope, and event
  internals and remains compatibility-only (`client/runtime/session.ts:46-64`,
  `client/runtime/session-factory.ts:23-36`).
- The compatibility bridge reconstructs CRUD by repeatedly reading the graph and
  replacing whole local-kind arrays (`client/app/session-bridge-wiring.ts:61-158`).
  Step 5 should call the configuration service directly through a public
  capability, not import that bridge into Svelte.
- The legacy settings blob has 19 normalized fields, but key mappings have
  already moved to `CharacterProfile.localDefinitions`; the compatibility path
  deliberately excludes them when saving general settings
  (`public/js/settings-manager.js:990-1014`,
  `public/js/settings-manager.js:593-609`).
- Legacy general settings apply terminal, workspace, theme/background, sound,
  lag, and visual-effects side effects from one singleton
  (`public/js/settings-manager.js:186-214`,
  `public/js/settings-manager.js:377-392`). Step 5 must not pull the Step 6 lag,
  Step 10 audio, or Step 11 visual-effects owners forward merely to reproduce
  that coupling.
- The repository performs one validated `setItem` for the application graph
  (`client/storage/repository.ts:49-69`). Keep it as the only graph write; do not
  add IndexedDB, a second graph key, or a schema version.
- Existing transformed tests already prove all-six-kind precedence,
  publication, notification, local isolation, and failure behavior
  (`test/effective-configuration.test.mjs:355-502`). Existing adapter tests pin
  source display and stable key-mapping identities
  (`test/session-definition-adapters.test.mjs:748-771`,
  `test/session-definition-adapters.test.mjs:821-895`). Reuse those contracts
  instead of copying legacy managers.
- The project already has Svelte, native `<dialog>`, Typia-transformed validation,
  Playwright development/built/mobile projects, and focused quality scripts. No
  new dependency, form library, state library, or test runner is needed
  (`package.json:20-55`, `playwright.config.ts:1-51`,
  `playwright.production.config.ts:1-51`).

## Decisions

### Use one public configuration capability

Add `session.configuration`, backed by the existing repository and
configuration service:

```ts
interface SessionConfiguration {
  getSnapshot(): CharacterConfigurationSnapshot;
  subscribe(listener: (snapshot: CharacterConfigurationSnapshot) => void): Unsubscribe;
  replaceLocalDefinitions<K extends ConfigKind>(
    kind: K,
    definitions: LocalDefinitions[K],
  ): ConfigurationWriteResult;
  publishConfigurationSet(input: PublishConfigurationSetInput): PublishConfigurationSetResult;
  setThemeKey(themeKey: string): ConfigurationWriteResult;
}
```

`CharacterConfigurationSnapshot` contains the active character ID, its six local
arrays, the attached shared sets needed by those six references, and the existing
frozen effective snapshot. It contains no entire application graph, other
profiles, storage object, socket, runtime variables, timer handles, or mutable
references. Return fresh cloned/frozen data after each successful write.

Build the capability once from `StorageLike` plus the active character ID during
the existing boot transaction and pass it into session composition. Reuse
`publishConfigurationSet`, `replaceLocalDefinitions`, `readState`, and `commit`;
add only the focused read model and `themeKey` graph update they do not provide.
Do not expose `StorageLike`, `SessionFacadeHandles`, generic repository CRUD, or
item-level mutation methods.

### Keep the frozen ownership model; do not migrate general settings

Use these sources:

| Data                                               | Authoritative Phase 2 source                              | Step 5 behavior                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Theme key                                          | `ApplicationDefaults.themeKey`                            | edit through `session.configuration`; mirror to the retained legacy settings blob only for rollback compatibility |
| Terminal/control/browser preferences               | `darkwind-client-settings`                                | normalize and patch the existing key while preserving fields this step does not own                               |
| Endpoint/protocol                                  | active `ServerProfile` plus Step 2 connection controls    | show current connection read-only; do not create a second endpoint editor                                         |
| Six definition kinds                               | attached `ConfigurationSet`s plus active character locals | edit through `session.configuration` with provenance                                                              |
| Automation/user/GMCP variables and timer execution | `Session.terminal.automation`                             | optional live Variables view/edit; never persist                                                                  |
| Workspace/layout                                   | character workspace from Step 3                           | offer the existing reset action only; do not restore legacy classic/floating ownership                            |
| Lag, audio, visual effects                         | Steps 6, 10, and 11                                       | preserve their existing settings bytes and omit their controls until the owning port lands                        |

Create a small application-settings module that loads the existing blob,
normalizes only the settings consumed by the current Phase 2 shell/terminal,
patches those fields, and preserves unknown/deferred fields. Do not add those
browser-global preferences to `ApplicationStateV1` in this step.

### Use native Svelte forms, not a generic form framework

Add one Settings button to the existing shell and one Svelte `<dialog>`. Use
native labels, inputs, selects, details, buttons, form validation, Escape, and
focus return. The dialog owns a draft and does not write until Apply or Save.
Storage/validation failures stay visible and retain the draft.

Use a small kind switch for the six discriminated definition shapes. Share only
the automation-step form used by aliases, triggers, and timers; functions,
highlights, and key mappings remain direct native forms. Generate IDs with
`crypto.randomUUID()`. Use the existing identity normalizer to reject duplicate
local identities before save, then rely on repository validation at the trust
boundary.

Do not port draggable/resizable window geometry, DOM factories, custom focus
traps, search indexing, preview frameworks, or import/export in the first
replacement. Native dialog containment and the browser's constraint validation
cover the current acceptance contract with much less code.

### Make provenance determine the save path

Render each effective row with a visible source label:

- `Local` rows edit the active character's complete local array.
- `Shared: <label>` rows edit that one attached set and publish its current
  `expectedRevision`.
- The empty built-in tier remains read-only.

Deleting a local row removes only that local definition. Deleting a shared row
publishes a new revision of that same set; it does not detach the set. Adding a
row defaults to local. Attaching, detaching, duplicating, reordering, or creating
shared sets remains Phase 3.

If a subscription arrives while a shared row is being edited, keep the draft and
mark it stale. Save must use its captured revision, surface `stale-revision`, and
offer Reload; it must never silently overwrite the newer set. Local saves replace
only one active-character kind and then refresh from the emitted snapshot.

### Let existing consumers prove publication

Step 4 already subscribes to effective configuration and reconciles terminal
automation (`client/terminal/automation.ts:24-48`). Browser tests should edit one
definition of every kind and prove the live consumer changes without reload
where observable: alias send, trigger/gag, timer action, function call, key
mapping, and highlight rendering.

On reconnect, the editor keeps persisted definitions but receives the current
fresh configuration snapshot. Variables remain session-local and GMCP variables
reset through the existing Step 4 lifecycle. Do not add a settings event bus or
duplicate automation runtime.

## Must-haves

- [MH1] The public boundary stays narrow — acceptance: Svelte imports only
  `Session`/`SessionConfiguration`, application-settings helpers, and definition
  types; no Phase 2 settings file imports compatibility facades, repository,
  transport, GMCP, scope, socket, or factory handles.
- [MH2] General settings use their intended source — acceptance: theme commits to
  `ApplicationDefaults.themeKey`; current Phase 2 browser preferences round-trip
  through `darkwind-client-settings`; key mappings do not write that legacy
  field; deferred fields survive byte-for-byte at the parsed-value level.
- [MH3] Every definition kind supports create, edit, enable/disable, and delete —
  acceptance: aliases, triggers, highlights, functions, key mappings, and timers
  validate and reload with stable IDs and exact kind-specific identities.
- [MH4] Provenance and precedence are visible and correct — acceptance: local
  overrides display `Local`, shared winners display the attached set label and
  revision, saving uses the displayed source, and the effective order remains
  built-in then attached-set order then local.
- [MH5] Publication is atomic and stale-safe — acceptance: shared writes use the
  current expected revision, increment exactly once, notify after commit, and
  preserve the draft on stale/validation/storage failure with zero partial UI or
  runtime publication.
- [MH6] Character and runtime isolation hold — acceptance: local writes change
  only the active character; another character and unrelated graph fields remain
  unchanged; variables, timer handles, compiled patterns, and edit drafts never
  enter storage.
- [MH7] Existing live consumers update once — acceptance: one successful save
  emits one fresh snapshot and Step 4 changes alias/trigger/timer/function/key-map/
  highlight behavior without a second configuration resolver or page reload.
- [MH8] The settings dialog is accessible and mobile-usable — acceptance: labeled
  controls, visible error/status text, native keyboard traversal, Escape/Close,
  focus entry/return, 390-by-844 scrolling, touch targets, reduced motion, and no
  horizontal overflow pass in development and built web.
- [MH9] Lifecycle is deterministic — acceptance: closing/unmounting removes the
  dialog subscription and listeners; session disposal closes the dialog; late
  configuration delivery cannot mutate detached UI; repeated open/close leaves
  one dialog and one subscriber.
- [MH10] Rollback remains available — acceptance: `/` and its legacy settings/
  manager tests remain green, legacy keys and sources are not deleted,
  `/phase2/` does not load `/js/app.js`, and Step 12 still owns cutover.
- [MH11] Evidence stays scoped — acceptance: only the three `P2-5-*` rows receive
  replacement evidence; packaged Electron remains `MISSING (Step 12)` and later
  settings owned by Steps 6/10/11 remain open.

## Out of scope

- Replacing `/`, deploying `/phase2/`, packaged Electron, immutable release
  certification, or changing the Step 12 cutover rule.
- Expanding or versioning `ApplicationStateV1`, moving every browser preference
  into the graph, or deleting/migrating legacy settings keys.
- Shared-set attach/detach/create/duplicate/reorder UX, cross-profile management,
  or multiple live sessions — Phase 3 owns them.
- Lag diagnostics, sound/media controls, and visual-effect controls — Steps 6,
  10, and 11 own their visible ports and acceptance.
- Reimplementing automation execution, effective precedence, graph validation,
  ANSI/output behavior, terminal history/completion, or workspace persistence.
- Import/export, draggable/resizable settings geometry, settings search, custom
  theme import, and a general schema-driven form renderer. Add one only if a
  frozen parity row or user request makes it required.
- New dependencies, a state/form library, a generic repository, a settings event
  bus, or a second configuration service.

## Assumptions

- [The Step 1 `P2-5-general-settings` row requires load/validate/save/reload, not
  every incidental legacy modal feature] — if false: import/export, search, or
  window geometry must be added as explicit acceptance before implementation.
- [Browser-global terminal/control preferences may remain in the retained legacy
  settings blob because the frozen Phase 1 graph has no owner for them] — if
  false: this becomes a schema migration and must be replanned before Green PR 2.
- [Editing existing attached shared sets is in Phase 2, while membership workflows
  remain Phase 3] — if false: shared rows become read-only and the stale-write UI
  acceptance moves to a service/browser fixture rather than the editor.
- [Aliases, triggers, and timers are the only kinds needing the shared
  `AutomationStep[]` editor] — if false: extend that one component only when a
  frozen definition type requires it.

## Risks

- A general-settings port could accidentally widen the frozen graph — mitigation:
  Green PR 2 uses the ownership table above and preserves deferred legacy fields.
- A generic editor could erase kind-specific validation or identity — mitigation:
  use the discriminated model plus `identityKeyForDefinition`, with one browser
  create/edit/delete fixture per kind.
- A shared edit could overwrite a newer revision — mitigation: capture the
  displayed revision and require compare-and-swap; stale failure keeps the draft.
- A successful write could update storage but not Step 4 — mitigation: Green PR 1
  returns the post-commit snapshot through the existing configuration
  subscription, and every UI slice proves one live consumer.
- Mobile settings could become an unusable desktop modal — mitigation: native
  dialog/focus behavior and mobile development+built gates land with the first
  visible slice, not at closeout.

## Green PR sequence

### Green PR 1 — Expose the active character configuration capability

**Files:** `client/configuration/editor.ts`, `client/configuration/service.ts`,
`client/runtime/session.ts`, `client/runtime/session-factory.ts`,
`client/app/bootstrap-transaction.ts`, `test/effective-configuration.test.mjs`,
`test/session-runtime.test.mjs`

**Intent:** Add the minimal read snapshot, active-character local replacement,
shared-set CAS publication, theme update, and subscription capability described
above. Compose it during boot with the existing storage and character ID. Reuse
the repository/service; do not expose storage or add item-level CRUD.

**Tests:** Extend transformed fixtures for snapshot cloning, attached-set
filtering, theme-only graph commit, local character isolation, shared stale
failure, one post-commit notification, disposal, and absence of runtime fields.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/effective-configuration.test.mjs test/session-runtime.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run typecheck
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
git diff --check
```

**Done when:** A caller using only public `Session` can read the active
character's editable/effective configuration, perform local/shared/theme writes,
observe one fresh snapshot, and receive typed failures without accessing a
compatibility facade or unrelated profiles.

### Green PR 2 — Add the settings shell and current general settings

**Files:** `client/app/client-settings.ts`, `client/app/SettingsDialog.svelte`,
`client/app/App.svelte`, `client/workspace/TerminalPanel.svelte`,
`client/terminal/input-controller.ts`, `e2e/phase2-settings.spec.ts`,
`playwright.config.ts`, `playwright.production.config.ts`

**Intent:** Add one Settings button and native dialog. Load a draft from the
graph theme plus the existing settings blob; render only settings with current
Step 2-4 consumers; apply theme, terminal/control preferences, variables, and
workspace reset through their existing owners. Preserve deferred fields and keep
key mappings for Green PR 3's configuration editor.

**Tests:** Prove open/close/focus return, validation failure with draft retention,
save/reload, immediate theme/terminal/control behavior, variable non-persistence,
workspace reset, storage failure, mobile scrolling/touch, disposal, and absence
of `/js/app.js` in development and built web.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-settings.spec.ts --project=chromium --project=mobile-chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser:production -- e2e/phase2-settings.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** `P2-5-general-settings` meets its development, built, mobile,
keyboard/focus, validation, save, and reload conditions without schema expansion
or later-feature controls.

### Green PR 3 — Port key mappings, highlights, and functions

**Files:** `client/app/SettingsDialog.svelte`,
`client/app/DefinitionEditor.svelte`, `e2e/phase2-settings.spec.ts`

**Intent:** Prove the complete editor boundary with the three direct-form kinds.
Key mappings land first inside the slice because Step 4 provides an immediate
keyboard runtime assertion. Add source labels, local/shared save routing, stable
IDs, create/edit/enable/delete, native validation, stale shared-save handling,
and reload. Functions use their script field; highlights use their style fields.

**Tests:** For each kind, exercise local and shared provenance plus
create/edit/enable/delete/reload. Force one stale shared revision and one invalid
write with zero runtime change. Prove F-key execution, function call from an
existing definition, and highlight rendering update once after save.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin node --test test/effective-configuration.test.mjs test/session-definition-adapters.test.mjs
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-settings.spec.ts --project=chromium --project=mobile-chromium
```

**Done when:** The first three kinds satisfy their editor/provenance/publication
acceptance through the public capability and the same persisted definitions
immediately drive Step 4.

### Green PR 4 — Port aliases, triggers, and timers

**Files:** `client/app/SettingsDialog.svelte`,
`client/app/DefinitionEditor.svelte`,
`client/app/AutomationStepsEditor.svelte`, `e2e/phase2-settings.spec.ts`

**Intent:** Add the one justified shared form for `AutomationStep[]`, then port
alias, trigger, and timer fields around it. Reuse definition types and the
existing script/execution cores for diagnostics; do not import legacy managers
or `settings-automation.js` into `/phase2/`.

**Tests:** Create/edit/enable/delete local and shared examples for all three
kinds, including every automation-step discriminator accepted by the frozen
model. Prove alias send, trigger/gag, timer reconciliation, cross-kind function
references, shared CAS failure, reconnect snapshot replacement, mobile editing,
and runtime variables/timer handles absent from persisted JSON.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm test
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run typecheck
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run lint
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run format:check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-settings.spec.ts --project=chromium --project=mobile-chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser:production -- e2e/phase2-settings.spec.ts --project=chromium --project=mobile-chromium
git diff --check
```

**Done when:** All six kinds and the three Step 5 parity rows are locally green
through one settings surface without a legacy manager, configuration facade, or
second automation runtime.

### Completion gate — Record one Step 5 candidate

**Files:**
`multi-connection-ui-phase-2-step-1-parity-matrix.md`,
`multi-connection-ui-phase-2-implementation-plan.md`, this plan

**Intent:** After Green PR 4, run the complete prescribed battery on one clean
candidate. Record replacement evidence only for `P2-5-general-settings`,
`P2-5-definition-editors`, and `P2-5-precedence-publication`; mark Step 5 locally
`COMPLETE` only when every owned facet is green. Keep packaged Electron,
production cutover, later settings, legacy rollback, and `/` status unchanged.

**Verify:**

```sh
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm test
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run typecheck
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run lint
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run format:check
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run build
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- --project=chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser -- e2e/phase2-settings.spec.ts --project=mobile-chromium
env PATH=/Users/anderson/.nvm/versions/node/v22.15.0/bin:/usr/bin:/bin npm run test:browser:production
git diff --check
npx prettier --check docs/plans/phase-2/multi-connection-ui-phase-2-step-1-parity-matrix.md docs/plans/phase-2/multi-connection-ui-phase-2-implementation-plan.md docs/plans/phase-2/multi-connection-ui-phase-2-step-5-implementation-plan.md
```

**Done when:** One candidate has all local Step 5 evidence, the three owned rows
are green without overstating packaged Electron or Steps 6/10/11, and the public
configuration capability is frozen for Phase 3 reuse.

## Success criteria

- [ ] MH1-MH11 are satisfied by Green PRs 1-4 and the completion gate.
- [ ] General settings and all six definition kinds round-trip through their
      intended owners in development and built web.
- [ ] Provenance, precedence, stale rejection, character isolation, runtime-state
      isolation, mobile/accessibility, and disposal evidence are recorded.
- [ ] `/` and legacy keys remain available; `/phase2/` remains non-default; Step
      12 remains the sole release/cutover owner.

## Rollback

Before Step 12, rollback is route-level: keep `/` as default and stop serving or
linking `/phase2/`. Revert Green PRs in reverse order. Do not delete
`darkflow-session-core-v1`, `darkwind-client-settings`, definition legacy keys,
or compatibility facades. Graph writes remain schema version 1 and legacy keys
remain readable, so no data backfill or destructive rollback is required.

## Execution fit

- Scope: multi-run phase
- Lead: Terra at high reasoning — the code is bounded, but source ownership,
  public API shape, stale publication, and live UI/runtime integration require
  careful sequential judgment
- Workers: none
- Delegation shape: solo — Green PR 1 freezes the interface consumed by all later
  slices, and Green PRs 2-4 share the settings dialog and browser fixture
- Ownership: one lead owns the public contract, UI integration, evidence updates,
  rollback decisions, and final verification
- Replan trigger: a required general setting has no current owner, shared-set
  editing is ruled Phase 3-only, or the UI needs an internal session handle/
  whole application graph
- Confidence: medium — persistence and precedence are proven, but the exact
  general-settings parity boundary and shared-set editing policy are assumptions
  explicitly isolated above

Plan self-review: PASS (9/10)

notes:

- Every Step 5 must-have maps to a Green PR or completion gate, with rollback and
  runnable development/built/mobile checks.
- The plan deliberately preserves later-feature settings instead of scaffolding
  inactive controls; add them when their owning Step 6/10/11 surface lands.
