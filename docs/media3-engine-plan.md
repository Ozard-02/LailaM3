# Media3 engine plan (`engine/media3`)

Status 2026-11-10: **module, adapter and release build complete; media
notification verified on device; device matrix pending.** Part of
`docs/audio-engine-comparison.md`. Goal: replace `@rntp/player` with a local
Expo module on AndroidX Media3 (Apache-2.0) behind the unchanged `AudioEngine`
port.

## Design

- `modules/laila-player/` (pattern: `modules/dlna/`), Android only, Media3 1.11.0
  `exoplayer` + `session`. No cast, no HLS. The service is declared in the
  module manifest; no config plugin.
- `LailaPlaybackService` (MediaSessionService): ExoPlayer with music audio
  attributes, audio focus, becoming-noisy pause, network wake lock. Swipe from
  recents → `pauseAllPlayersAndStopSelf()`.
- `QueueForwardingPlayer`: next/previous from notification, lock screen and
  headset go to JS (`onRemoteNext`/`onRemotePrevious`) when remote handling is on;
  otherwise the native queue.
- Media notification controller: no seek bar, no shuffle/repeat, matching the
  current RNTP commands. Build its result from
  `AcceptedResultBuilder(session, controller)` defaults, not from
  `super.onConnect`: the deprecated default is an empty "not implemented"
  marker that Media3 only upgrades to full commands through `onConnectAsync`.
  With empty commands the notification controller's timeline is empty and
  Media3 silently never posts the notification.
- Headers: `ResolvingDataSource` injects per-URI headers held in memory by
  `PlaybackBridge`. The same factory feeds `DataSourceBitmapLoader`, so covers
  load with headers. URI + MIME type also travel in `requestMetadata`, because
  MediaController may strip `localConfiguration`.
- Auto-advance parity: on `MEDIA_ITEM_TRANSITION_REASON_AUTO` the service
  pauses natively (`setPauseOnAutoAdvance`) and JS gets `onAutoAdvance{mediaId}`.
  The store then plays or reloads (`_handleAutoAdvance`).
- `LailaPlayerModule`: MediaController on the main looper. An immutable snapshot
  is updated on player events; `getSnapshot()` is sync and extrapolates position,
  so there is no native position ticker. Buffered position ticks at 1 s only while
  loading. Errors are reported as `errorCodeName: message` with `t/s/p/u/apiKey/token`
  redacted.

## Steps

1. [x] Scaffold module: config, gradle, manifest, Kotlin draft (service, bridge,
       module).
2. [x] `modules/laila-player/index.ts`: typed `requireOptionalNativeModule`
       wrapper (setup, setQueue, play, pause, seekTo, setVolume,
       setPauseOnAutoAdvance, setRemoteHandling, getSnapshot, destroy + events).
3. [x] Rewrite `src/adapters/native/audio.native.ts` on it. `load` = `setQueue([s], 0)`;
       state mapping in JS (buffering→loading, ready→playing/paused, ended, idle,
       error). Same `NativeAudioEngine` API; store and UI untouched.
4. [x] Unit tests with the native module mocked: mapping, remote handlers,
       auto-advance, error, destroy. 121 unit tests pass.
5. [x] Remove `@rntp/player`; `grep -r rntp` is clean in src and app.
6. [x] `expo prebuild --clean` + Android build (ANDROID_HOME=~/Android, JDK 17)
       in parallel with lint, typecheck, tests and web export; fix compile errors.
       Module Kotlin compiled; arm64 release APK 34 MB; service is
       `expo.modules.lailaplayer.LailaPlaybackService`; no RNTP service remains.
7. [ ] Device matrix and measurements from `docs/audio-engine-comparison.md`.
8. [ ] Docs: DESIGN §7.1, STRUCTURE (new module), PLAN dependency budget,
       testing, changelog.

## Open points to verify on device

- Whether the media notification controller filter is enough for the platform
  lock-screen session, or whether a seek bar still appears.
- Whether `onSetMediaItems` receives items with or without `localConfiguration`
  in-process (both paths are handled).
- Exported service: same as RNTP (any Media3 controller may connect). Consider
  rejecting untrusted controllers later; this may break KDE Connect-style
  remotes.
