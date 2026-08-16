# Phase 2 Step 10 Completion

## Status

**COMPLETE** on 2026-08-16 in commit `5856d44`, based on committed Step 9
revision `dd67231`.

Implementation and the Step 10-specific non-live gates pass. Development and
built Chromium/mobile pass 6/6 each; full Node passes 651/651; and the
source-free packaged Electron app executes the real Svelte trusted-unlock path,
a supported `alert/ping`, and a local MP3 request with HTTP 200. The
authenticated live gate passed against `darkwind.ai:4242` over WSS: the connected
DOM exposed `🔊 Ready` and `Toggle audio`, the user confirmed audible login
theme, an exact channel `@Malraux` mention produced a bell notification, and
selecting its row navigated to and highlighted the rendered line. A direct
`tell` correctly did not notify because this feature correlates exact mentions
from `Comm.Channel`/`Comm.Channel.Text`. No live mute, volume, or category action
is claimed. All four `P2-10-*` rows are `REPLACED`.

Nine cataloged fishing assets remain absent. The user explicitly accepted this
inherited gap and asked that Step 10 not address it, so it is recorded but does
not block completion.

## Replacement evidence

| Parity row                     | Current result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P2-10-mentions-notifications` | Validated bounded Comm state, rendered-line correlation, duplicate suppression, exact roster request, mention picker, terminal navigation, expiration, clear, focus, disposal, and remount pass focused Node plus development and built Chromium/mobile evidence. Live exact-channel `@Malraux` produced a bell notification whose row navigated to and highlighted the rendered line; direct `tell` correctly did not notify.                                                                                    |
| `P2-10-sound-engine`           | The retained application sound singleton and public `Session.audio` capability pass focused validation, settings, queue/loop, visibility, login-grace, reconnect, disposal, and session-isolation evidence. Development and built Chromium/mobile prove support, trusted unlock timing, persisted controls, server activity, disposal, and remount. Packaged Electron proves the real Svelte unlock and a local supported MP3 request; live exposed `🔊 Ready`/`Toggle audio` and the login theme produced sound. |
| `P2-10-sound-panel`            | `AudioControls.svelte` exposes mute, volume, all eleven retained categories, support visibility, keyboard/focus behavior, and mobile layout using only `Session.audio`. Development and built Chromium/mobile plus targeted packaged Electron control/unlock/audio pass. The live DOM exposed `🔊 Ready` and `Toggle audio`; no live mute, volume, or category action is claimed.                                                                                                                                 |
| `P2-10-login-media`            | Validated game/ambience frames, login-theme lifecycle, local-only automation sounds, and every retained fishing sound transition pass focused evidence. Development and built Chromium/mobile cover fishing cast through disconnect/disposal with no late result or audio; live login-theme sound passed. The nine absent fishing MP3s and observed 404s are an explicitly accepted inherited asset gap.                                                                                                          |

## Ownership

`client/runtime/notifications.ts` owns bounded validated notification and roster
state behind `Session.notifications`. The terminal output/input owners keep DOM
line identity and mention interaction local; `NotificationsMenu.svelte` owns
only presentation and delegates navigation through `WorkspaceHost`.

`public/js/sound-manager.js` remains the one application-lifetime Howler owner.
`client/runtime/audio.ts` owns validated session activity, settings actions,
login/reconnect state, and named local playback behind `Session.audio`.
`AudioControls.svelte`, terminal automation, and `FishingPanel.svelte` consume
only that public capability. Svelte receives no GMCP bus, transport, raw socket,
event bus, scope, storage facade, Howler handle, or compatibility facade.

The legacy `/` route, notification/mention managers, sound panel/login manager,
sound catalog/settings key, local Howler and sound assets, automation/fishing
owners, and related styles remain rollback sources.

## Verification

| Command or boundary                                     | Result                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retained Step 10 baseline                               | `PASS` — 74/74 before implementation; the PR 1 retained/contract baseline later passed 76/76.                                                                                                                                                                                                                                                  |
| Focused notification/audio/terminal suites              | `PASS` — contracts, limits, correlation, settings, lifecycle, navigation, and disposal.                                                                                                                                                                                                                                                        |
| Focused automation/fishing/session regression           | `PASS` — 47/47, including disposal before a deferred wait resumes.                                                                                                                                                                                                                                                                             |
| Full Node suite                                         | `PASS` — 651/651 in 539819.445 ms with loopback available.                                                                                                                                                                                                                                                                                     |
| `npm run check`, `npm run lint`, `npm run format:check` | `PASS`.                                                                                                                                                                                                                                                                                                                                        |
| `npm run build` and postbuild verification              | `PASS` — 377 modules; bundle and client artifact verification passed.                                                                                                                                                                                                                                                                          |
| Development Chromium/mobile Step 10 fixture             | `PASS` — 6/6.                                                                                                                                                                                                                                                                                                                                  |
| Built Chromium/mobile Step 10 fixture                   | `PASS` — 6/6.                                                                                                                                                                                                                                                                                                                                  |
| Full development browser regression suite               | `PASS` — 186 passed, 6 skipped, 0 failed in 6.7 minutes.                                                                                                                                                                                                                                                                                       |
| `npm run desktop:pack`                                  | `PASS` — source-free ASAR validated with 319 client files.                                                                                                                                                                                                                                                                                     |
| Targeted packaged Electron audio                        | `PASS` — real Svelte trusted unlock, supported `alert/ping`, and local MP3 HTTP 200.                                                                                                                                                                                                                                                           |
| Authenticated live connection                           | `PASS` — against `darkwind.ai:4242` over WSS: connected DOM exposed `🔊 Ready` and `Toggle audio`; user confirmed audible login theme; exact channel `@Malraux` produced a bell notification; selecting its row navigated to and highlighted the rendered line. A direct `tell` correctly did not notify. No live control mutation is claimed. |
| `npm run typecheck` baseline comparison                 | Repository baseline only: exactly 14 TS5097 diagnostics in the same 10 existing files; Step 10 adds no diagnostic category or count.                                                                                                                                                                                                           |
| `git diff --check`                                      | `PASS`.                                                                                                                                                                                                                                                                                                                                        |

## Accepted inherited fishing asset gap

The retained catalog maps `cast`, `splash`, `hook`, `reel`, `tension`, `catch`,
`pristine`, `snap`, and `slack` to `/assets/sounds/fishing-*.mp3`, but none of
those nine files exists. The full browser run exercised the new fishing actions
and observed HTTP 404 for their asset requests. Direction, lifecycle, and
cleanup evidence pass, but audible fishing playback is unavailable. The user
explicitly accepted this inherited gap and asked that Step 10 not add or replace
the assets.

## Live gate

The authenticated WSS session exposed `🔊 Ready` and `Toggle audio` in the
connected DOM, and the user confirmed the real login theme produced sound. An
exact `@Malraux` mention on a channel produced one bell notification; activating
the row navigated to and highlighted its rendered terminal line. A direct
`tell` correctly produced no notification because it was not an exact
`Comm.Channel`/`Comm.Channel.Text` mention. No mute, volume, or category action,
administrative command, or shared game-state mutation is claimed.

## Rollback and deferred proof

Legacy `/` and every retained notification, mention, login, sound, automation,
fishing, style, storage-key, Howler, and audio-asset owner remain intact. Revert
commit `5856d44` and use legacy `/` if a regression is found.

Step 13 still owns default-root cutover, hosted/release certification, complete
Electron certification, and legacy deletion. Step 10 owns only its targeted
packaged Svelte/local-audio execution proof.
