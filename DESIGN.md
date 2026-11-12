# DESIGN — Laila

Status: **architecture and design note** (2026-11-06). It documents the
architecture, audio, storage, Segue and UI decisions behind Laila. See
`ROADMAP.md` for what is implemented and verified.

## 1. Shape

```text
Android / Web (Firefox, Chromium)
   │
   ├── Expo / React Native / React Native Web
   │
   ├── Subsonic API ──────► Navidrome   (/rest/*, audio streams, covers)
   │
   └── Segue (optional) ──► hub         (/connect/v1/*, WebSocket)
```

One app, one design system, one application model. Audio always comes from the
media server; the hub only relays control. No backend of our own.

## 2. Three-layer architecture (DECISA)

```text
app/            Expo Router routes
src/
├── core/       pure TypeScript: subsonic, segue, queue, offline, models, utils
├── ports/      interfaces: AudioEngine, KVStore, SecretStore, OfflineFiles,
│               OfflineStore, PaletteExtractor, Hotkeys
├── adapters/   native/, web/ and storage/ implementations
├── services/   wiring: query client, storage, audio, network
├── stores/     Zustand stores
├── hooks/      React hooks
├── theme/      tokens, palette, typography, motion
├── ui/         primitives and design-system components
├── components/ feature components
└── utils/      formatting and haptics
```

Rules:

- `core/` must not import React, React Native, Zustand, audio libraries, browser
  APIs or platform modules. Enforce with ESLint or dependency-cruiser.
- `ports/` defines contracts only; no platform code.
- `adapters/native/` and `adapters/web/` implement ports via `.native.ts` /
  `.web.ts` files.
- One package; no monorepo/workspaces preventively.
- Queue is a pure reducer; Zustand uses it, the reducer never imports Zustand.
- The application queue model is authoritative; the native player may keep a
  technical queue but must stay synchronised with the model.

### Ports

| Port | Android | Web |
|---|---|---|
| AudioEngine | local Media3 module (`modules/laila-player`) | HTMLAudioElement |
| KVStore | JSON files (`laila-state`) | localStorage |
| SecretStore | SecureStore | memory/session |
| OfflineFiles | FileSystem | not in v1 |
| OfflineStore | FileSystem/JSON | not in v1 |
| PaletteExtractor | native/canvas | canvas if CORS allows |
| Hotkeys | native controls | keyboard events |

## 3. Stack (DECISA unless noted)

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript strict | Shared logic, safety at boundaries |
| Framework | Expo + React Native + React Native Web | Android-first, real web |
| Routing | Expo Router | File routing, real URLs, deep links, nested layouts |
| Styling | StyleSheet + proprietary tokens | No NativeWind/CSS framework |
| Motion | Reanimated + Gesture Handler | 1:1 gestures, springs, kinetic feel |
| Server data | React Query | Cache, invalidation, refetch, loading states |
| App state | Zustand (player, UI, local shared) | Small, no provider pyramid |
| Validation | Valibot | Small, typed schemas at response boundaries |
| HTTP | native fetch | No heavy Subsonic SDK |
| Lists | FlashList on native; windowed FlatList on web | Virtualisation, 60 fps |
| Images | expo-image | Caching, placeholder, auth-friendly |
| Storage | JSON files (Android), localStorage (web), SecureStore (secrets) | Small app state, credentials isolated, no large SecureStore values |
| Audio Android | Local Expo Media3 module (`modules/laila-player`) | Background, MediaSession, New Architecture; Apache-2.0; device matrix pending |
| Audio web | HTMLAudioElement | Simpler, CORS-friendly, Media Session |
| Tests | Vitest, Playwright | Core and web; Android passes are manual |
| i18n | English UI in v1; i18next deferred | No runtime i18n dependency yet |

No Tauri, no React Native Windows/macOS, no native Linux packaging in v1.
No Flutter, no Capacitor, no Next.js. No Rust in v1; native code is limited to
the local Expo modules.

## 4. Design system

### 4.1 Principles

- One visual identity; adaptive layouts driven by window size, not device type.
- Apple Music feel, Cassette organisation; not a copy of Cassette.
- Motion is part of the product, not decoration.
- Accessibility, focus, contrast, reduced motion are requirements.

### 4.2 Tokens

- Color: base palette + artwork-derived palette
  `{background, wash, elevated, accent, on, onVariant, divider}`.
  Neutral fallback when extraction fails (CORS, decode error).
- Typography: system font; weight-based hierarchy; negative tracking on display
  titles; no `bold` everywhere.
- Spacing: 4-based scale.
- Radius: artwork 8, card 16, sheet 20, pill 50%.
- Elevation: layered surfaces, hairline borders, subtle shadows; not fully flat.
- Motion: defined durations/curves/springs; reduce-motion variant.
- Blur: avoid heavy real-time blur. Use a 32px cover upscaled + `blurRadius` +
  tint, with solid fallback.

### 4.3 Adaptive navigation

| Window width | Navigation |
|---|---|
| < 600 | Bottom tabs |
| 600–899 | Navigation rail |
| >= 900 | Sidebar |

- Phone: bottom tabs; full-screen player.
- Tablet: navigation rail; two-pane detail when space allows.
- Desktop web: sidebar; persistent player; keyboard-first.
- Foldable: window-size adaptive; no hinge-posture detection in v1.
- Z Flip outer display: compact layout at small width, full layout unfolded.

### 4.4 Motion and gestures

- 1:1 finger tracking: element follows the finger without perceptible lag.
- Scaled transforms: press ~0.96–0.98; drag lift ~1.02–1.05.
- Kinetic scroll with tuned deceleration; no jank on mid-range Android.
- Queue drag-and-drop: Gesture Handler + Reanimated; long-press lift, haptic ticks,
  spring settle. Keyboard alternative: Alt+↑ / Alt+↓.
- Respect `prefers-reduced-motion` / system reduce motion.

### 4.5 Keyboard (web/desktop)

- Space: play/pause.
- Arrows: navigation or control by context.
- Enter: open/confirm.
- Esc: close/back.
- `/`: search.
- Alt+↑/↓: reorder queue.
- Document conflicts with browser/input fields; no focus trap.

## 5. State and data

- React Query owns server data (library, album, playlist, search, now playing).
- Zustand owns player, queue view state, UI state and local shared state.
- `core/queue` is a pure reducer:
  `queue`, `index`, `upNext`, `originalQueue`, `repeat`, `shuffle`.
- Persist the queue, index, repeat, shuffle, originalQueue and volume. Playback
  position is not persisted across a process restart; restore the queue paused
  and load the first track explicitly on play.
- Shuffle/unshuffle restores original order and re-finds current track.
- `upNext` is drained before `queue[index+1]`.
- Optional `savePlayQueue` for continuity; never source of truth.

## 6. Authentication and storage

### 6.1 Auth

- Preferred: OpenSubsonic API key (revocable); detect `apiKeyAuthentication`.
- Fallback: token + salt (md5). One stable salt per session, also for image cache.
- Custom HTTP headers for reverse proxies.
- Never store password. Logout clears credentials, queue, caches.
- Multiple saved instances of the same library (home Wi-Fi, cellular, public URL).
  Each instance may carry a `network` binding (`SSID` or `__cellular__`).
- A network monitor switches instances automatically on Wi-Fi/cellular change and
  falls back to the last unbound instance when leaving a bound network.
- The download index is keyed by **song id**, not server URL, so the downloaded
  flag and files stay valid when the active address changes. Queued downloads are
  started with the current address; in-flight ones keep theirs.

### 6.2 Storage

| Data | Android | Web |
|---|---|---|
| Preferences, small KV | JSON file (`laila-state`) | localStorage |
| Secrets (server auth, Segue device id) | SecureStore | localStorage (remember-me opt-in) |
| Queue, index, position | JSON file (`laila-state`) | localStorage |
| Offline index | JSON file + FileSystem | not in v1 |
| Offline audio | FileSystem (`laila-downloads`) | not in v1 |
| Covers | FileSystem (`laila-covers`) + image cache | HTTP/image cache |

- `KVStore` is async even if a backend is sync, for a uniform contract.
- SecureStore is for credentials only: its value size is unsuitable for a growing
  offline index. App state uses atomic JSON files, with backup-on-write.
- Legacy SecureStore state migrates to the file store on first read.
- Web secrets are not equivalent to SecureStore; say so in the UI.
- Schema versioning; clear-data path.

## 7. Audio

### 7.1 Android

- Local Expo module `modules/laila-player` on AndroidX Media3 1.11.0
  (`media3-exoplayer` + `media3-session`, Apache-2.0), New Architecture.
- `LailaPlaybackService` owns the ExoPlayer and MediaSession; the JS adapter
  (`src/adapters/native/audio.native.ts`) talks to it through a MediaController.
- Development Build required; Expo Go is not the reference.
- Background playback, lock-screen/media controls, seek, next/previous,
  gapless test, resume after background.
- Device matrix pending: notification, lock screen, Bluetooth, audio focus,
  gapless and codec validation on real hardware.

### 7.2 Web / Linux

- One HTMLAudioElement; no Web Audio as main engine.
- Media Session API for metadata/actions.
- Verify MPRIS via `playerctl` on real Firefox versions; do not promise identical
  behavior everywhere.
- Test minimize/close, hardware keys, multiple audio tabs.

### 7.3 FLAC, streaming, quality

- Test FLAC 16/44.1, 24/96, 24/192; MP3; Ogg/Opus; AAC best effort.
- Use `format=raw` for original streaming; verify with `ffprobe`, Range/seek.
- Network quality: Wi-Fi original; mobile optional transcode with `maxBitRate`.
- Player badge shows source codec/bitrate/bit depth/sample rate. Never claim
  bit-perfect output; OS may resample.
- Gapless: test Android native; web HTMLAudioElement not guaranteed. Two-element
  preload/switch is a possible strategy; document the actual gap.

### 7.4 Errors

- Retry re-resolves stream URL; tokens/salts may have changed.
- Show codec/transcode fallback when a format fails.
- Never log auth parameters.

## 8. Offline (Android v1)

- Separate `OfflineStore` (metadata/index/state) from `OfflineFiles` (audio).
- First approach: JSON index + FileSystem; SQLite only if needed later.
- Download via `download` endpoint (original file), not `stream`.
- Before download: estimated size, free space, cancel, optional lower quality.
- After: size, integrity (hash when available), readability, index update.
- Parallel downloads, pause/resume/cancel, speed, shared-song semantics, cover
  cache, index sync.
- Offline mode shows/plays only downloaded content.
- Ports designed so web can be added later.

## 9. Segue

- Pure TypeScript in `core/segue`; no React/RN/Zustand/audio imports.
- v1: discovery, device identification, hello, state reporting, device list,
  last playback, move here, play on, transfer via `setQueue`.
- Discovery: probe `B/connect/v1/info`, manual URL, cache per sign-in.
- Target ~1 s with a working hub; do not promise it without hub.
- Web limits: LAN access, mixed content, HTTPS→HTTP, browser permissions. Prefer
  HTTPS/WSS hub or same-origin reverse proxy.
- `getNowPlaying` polling fallback must work from day one.
- Multi-room/stereo pairing **FUORI SCOPE v1**.
- Use upstream; track releases; fork only if a needed feature is missing/broken.

## 10. Network, CORS, security

- Rule: no requests to hosts other than those explicitly configured by the user
  (Navidrome, Segue hub, declared endpoints).
- No CDNs, remote fonts, analytics, trackers, third-party images, telemetry.
- CORS: do not assume Navidrome allows it. Preferred solution: reverse proxy on
  the same origin. No proprietary backend to bypass CORS.
- Without CORS: palette extraction falls back to neutral; ReplayGain via Web Audio
  unavailable; volume via HTMLAudioElement only.
- CSP: static CSP cannot enumerate arbitrary user hosts. Design explicitly how
  `connect-src`/`media-src`/`img-src` work with configured hosts and reverse proxy;
  do not just add wildcards.
- Playwright network guard: fail on unauthorized hosts; cover fetch/img/audio/ws;
  assert no secrets in logs.
- Redact `t`, `s`, `apiKey`, `p` in URLs, query strings and error messages.
- HTTPS only in production; `http://localhost` for dev.
- No `dangerouslySetInnerHTML`; treat metadata as untrusted.

## 11. Lists, images, i18n

- FlashList on native; the web Library uses a windowed `FlatList`
  (`AlbumShelf.web.tsx`). TanStack Virtual is not currently installed.
- `expo-image` with lazy loading, placeholder, server-side size; stable salt.
- English-only UI in v1; keep copy out of components where a future i18n pass
  needs to extract it. No remote fonts; system font.

## 12. Testing

Commands, current counts, codec/browser matrices and device status live in
[`docs/testing.md`](docs/testing.md). Architecture-level rules:

- Vitest tests the pure core: Subsonic parsing, queue transitions, Segue mapping,
  offline index and palette math.
- Playwright tests web flows against the mock server: login, browse, playback,
  queue edits, reload/resume, logout and the network guard.
- Android passes are manual on the phone/tablet.
- Every queue bug gets a unit test that fails before the fix.

## 13. Performance and background

- Current direction (2026-11-06): incremental, measured refactors; no new features
  and no big-bang rewrite. A full rewrite is reference only; cherry-pick a
  candidate only when profiling shows it is needed.
- Background playback keeps audio engine + minimal state; pause animations, blur,
  palette extraction, image decoding, prefetch, polling cadence.
- Web: `visibilitychange` pauses rAF/animation loops and heavy work.
- Android: foreground service for playback; release when stopped.
- Bounded LRU caches for images/palettes/library; release bitmaps on eviction.
- Measure peak RSS and frame times on mid-range Android; set budgets.
- Profile 500+ track sessions for leaks.

## 14. Deployment

- Web: static bundle, servable from a subpath; router base and asset base must
  match. A build for another host is a separate configuration, not a runtime
  guess.
- Default: same origin as Navidrome via reverse proxy; no CORS.
- Separate origin supported as fallback with documented CORS.
- No runtime env vars; server URL entered by user.
- Android: APK/AAB via EAS.
- Desktop native packaging: **FUORI SCOPE v1**; revisit Tauri later only if needed.

## 15. Extensions (out of scope v1)

Laila v1 ships no plugin runtime, marketplace or remote code loading. Any future
integration must stay bundled and reviewed; the core does not expose public
extension points yet.
