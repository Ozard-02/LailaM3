# Laila roadmap

Laila is an alpha Android-first client for Navidrome/OpenSubsonic, with a
first-class web build. This page is the public status summary. Architecture and
design decisions live in [`DESIGN.md`](DESIGN.md); test commands and device status
live in [`docs/testing.md`](docs/testing.md).

## Current state

- Android release builds and the web export are usable today.
- There is no store release yet.
- The measured large-library/offline performance pass has landed: offline index
  updates are batched, persisted writes are coalesced, search indices are folded
  once per data change, library search and Downloads are virtualised, and a local
  download budget is available.
- Queue behaviour is refined: the queue opens on the playing track before the
  panel appears, and trashed tracks are removed from the native queue without
  restarting playback.
- The Android engine is a local Media3 module. It replaces the previous RNTP
  baseline and removes the non-commercial license blocker.
- The Media3 device matrix is still pending: notification, lock screen,
  Bluetooth, audio focus, gapless and codecs must be re-validated on hardware.

## Implemented

### Playback and queue

- Streaming from Navidrome or any OpenSubsonic-compatible server.
- Original FLAC and server-side transcoding to Opus or MP3.
- Play, pause, seek, previous/next, volume, repeat and shuffle.
- Persistent queue with drag reorder and keyboard fallback.
- Background playback and Android media notifications/lock-screen controls.
- Media Session and keyboard transport on the web.
- Queue trash with undo, shuffle/radio exclusions and per-server playlists.
- Trashing removes the item from the native queue without reloading the current
  track.
- The queue opens on the playing track and aligns before the panel is visible.
- Radio top-up, up-next and queue reordering.

### Library

- Albums, artists, playlists, genres and favourites.
- Server-wide search plus local accent folding, pinyin and initials.
- Pinned albums, playlists and favourites on Home.
- Recently played, recently added and downloaded-only views.
- Album/playlist actions: play next, add to queue, add to playlist, pin.

### Downloads

- Offline albums, playlists and individual tracks on Android.
- Original, Opus 128 or MP3 192 downloads.
- Size estimate, free-space check and byte-size integrity verification.
- Sidecar manifests so a lost index can still recover downloaded metadata.
- Downloaded playlists reconcile when opened: new tracks are queued, removed
  tracks are cleaned up, and files are deleted only when no other collection uses
  them.
- Local download budget with Free up space; collections display their on-disk
  size.
- Batched offline index writes, coalesced persistence, virtualised library search
  and Downloads list.

### Devices and Segue

- Segue hub discovery, device presence, remote transport and volume.
- “Play on” transfer between devices, including queue and position.
- Launch-time “Continue here” handoff for a playing or paused remote device.
- `getNowPlaying` polling fallback when no hub is configured.
- DLNA/UPnP speaker discovery and AVTransport casting on Android.

### Web and privacy

- Same codebase as Android, with window-size-driven layouts.
- Keyboard-first navigation and player controls.
- App-shell-only service worker; audio and authenticated API responses are never
  cached.
- API-key authentication preferred; token + salt supported as a fallback.
- Reverse-proxy headers for Authelia, Cloudflare Access and similar gateways.
- Credentials stay on the device; header values are not logged.
- Multi-server instances can be bound to a Wi-Fi SSID or cellular network.

## Next

1. Re-run the Media3 device matrix on phone and tablet after the queue/player
   changes.
2. Validate DLNA against a real speaker or TV.
3. Test a multi-GB download index.
4. Finish the screen-reader and contrast pass.
5. Build a signed, reproducible release pipeline.
6. Run the real-Navidrome web codec, CORS and reverse-proxy matrix.

## Known gaps

- Media3 device validation is the main release blocker. The previous RNTP engine
  was validated on device; the new engine is built and wired but not yet measured
  across the full matrix.
- CORS and CSP behaviour varies with real Navidrome deployments. Same-origin
  proxying is the preferred path.
- Artwork palette extraction on Android still needs a real-device visual check.
- SVG covers are used by the mock server; real JPEG/PNG covers should be re-tested.
- Queue drag works on the web bundle but still needs a real browser feel test.
- There is no store release, signing pipeline or store listing yet.

## Test baseline

- 154 unit tests in 27 files.
- 66 default E2E checks across Chromium desktop, the mobile viewport and one
  Firefox seek check.
- Typecheck, lint and the production web export pass.
- Android release builds; device install and the Media3 matrix are pending.

See [`docs/testing.md`](docs/testing.md) for commands, coverage and the codec
matrix.
