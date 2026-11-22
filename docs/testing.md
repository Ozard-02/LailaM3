# Testing

Single source for test commands, counts, matrices and device status. Current
product status and priorities live in `ROADMAP.md`; the library profiler lives in
`docs/performance.md`.

## Commands

```sh
npm run typecheck
npm run lint
npm test              # Vitest unit tests
npm run test:e2e      # Playwright default matrix
npm run test:e2e:smoke # 11-check desktop @smoke tier
npm run test:e2e:all  # full desktop × mobile matrix
npm run build:web     # production web export
npm run profile:core  # large-input core benchmark (not part of `npm test`)
```

## Current baseline — 2026-11-22

- **235 unit tests** in 33 files.
- **91 default E2E checks**: 78 Chromium desktop, 12 mobile checks and one
  Firefox seek check.
- **11 desktop `@smoke` checks** via `npm run test:e2e:smoke`.
- `FULL_E2E=1` was not re-measured after the latest queue/player pass.
- Typecheck and lint are clean; the web export builds.
- The Media3 Kotlin module compiles. Hardware validation of the new native
  queue sync, repeat mode, auto-advance transition and notification controls is
  still pending.
- The 2026-11-22 build adds performance mode, collapsible settings, artist
  shuffle, virtualised Favourites, queue pre-mount/alignment, live queue row
  actions and the motion/keyboard polish pass. Desktop, mobile and Firefox E2E
  pass.

## Unit coverage

Vitest covers the pure core: queue transitions and stress, Subsonic schemas,
retry/backoff and redaction, offline index/integrity/recovery/batch removal,
precomputed search index, coalesced persist storage, server switching, Segue
state/handoff, DLNA parsing, storage recovery/migration, query-key scoping,
download-progress throttling, queue-trash snapshot/remove/restore, the
player-store trash path, duration fallback, device-tier resolution, artwork
request sizing, offline download races, native Media3 queue sync, auto-advance
decisions, and the large-input `profile:core` harness targets.

## E2E coverage

Playwright runs against the bundled mock server; it never holds real credentials.

- Chromium desktop runs all functional tests.
- The mobile viewport runs `@mobile` / `@both` checks.
- Firefox runs the native-range progress/seek check; Firefox is the primary web
  target.
- A network guard fails unauthorized hosts across fetch, images, audio and
  WebSocket connections.
- The service-worker test asserts `/rest`, `/connect`, `/stream` and `/download`
  never enter a cache.
- Keyboard, focus, player-dialog and skip-link checks are part of the desktop
  suite.
- Media Session metadata and `playing` state are asserted after playback starts.
- `queue-align.spec.ts` plays the last album track and asserts that opening and
  reopening the queue puts it at the top without a late scroll, that the row is
  already aligned while the sheet is still rising, that a deep track in a long
  queue is aligned before opening, that scrolling does not snap back, and that
  the closed sheet is inert, on desktop and mobile.
- `motion.spec.ts` covers top-surface Escape, lyrics focus, clear-queue parking,
  slow-swipe handling, cover-swipe clipping and bounds, queue quick-drop and
  hold, live reduced motion and the animated control.
- `performance.spec.ts` enables performance mode and verifies persistence, that
  the blurred backdrop is absent, and that the open cover requests 1x instead of
  2x; a normal-mode control proves the full-size path still runs.
- `library-wishes.spec.ts` covers album trash/restore and artist shuffle, and
  owns the album/library-row trash checks moved out of `app.spec.ts`.

## Codec matrix

| Format | Android | Firefox Linux | Chromium Linux |
|---|---|---|---|
| FLAC 16/44.1 | Verified | Pending | Pending |
| FLAC 24/96 | Verified | Pending | Pending |
| FLAC 24/192 | Verified | Pending | Pending |
| MP3 | Verified | Pending | Pending |
| AAC | Verified | Best effort | Pending |
| Ogg/Opus | Verified | Pending | Pending |

Android codec results were confirmed on the previous RNTP engine. Re-run them on
the Media3 module before treating them as current. Web codecs are still a manual
matrix; do not claim full web codec support until it is run.

## Browser matrix

| Feature | Firefox Linux | Chromium Linux |
|---|---|---|
| HTMLAudioElement | Decided | Decided |
| Media Session | Pending | Pending |
| MPRIS / `playerctl` | Pending | Pending |
| CORS direct | Pending | Pending |
| Segue WebSocket | Pending | Pending |
| LAN discovery | Limited | Limited |

## Build and device matrix

- Android ABI: `arm64-v8a` for local development and sideload; release as an AAB
  with Play splits. Drop `armeabi-v7a` and `x86`; keep `x86_64` only for emulator
  builds when needed.
- Android minSdk: keep the Expo/RN default unless a concrete need appears.
- Per-ABI splits live in `plugins/withAndroidAbiSplits.js`; do not ship a
  universal multi-ABI APK by default.
- Web: Firefox Linux primary, Chromium secondary.
- Foldables: adaptive by window size; no hinge/posture detection in v1.
- Platforms: Android + web/Linux Firefox only.

## Device passes

Confirmed on the device with the previous RNTP engine:

- lock-screen transport and Android notification controls;
- task-removal stop;
- offline restart;
- Wi-Fi ↔ cellular server switching;
- Android codec matrix.

Still pending for the Media3 engine:

- notification, lock screen and Bluetooth controls;
- audio focus and becoming-noisy;
- gapless playback;
- Android codec matrix re-run;
- task-removal stop and offline restart.

Still pending overall:

- real DLNA speaker/TV;
- multi-GB download index;
- full screen-reader and contrast pass;
- real-Navidrome web codec/browser matrix.

## Rules

- Run typecheck, lint, unit tests and the default E2E suite before a commit.
- Every bug fix gets a test that reproduces it first.
- Keep `src/core` pure; test pure logic in `tests/core` and web flows in
  `tests/e2e`.
