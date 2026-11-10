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
npm run test:e2e:all  # full desktop × mobile matrix
npm run build:web     # production web export
```

## Current baseline — 2026-11-10

- **121 unit tests** in 21 files.
- **63 default E2E checks**: 49 Chromium desktop, 13 mobile checks and one
  Firefox seek check.
- `FULL_E2E=1` was not re-measured after the queue-trash pass.
- Typecheck and lint are clean; the web export builds.
- Android release builds; the Media3 device matrix is pending.

## Unit coverage

Vitest covers the pure core: queue transitions and stress, Subsonic schemas,
retry/backoff and redaction, offline index/integrity/recovery, server switching,
Segue state/handoff, DLNA parsing, storage recovery/migration, query-key scoping,
download-progress throttling and queue-trash snapshot/remove/restore.

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
