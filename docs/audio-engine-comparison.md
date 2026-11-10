# Android audio engine comparison

Status: **Media3 selected** (2026-11-10). Module, adapter and release build are
complete; the device matrix is pending.

## Why

`@rntp/player` 5.x is licensed for non-commercial use only and forbids
redistribution without written permission. Publishing Laila on the Play Store,
even for free, is redistribution. We compare three engines behind the same
`AudioEngine` port (`src/ports/audio.ts`) and keep the measured winner.

## Branches

| Branch | Engine | Android `package` (side-by-side install) | Licence |
|---|---|---|---|
| `main` | `@rntp/player` 5.13 (baseline, Media3 inside) | `app.laila.music` | Non-commercial; never distribute |
| `engine/media3` | Local Expo module `modules/laila-player` on AndroidX Media3 (exoplayer + session) | `app.laila.music.media3` | Apache-2.0 |
| `engine/expo-audio` | `expo-audio` (SDK 58) `AudioPlaylist` | `app.laila.music.expo` | MIT |

Rules:

- Only `src/adapters/native/audio.native.ts`, the engine dependency, the native
  module (media3 branch) and the `android.package` suffix differ between branches.
  Store, UI and web stay identical.
- Shared work (benchmark script, fixtures, this doc) lands on `main` first; the
  engine branches rebase onto it.
- Never build two engines into one APK: each ships its own `MediaSessionService`
  and Media3 version.
- After the decision: merge the winner, remove `@rntp/player`, delete the other
  branch.

## Time box

- `engine/expo-audio`: about 2 days, limited to the decisive questions below. Stop
  early if one fails.
- `engine/media3`: full implementation (most likely candidate).

Decisive questions for expo-audio (from the SDK 58 docs, 2026-11-08):

1. Can JS intercept next/previous from the lock screen, notification and Bluetooth,
   or does the native playlist always advance on its own?
2. Does `trackChanged` fire on natural end-of-track advance?
3. How are playlist errors reported? There is no documented error event or field.
4. Is the gap between tracks actually zero (measured)?
5. Do lock-screen covers behind a header-protected proxy load? `artworkUrl` takes a
   string only.

## Test setup

- Same device, same server, same build type (release, R8 on), same fixtures.
- Fixtures: one gapless album in FLAC and one in MP3 (LAME), 24/96 and 24/192 FLAC,
  AAC, Ogg/Opus; each with `format=raw` and with transcoding.
- Covers behind a reverse proxy that requires headers.
- No credentials in logs, screenshots or this file (`t`/`s`/`apiKey` redacted).

## Results

Fill one column per branch. Units in the first column.

| Criterion | rntp (`main`) | media3 | expo-audio |
|---|---|---|---|
| Release APK size, arm64 (MB) | | | |
| Cold start to first frame (ms) | | | |
| Time to first audio after tap (ms) | | | |
| RSS idle / playing (MB) | | | |
| CPU in background, screen off, 10 min (%) | | | |
| Gap between tracks, FLAC (ms) | | | |
| Gap between tracks, MP3 LAME (ms) | | | |
| Background playback > 10 min, screen off | | | |
| Lock screen / notification play-pause | | | |
| Next/prev follow Laila's queue (repeat-one, shuffle, upNext, radio) | | | |
| Bluetooth buttons; pause on disconnect | | | |
| Audio focus (call, other app) | | | |
| Seek / volume | | | |
| Error reported + retry re-resolves URL | | | |
| Network/server change mid-track | | | |
| Offline files | | | |
| Covers with headers on lock screen | | | |
| FLAC 16/44.1 · 24/96 · 24/192 | | | |
| MP3 · AAC · Ogg/Opus | | | |
| Swipe from recents stops service | | | |
| Cold start never auto-plays | | | |
| No auth params in `adb logcat` | | | |
| Native code to maintain (lines) | 0 | | 0 |

## Decision

**Media3** (2026-11-10). The local Apache-2.0 module removes the RNTP
non-commercial license blocker, keeps the `AudioEngine` port unchanged and
builds a smaller APK. Device validation is still pending; RNTP remains the
baseline until the matrix passes.
