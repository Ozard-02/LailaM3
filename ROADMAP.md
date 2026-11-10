# Laila roadmap

> Living document. This file tracks what has actually been built, how, and what
> is still risky. Update it with every meaningful commit.

**Last updated:** 2026-11-09
**Current state:** runnable Android + web client with the real Subsonic client,
design system, adaptive shell, library, lyrics, player, queue, offline downloads,
server switching, Segue presence/transfer and Android DLNA speaker output. The
release APK runs on the phone and tablet; the user has confirmed lock-screen
transport, task-removal stop, offline restart, Wi-Fi/cellular switching and the
codec matrix. Queue rows now swipe left to a per-server, shuffle/radio-excluded
Trash playlist and right to play next, with Undo. Recently played now updates at
the end of a track: the Subsonic scrobble sends `time` in milliseconds, a
successful scrobble invalidates the album queries, and Home refetches `recent` on
mount. A server/network switch now rebuilds the native queue's absolute stream
URLs, preserving index, position and play state. The remaining product risks are
large-library performance, real DLNA devices, gapless playback and the multi-GB
download index. Real Segue phone↔tablet transfer is confirmed.

> **Current priority (2026-11-06):** no new features. Refactor and organise the
> existing code and reduce CPU, memory, bundle and network cost with measured,
> behaviour-preserving changes. This is not a full performance rewrite; keep the
> work incremental and cherry-pick only measured bottlenecks.

---

## Status at a glance

| Area | Status | Notes |
|---|---|---|
| Docs / decisions | Done | README, DESIGN, STRUCTURE, testing/changelog and this roadmap aligned |
| Refactor / efficiency | In progress | No new features; first low-risk pass landed; not a wholesale rewrite |
| Expo + TS strict scaffold | Done | Expo 58, RN 0.88, Expo Router |
| Design tokens + primitives | Done | StyleSheet + tokens, light/dark, artwork palette |
| Adaptive navigation | Done | bottom tabs / rail / sidebar by window width |
| Login | Done | API key + token+salt, remember server |
| Subsonic client | Done | ping, albums, artists, playlists, genres, search, stream, covers |
| Library / search | Done | home, albums, artists, playlists, genres; song results in Library search; pinned section |
| Lyrics | Done (server-dependent) | OpenSubsonic structured lyrics + LRC fallback |
| Shuffle all + exclusions | Done | `#<user>-exclusive` playlists filtered, radio top-up |
| Swipe actions | Done | configurable play-next/queue/download, 1:1 pan |
| Queue trash | Done | per-server playlist, left swipe Trash + right swipe play next, Undo, Delete shortcut, shuffle/radio exclusion; device test pending |
| Player | Done (web) | HTMLAudioElement, media session, now playing |
| Queue | Done (web) | pure reducer, up-next, shuffle, repeat, reorder |
| Drag-and-drop queue | Prototype | DraggableFlatList + Alt+↑/↓ fallback |
| Artwork palette | Done (web) | canvas extraction; neutral fallback |
| Mock server | Done | dev/E2E only, generated covers + WAV |
| Unit tests | Done | 116 passing; coverage details in `docs/testing.md` |
| Web build | Done | `expo export -p web`, SPA output |
| Android audio | Implemented; device matrix pending | Local Media3 module built and wired; FLAC/background were validated on the RNTP baseline, Media3 still needs the device pass |
| Background playback | Verified | notification play/next/previous and locked-screen transport confirmed; removing the task stops playback |
| Offline downloads | Verified | downloads + real offline mode; speed/progress, shared-song collections, loose-track list; user-confirmed offline restart. Multi-GB index pass pending |
| Segue | Verified (real hub) | client, store, devices screen, phone↔tablet transfer, polling fallback |
| E2E Playwright | Done | 63 default; matrix details in `docs/testing.md` |
| Lint | Done | ESLint + expo config; zero errors/warnings |
| PWA shell | Done | manifest + app-shell-only service worker, verified in E2E |
| Background resource policy | Partial | foreground tracking, skeleton pause, no UI polling with hub |
| Offline index/store | Done | Android code path; web stub |
| Server auto-switch | Verified | Wi-Fi SSID / cellular binding + fallback; user-confirmed network switch; native queue rebuilds stale stream URLs on a server/credential change |
| Recently played / scrobbles | Fixed | Subsonic `time` in milliseconds; a successful scrobble invalidates album queries; Home refetches `recent` on mount; updates at track end |
| Keyboard-first web | Done | `/`, global Space, arrows/Shift, `n`/`p`, `s`/`r`, `f` player, `q`, `g` chords, `?` help, Escape; skip link, player focus trap; E2E covered |
| Library scale | Measured (mock) | 5k albums: 542 ms first grid, 44 requests, 368 DOM cards, 78 MB heap; real Navidrome treated as working |
| Release packaging | Done | per-ABI APKs via config plugin; arm64-v8a 38 MB vs 105 MB universal |
| DLNA/UPnP speakers | Implemented (Android) | local Expo module, SSDP discovery, AVTransport cast; web no-op; real speaker test pending |
| Android prebuild | Done | `expo prebuild --platform android --no-install` succeeds |

---

## Phase 0 — technical spike

**Goal:** prove the risky choices on real devices/server before freezing the stack.

| Item | Status | Evidence / next |
|---|---|---|
| Expo 58 + RN 0.88 + New Architecture | Verified | web bundle and Android release build |
| Media3 engine | Built; device matrix pending | `modules/laila-player` + `src/adapters/native/audio.native.ts`; replaces RNTP |
| Background + lock screen | Verified | user-confirmed locked-screen transport and task-removal stop |
| FLAC 16/44.1–24/192 | Verified | user-confirmed codec matrix on the device |
| MP3 / AAC / Ogg/Opus | Verified | user-confirmed codec matrix on the device |
| Gapless | Not tested | document real gaps |
| HTMLAudioElement + Range | Verified (mock) | WAV + Range in mock server; real Navidrome pending |
| `stream?format=raw` | Not tested | need real Navidrome + `ffprobe` |
| CORS / reverse proxy | Not tested | real Navidrome pending |
| JSON files / SecureStore / FileSystem | Verified | app state uses atomic JSON files under `laila-state`; SecureStore holds credentials only; offline audio lives under `laila-downloads` |
| localStorage | Verified | web app state persists in localStorage |
| FlashList | Used on native | web Library uses a windowed FlatList; 5k web profile measured, native performance not measured |
| Reanimated drag | Prototype | DraggableFlatList; need real device feel test |
| Segue discovery/hello | Verified (real hub) | real upstream hub with two Android devices; mock hub remains in `scripts/mock-server.mjs` |

**Gate:** do not claim "Android supported" until the device tests above pass.

---

## Phase 1 — design system and shell

Implemented:

- `src/theme/tokens.ts` — colors, spacing, radius, typography, motion.
- `src/theme/ThemeProvider.tsx` — light/dark, artwork palette, reduce-motion.
- `src/theme/palette.ts` — palette math and web canvas extraction.
- `src/theme/extract.native.ts` — `react-native-image-colors` extractor.
- `src/theme/extract.web.ts` — canvas extractor.
- `src/ui/*` — Text, Surface, Button, IconButton, Input, Card, Pill, Artwork,
  ProgressBar, Skeleton, EmptyState, PressableScale.
- Adaptive shell: `app/(main)/_layout.tsx` + `src/components/Navigation.tsx`.
  - phone: floating bottom tabs;
  - tablet: rail;
  - desktop: sidebar;
  - persistent player bar.
- Motion: press scale + spring via Reanimated; kinetic native scroll; haptics on
  supported platforms; reduce-motion disables transforms.
- `reduceBlur` disables the player's blurred cover layer and the tab BlurView.
- Runtime web focus ring from the theme accent (works in the single-file export);
  route changes focus `#main-content` and announce the screen, without stealing
  focus from a text field or an open modal.

Still to do:

- None blocking. `reduceBlur` now disables the player backdrop blur and the
  translucent tab blur; web focus rings use the theme accent, route changes move
  focus to the main landmark, and the main screens have retryable error states.
  Library cards are sized from the measured body width, so they no longer
  overlap next to a sidebar/rail. The web progress bar uses a native range on
  Firefox, restoring click, drag and keyboard seek. Reopening the Android app
  no longer resumes a stale native `playWhenReady` state.

---

## Phase 2 — auth and Subsonic client

Implemented:

- `src/core/models` — Track, Album, Artist, Playlist, Genre, ServerConfig.
- `src/core/subsonic/params.ts` — API key, token+salt (`js-md5`), stable session
  salt, URL building, stream/cover/download URLs.
- `src/core/subsonic/client.ts` — ping, extensions, album lists, album, artists,
  artist, playlists, playlist, genres, songs by genre, search3, now playing,
  scrobble, star, play queue, save queue.
- `src/core/subsonic/errors.ts` — typed errors, auth/network helpers.
- `src/core/utils/redact.ts` + `logger.ts` — redact `t`, `s`, `apiKey`, `p`.
- `src/stores/auth.ts` — connect/ping, API key or token, remember server; password
  is memory-only.
- Web app state: localStorage. Native: atomic JSON files under `laila-state`;
  SecureStore is reserved for credentials and the Segue device id.
- Login screen with adaptive hero + form.
- Reverse-proxy header editor on login and saved servers (validated names/values,
  CR/LF and framing headers rejected, values never logged). Headers reach API,
  cover, download and Android playback requests; web `<audio>` cannot carry them.
- Saved-server Test button with latency; token-auth instances without a saved
  secret route to the unlock screen instead of leaving a dead active server.

Still to do:

- Real Navidrome CORS/reverse-proxy tests were not re-run in this pass; the user
  treats them as working. Keep the caveat that browsers cannot attach custom
  headers to an `<audio>` element, so web playback needs API-key auth or a
  same-origin proxy.

---

## Phase 2.5 — vertical slice

Verified on web against the mock server:

- login → home → album → play → player → queue.
- light and dark colour schemes.
- desktop 1440px and mobile 390px layouts.
- 21 unit tests pass; web export builds.

Verified later on a real Android device and a real Navidrome; the release APK
now runs on the phone and tablet. This is no longer a gate.

---

## Long playlists, shuffle and lyrics

Implemented:

- `VirtualTrackList` (FlashList) for album/playlist track lists. The header is part
  of the same virtualised scroller, so a 5,000-track playlist mounts only the
  visible window instead of every row.
- `TrackRow` now subscribes with primitive selectors (`isCurrent`, `isPlaying`) so
  a track change does not re-render every row.
- Home **Shuffle** now samples the whole library with `getRandomSongs`, refreshes
  the exclusion cache, and filters songs from playlists tagged
  `#<username>-exclusive`. It then enters radio mode and tops up with more random
  songs, excluding both the tag and tracks already queued.
- `src/core/exclusions/index.ts` + `src/services/exclusions.ts` port the
  the previous prototype behaviour: tag detection, playlist fan-out, persisted id cache,
  refresh on shuffle.
- Lyrics: `getLyricsBySongId` (OpenSubsonic), fallback `getLyrics` (LRC), active
  line highlight, auto-scroll with a Follow/Free toggle, tap a synced line to seek.
  Route `app/lyrics.tsx`, button in the player. The landscape cover is centred,
  and the active line uses the measured header/meta offset so it centres on the
  full screen rather than the scroll area.
- Player modal no longer shows the queue; the queue lives in its own sheet. Tap the
  mini player to open the player, swipe up on it to open the queue; the player also
  has a queue button.
- Swipe actions on track rows: 1:1 pan with Reanimated, threshold + haptics;
  configurable in Settings (`playNext`, `addToQueue`, `download`, `none`).
- Album/playlist Shuffle now filters the user's `#<user>-exclusive` song set
  through `playShuffled()`; all-excluded lists fail with a message instead of a
  queue. Home shuffle already used the same exclusion source.
- Settings have a shared **Pill / Rounded / Soft** chrome radius applied to the
  compact mini player, floating bottom tabs and the morph origin.
- Tests: LRC parser, mock `getRandomSongs` + exclusive playlist, E2E shuffle and
  lyrics flows.

Still to do:

- Synced lyrics on a real server and swipe-action device checks are treated as
  working per user.

## Phase 3 — library and search

Implemented:

- Home: greeting, featured recently played, recently played row, playlists, new
  releases grid, shuffle.
- Library: Albums / Artists / Playlists / Genres filters, virtualised FlashList grids.
- Search: debounced `search3`, songs/albums/artists sections.
- Album, artist, playlist, genre detail screens.
- Cover art via `getCoverArt` + `expo-image`, size-aware.
- Skeletons, empty states, error states.

Implemented since:

- Pinned albums and playlists (persisted local pins, Home "Pinned" section,
  Pin/Unpin in the album and playlist views).
- "Recently played" and "Recently added" are separate Home sections.
- Library search now includes song results (`search3` online, downloaded tracks
  offline) alongside albums, artists, playlists and genres.
- Library albums use `useInfiniteQuery` with real `offset` pages; scrolling to
  the end appends the next page (plus a manual Load more fallback).
- Accent/folding plus pinyin and initials via `pinyin-pro` for local metadata
  filters; the dedicated Search screen offers an on-demand full album scan when
  `search3` cannot answer a pinyin query. Lyrics search is server-API blocked.
- Web Library uses a windowed `FlatList` (`AlbumShelf.web.tsx`); 5k albums stay
  at ~368 DOM cards and ~78 MB heap (`docs/performance.md`).
- Artist, playlist and genre tabs are now screen-level FlashLists, not nested
  grids inside the screen ScrollView.
- Offline covers are cached by `coverArt` and used by `Artwork`/Downloads.
- Opening a downloaded playlist reconciles it with the server: new tracks are
  queued, removed tracks are cancelled, and files/covers are deleted only when
  no other collection references them.

Still to do:

- Lyrics full-text search is not exposed by OpenSubsonic/Navidrome `search3`.
  The client searches title/artist/album plus pinyin/initials; a lyric index
  needs server-side support and stays out of scope.
- Real-Navidrome 5k profile is treated as working per user; rerun the mock
  profiler as a regression check (`npm run profile:library`).

---

## Phase 4 — player and queue

Implemented:

- Pure `src/core/queue/reducer.ts`:
  - queue, index, upNext, originalQueue, repeat, shuffle;
  - play, enqueue, playNext, next, advance, previous, jump, remove, move,
    reorder, clear, repeat, shuffle.
- Unit tests cover transitions, upNext, shuffle/unshuffle, reorder, repeat.
- `src/stores/player.ts` — Zustand + persist; audio engine bridge.
- Web audio adapter: HTMLAudioElement, events, seek, volume, errors.
- Native adapter: local Media3 module (`setup`, `setQueue`, `play`, `pause`,
  `seekTo`, `setVolume`, events) — built, device matrix pending.
- Media Session metadata/actions on web.
- Player modal: blurred cover background, artwork, controls, progress, volume,
  up-next preview, codec badge.
- Now playing bar: compact and desktop variants.
- Queue modal: drag-and-drop (DraggableFlatList), move up/down, remove, clear,
  Alt+↑/↓ fallback.
- Artwork palette applies to shell while playing.
- Progress bar supports precise scrubbing: press and drag horizontally, the fill
  and a time pill follow the finger, vertical movement is ignored, and the seek
  commits on release. A plain tap still seeks.
- The maximised player background cross-fades the blurred cover and palette
  gradient together when the track changes; the new scene waits for its palette.

Still to do:

- Real gapless tests.
- Gapless strategy for web (two-element preload) if needed.
- Better drag feel on web + accessibility review (keyboard fallback works).

---

## Server instances and network switching

Implemented:

- `src/core/servers/switch.ts` — pure decision logic (bound SSID/cellular wins,
  unbound fallback, no switch on unknown network).
- `src/stores/auth.ts` — saved `servers[]`, active `server`, `fallbackKey`,
  `switchServer`, `removeServer`, `setServerNetwork`, `autoSwitch`.
- `src/ports/network.ts` + native adapter (`@react-native-community/netinfo`,
  SSID + location permission) and web no-op.
- `src/components/NetworkBridge.tsx` — listens to network changes and app resume.
- `app/(main)/servers.tsx` — list instances, active marker, bind current network,
  manual switch, remove.
- Login can name a server and bind it to the current Wi-Fi/cellular network.
- Downloads are keyed by song id, not URL, so the flag stays coherent across
  addresses. Queued downloads resolve their URL when they start.
- Tests: `tests/core/server-switch.test.ts` and the offline coherence test.
- Notes: `docs/server-switching.md`.
- The Servers screen can ping each saved instance and shows latency. Switching
  to an instance whose secret was not remembered now opens the unlock screen.

Still to do:

- None blocking. Switching to a token-auth server saved without "remember" now
  routes to the unlock screen; saved servers have a manual ping with latency.
  Automatic "pick the reachable instance" is still optional and not implemented.

## Phase 5 — offline (Android)

Implemented:

- `src/core/offline/index.ts` — pure index, collections, shared-song removal,
  collection progress.
- `src/ports/offline.ts` — `OfflineFiles` + download task contract.
- `src/adapters/native/offline.native.ts` — Expo FileSystem `Directory`/`File`/
  `DownloadTask`, original `download` URL, progress, pause/resume/cancel, size.
- `src/adapters/web/offline.web.ts` — explicit Android-only stub.
- `src/stores/offline.ts` — persisted index, two-at-a-time queue, pause/resume/
  cancel, remove track/collection, clear all, offline mode, local URI lookup.
- `app/(main)/downloads.tsx` — storage summary, collections, tracks, remove/clear.
- Download button on album/playlist screens (hidden on web).
- Player prefers a downloaded local file when present.
- App state (offline index, player queue, settings, pins, exclusions) uses atomic
  JSON files under `laila-state`; SecureStore is limited to credentials. Legacy
  values migrate on first read.
- Every download writes a sidecar manifest with the original track id and
  metadata. Hydrate merges manifests (repairing partial indexes), removes
  manifests for missing files, and only falls back to filename recovery for
  legacy files without a manifest.
- The player and offline stores are versioned (v1) with an identity migration
  from the unversioned shape.
- Download estimate and free-space warning (native `Paths.availableDiskSpace`,
  web storage estimate); optional Opus 128 / MP3 192 transcoded downloads.
- Original downloads are verified against the server-declared byte size; hydrate
  drops and removes truncated files/manifests. Transcodes are size-checked only
  for non-empty output because the target size differs by design.
- Tests: `tests/core/offline.test.ts` (including orphan recovery and integrity).

Still to do:

- Airplane-mode/offline restart is user-confirmed; the multi-GB index pass is
  still pending.
- Downloads now show a size estimate and free space, can transcode to Opus 128
  or MP3 192, and verify original files against the server-declared byte size.
  OpenSubsonic has no content hash, so integrity remains size-based.

---

## Phase 6 — Segue

Implemented:

- `src/core/segue/types.ts` — protocol shapes.
- `src/core/segue/discovery.ts` — probes `B/connect/v1/info`, origin fallback,
  manual hub URL, derives `ws(s)://`.
- `src/core/segue/client.ts` — WebSocket, hello, welcome, device/state merge,
  last playback, command/result, transfer, close codes.
- `src/core/segue/state.ts` — queue ↔ Segue state, shuffle `order`, transfer
  dropping of items without ids.
- `src/stores/segue.ts` — connect/disconnect, reconnect with backoff, state
  reporting, command execution, transfer to/from, `getNowPlaying` polling fallback.
- `app/devices.tsx` — device list, rename this device, last playback, continue
  here, play on, play/pause/next commands, polling notice.
- `src/components/SegueBridge.tsx` — connects on sign-in, reports meaningful
  player changes, disconnects on logout.
- Real-hub validation (2026-11-05): upstream hub in Go, two Android installs,
  discovery/hello/welcome, presence, state reports and stop-on-play all work.
  `stop` now leaves the player idle at position 0 instead of pausing mid-track;
  device names default to the model (and persist across renames); the manual hub
  URL survives the Devices refresh and reconnect path. Incoming Segue queues
  resolve missing covers from `getSong` (upstream hubs drop `coverArt`); remote
  device cards expose prev/play-pause/next and a volume slider.
- Manual hub URL in Settings.
- Mock hub in `scripts/mock-server.mjs` (info + WebSocket + fake TV).
- Tests: `tests/core/segue-state.test.ts`, `tests/core/handoff.test.ts`; E2E devices/transfer flow, handoff pill and paused reload. Matrix details in `docs/testing.md`.
- `HandoffPill` offers a remote playing/paused last playback (or a live playing
  device) on launch, auto-hides after 3.8 s, dismisses on an outside tap and
  transfers from the shown device on press; the pure `handoffCandidate` rule
  keeps it off during local playback/loading.
- Connection hardening: intentional closes no longer schedule zombie reconnects,
  a connection generation drops stale callbacks, hub discovery/attachment
  retries every 30 s, and the persisted queue is never loaded into the audio
  engine on launch (Android playWhenReady could start it with no input). A
  real-device log showed the hub can push `setQueue` with `play` on app open
  without a requesting device; Laila now honours play only when `from` names a
  requester, so the restore loads paused.

Confirmed:

- "Play on" transfer end-to-end between the phone and tablet over the real hub,
  in both directions (user-confirmed): queue, index, position, covers and
  receiver playback.

Still to do:

- None blocking.
- Two same-model installs still need a manual rename (defaults include the model).
- Persist last playback across app restarts when no hub is reachable.
- Add `addToQueue`, `moveInQueue`, `removeFromQueue` command coverage in tests.
- Handle id translation for Jellyfin (out of scope).

---

## DLNA/UPnP outputs (Android)

Implemented:

- `modules/dlna` — local Expo module: SSDP `MediaRenderer:1` discovery, device
  description parsing, AVTransport/RenderingControl control URLs. No npm
  dependency; web returns an empty list.
- `src/stores/cast.ts` + Devices screen section: scan for speakers, show
  name/manufacturer, start/stop casting.
- `src/core/dlna/control.ts` — SOAP controller and DIDL-Lite metadata
  (SetAVTransportURI, Play/Pause/Stop/Seek/GetTransportInfo/GetPositionInfo,
  RenderingControl volume).
- Player store routes play/pause/seek/next/previous through the active renderer;
  a 1 s poll drives status/progress and advances at the end of a track.
- Unit tests for DIDL/SOAP/time parsing; E2E covers the web no-op.

Still to do:

- Device test with a real DLNA speaker/TV.
- GENA event subscription instead of polling, if a device needs it.
- Keep the Android media notification in sync with the cast target.

---

## Phase 7 — hardening

Partially done:

- Credentials redacted in logs.
- Password not persisted; API key only with remember.
- No third-party runtime requests in the built app; hardened E2E guard covers
  fetch, images, audio and WebSocket hosts.
- Service worker caches only the app shell (`public/sw.js`; E2E asserts `/rest`,
  `/connect`, `/stream`, `/download` never enter a cache).
- Keyboard-first web: `/` focuses Library search, Space toggles playback even
  when a transport button has focus, ArrowLeft/Right seek 5 s (Shift 30 s),
  `n`/`p` step tracks, `s`/`r` toggle shuffle/repeat, `f` maximises/minimises
  the player, `q` opens the queue, `g h/l/d/s/q` navigate, `?` opens the
  shortcut sheet and Escape closes the player/overlay. Playwright covers it.
- Web dialog semantics: the maximized player is `role="dialog"` + `aria-modal`,
  is `inert` while parked, traps Tab, moves focus to Close and restores it on
  close. The queue and other rectangular lists keep a visible focus ring.
- Skip link (real anchor) focuses the single `#main-content` landmark.
- `ProgressBar` is keyboard-adjustable (arrows, PageUp/PageDown, Home/End) and
  exposes increment/decrement accessibility actions.
- A keyboard cheat sheet is available with `?` and from Settings.
- Focus-visible ring restored on text inputs and buttons.
- Reduced-motion is honoured by Reanimated press/marquee/skeleton animations and
  the global CSS media query.
- Memory/background policy documented, not fully implemented.
- CSP is defined in `app/+html.tsx`; broad `http(s)`/`ws(s)` only for
  user-configured server, cover, stream and Segue hosts (`docs/csp.md`). It is
  still not emitted by the `web.output: single` export (see below).
- Subsonic responses are validated with Valibot at the envelope/model boundary.
- Transient read failures retry twice with exponential backoff; mutations do not.
- Accessibility: heading roles, progress labels, keyboard-adjustable sliders, a
  skip link, player dialog focus trap, and Playwright focus/name/shortcut checks.
  A full screen-reader and contrast pass is still open.

Recently completed (2026-11-06):

- Recently played is server-driven; scrobbles now send the Subsonic `time` in
  milliseconds (not seconds), a successful scrobble invalidates the album
  queries, and Home refetches recent on mount.
- Server switching without stale data: the native queue rebuilds its absolute
  stream URLs when the active server address/credentials change, so the next
  track keeps working after a Wi-Fi/cellular switch.

Still to do:

- Long-session memory test.
- Full screen-reader pass (NVDA/TalkBack/VoiceOver) and a contrast audit.
- Landmarks/headings audit for library, album, queue and devices.
- Custom HTML head (CSP meta, `color-scheme`, global focus CSS) is not present in
  the `web.output: single` export; `+html.tsx` only applies to static output.
  Ship it through a custom template or switch output, then assert it in E2E.
- Performance/60 fps measurements and a device jank pass.

---

## Phase 8 — refactor and efficiency (current priority)

**Started:** 2026-11-06. No new features until this pass is complete.

Goal: make the existing client smaller, clearer and cheaper to run without
changing behaviour. This is an incremental refactor, not a full performance
rewrite; do not implement a wholesale reimplementation.

First pass landed (2026-11-06):

- Split the web Media Session bridge from `PlayerBridge`, so position updates no
  longer recreate metadata or re-register action handlers.
- Moved live download progress into a transient, 250 ms-throttled store; the
  persisted offline index no longer changes on every chunk.
- Centralized query keys and narrowed scrobble invalidation to the recent list.
- Added a windowed web `VirtualList` for Library tabs and track lists; FlashList
  is no longer in the web bundle.
- Result: 105 unit tests, 56 default E2E checks, web common JS 4.43 MB (was
  4.51 MB), Android release APK 39 MB.

Next workstreams:

1. **Organisation** — split oversized stores and screens by responsibility; move
   pure logic into `src/core`; remove dead code and one-off abstractions; keep
   public module boundaries stable.
2. **Rendering/state** — memoise `AlbumCard` and rows where callbacks are stable;
   audit list-row selectors and high-frequency subscriptions.
3. **Startup/storage** — lazy/background offline hydration; avoid serializing
   unchanged player/offline state; trim manifest and image startup scans.
4. **Bundle** — lazy-load `pinyin-pro` only for deep CJK search; measure the
   remaining web bundle and startup.
5. **Guardrails** — measure cold start, memory, CPU and request counts before and
   after each change; keep unit/E2E green and revert changes without a win.

Likely candidates to audit next: `src/stores/player.ts`,
`src/stores/offline.ts`, `src/core/subsonic/client.ts` and
`app/(main)/index.tsx`. Audit before splitting; do not reshuffle directories for
its own sake.

Out of scope: server-only listening stats and other parked feature ideas. They
remain on hold until this pass is complete.

Exit criteria:

- No user-facing feature changes.
- Typecheck, lint, the current 105-unit / 56-default-E2E baseline and the web
  export pass.
- Android release build and a device smoke pass.
- Before/after numbers recorded in `docs/performance.md`.
- No wholesale performance rewrite.

---

## Known gaps / risks

1. **Android device passes are mostly done.** Lock-screen transport, task-removal
   stop, offline restart, SSID switching and the codec matrix are user-confirmed.
   Remaining: a real DLNA speaker, gapless playback and a multi-GB download index.
2. **Media3 device validation.** The local Media3 engine replaced RNTP and
   removes the non-commercial license blocker. Notification, lock screen,
   Bluetooth, audio focus, gapless and codec behaviour still need the device
   matrix in `docs/audio-engine-comparison.md`.
3. **CORS / CSP.** Real Navidrome deployments vary; same-origin proxy is the
   preferred path. CORS/reverse-proxy use is treated as working per user. The CSP
   meta tag exists in `app/+html.tsx` but is not emitted by the single-file web
   export yet.
4. **Artwork palette on native.** Web uses canvas; native now uses
   `react-native-image-colors`. Still needs a real-device visual check.
5. **SVG covers.** Mock covers are SVG; real Navidrome covers are JPEG/PNG. Palette
   extraction should be re-tested with real covers.
6. **Queue drag on web.** DraggableFlatList works in the browser bundle but the
   feel needs a real test; Alt+↑/↓ is the reliable fallback.
7. **Segue and offline.** Segue transfer over the real hub is confirmed
   phone↔tablet; offline restart and SSID switching are user-confirmed. Remaining:
   same-model device rename, persisting last playback when no hub is reachable,
   and add/move/remove command coverage.

---

## References

- `README.md` — quick start, features and platform support.
- `DESIGN.md` — architecture and design decisions.
- `STRUCTURE.md` — source layout and layer rules.
- `docs/testing.md` — commands, test counts, codec/browser matrices and device status.
- `docs/changelog.md` — dated implementation history.
- `docs/performance.md` — library profiling and the refactor baseline.
- `docs/accessibility.md`, `docs/csp.md`, `docs/dlna.md`, `docs/motion.md`,
  `docs/server-switching.md` — topical technical notes.
