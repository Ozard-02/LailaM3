# Changelog

Dated implementation history. Current status and priorities live in
`ROADMAP.md`; test commands and matrices live in `docs/testing.md`.

## 2026-11-12

- Large-library/offline performance pass: offline index mutations are batched,
  hydrate verifies downloads from one directory listing, persisted state writes
  are coalesced, search haystacks are folded once per data change, quadratic
  scans in queue/Segue/sheets are removed, library search and Downloads are
  virtualised, and cover pruning runs once per batch.
- Local download budget with an explicit Free up space action; downloaded
  collections show their on-disk size.
- Player/queue refinements: the queue opens on the playing track and is aligned
  before the panel becomes visible; trashing a track removes it from the native
  Media3 queue in place without restarting the current track; album header
  spacing is corrected.
- New `profile:core` harness (`tests/bench/core.bench.ts`) measures 20k-track
  paths against targets; it stays out of the normal unit run.
- Test baseline: 154 unit tests; 66 default E2E checks.

## 2026-11-10

- Project licensed under MIT. The public repository starts from the local Media3
  engine; `@rntp/player` is no longer a dependency. Device validation is tracked
  in `docs/testing.md`.
- Web/tablet navigation is a 76 px icon rail: larger 56 px target buttons and 26 px
  icons, no app name/brand and no server card. Safe-area padding keeps the first
  icon below the tablet status bar.
- Web player is a centred pill instead of a full-width bar; it is larger than the
  phone/tablet pill (720 px max, 72 px high) and opens with the same morph.
- Settings are grouped into accent-headed sections: Account, Playback, Downloads,
  Appearance, Library & queue, About. The Red accent preset no longer washes out
  to pink; section borders/icons use the accent.
- Added “Continue with radio” (on by default): when a queue ends, random library
  songs continue only when enabled, respecting shuffle exclusions.
- Marquee text no longer ellipsizes when it fits: an explicit width is applied
  only when the text actually overflows.

## 2026-11-09

- Queue drag: a second drag is ignored until the previous drop spring and the
  list reset have finished, so it can no longer inherit the previous active row.
  The active row now scales and shows its shadow without being clipped; the swipe
  actions are clipped in a separate layer.
- Refactor: track and queue rows share one horizontal-swipe hook; `QueueRow`
  moved out of `QueuePanel`; playlist invalidation is centralised in
  `queryKeys`/`invalidatePlaylistQueries`; the Undo toast uses a selector instead
  of a store-wide subscription. Scrobble/session and stream-source helpers moved
  out of `src/stores/player.ts` into `src/stores/player/`.
- Queue trash: swipe left on a queue row to add it to a per-server Trash playlist,
  remove every queue occurrence, skip to the next track when it was current, and
  remove the favourite and local download. Swipe right moves a non-current row to
  Up next. Undo restores the queue only and removes the playlist entry.
  Selecting a Trash playlist adds the existing `#<user>-exclusive` tag, so shuffle
  and radio exclude it on every app instance. Also available from the player’s
  More options and the `Delete` shortcut. The queue header uses X to close and
  ListX to clear the queue. The Undo toast lasts four seconds and disappears on
  the next queue interaction.

## 2026-11-08

- Segue transfers with shuffle active keep their artwork after unshuffling:
  remotely hydrated covers are now applied to `queue`, `originalQueue` and
  `upNext`, not only the visible queue.
- Icons are imported one module per icon through `src/ui/icons.ts` instead of
  the `lucide-react-native` barrel, which bundled all ~2,000 icons. Web common
  JS 4328 KB → 2062 KB. Lint rejects the barrel import.
- `pinyin-pro` (484 KB) loads on demand the first time a local filter meets CJK
  text; Library, Search and playlist filters re-render when it arrives. Until
  then CJK text still matches by its characters. Web common JS 2062 → 1578 KB.
- Android release: R8 minify and resource shrinking pinned in `app.json`
  (`expo-build-properties`). arm64 APK 38 MB → 35 MB with the bundle changes.

## 2026-11-07

- Lyrics lines are now horizontally centred instead of left-aligned, on both
  phone and landscape layouts; vertical follow and centring are unchanged.
- New pixel-heart app icon cropped from the supplied artwork and rebuilt for
  iOS/Android adaptive, splash, favicon and PWA maskable assets.
- Queue drag: “add to next” now moves the track out of the queue instead of
  duplicating it; the currently playing track cannot be moved. The move is
  committed on touch release instead of waiting for the snap-back animation.
- Handoff pill changes reverted to the previous implementation.
- Unit suite: 105 tests.

## 2026-11-06

- Recently played now updates at the end of a track. Subsonic scrobbles send
  `time` in milliseconds, a successful scrobble invalidates the album queries,
  and Home refetches `recent` on mount.
- Network/server switches rebuild the native queue's absolute stream URLs through
  `PlayerSourceBridge` and `refreshSources()`, preserving index, position and
  play/pause.
- Release APK installed on the tablet and phone; 102 unit tests and 56 default E2E
  checks pass.
- Refactor pass: split the web Media Session bridge from `PlayerBridge`, moved
  live download progress into a throttled transient store, centralized query
  keys and narrowed recent-album invalidation, and added windowed web lists for
  Library tabs and track lists. FlashList is no longer in the web bundle.
- Documentation reorganized: test data in `docs/testing.md` and dated history
  here.

## 2026-11-05 — Segue and device pass

### Phase 6 additions

- Added Segue client, store, discovery, state mapping, devices screen, mock hub.
- Added settings for a manual hub URL.
- Added E2E Playwright config and 12 tests (desktop + mobile).
- Added ESLint flat config; zero errors/warnings.
- Validated Android prebuild (`expo prebuild --platform android --no-install`)
  after adding background-audio permissions.
- Fixed a React hook-order crash in the now-playing bar.
- Fixed transfer index handling and paused-transfer autoplay.

### Device-test fixes

- Android release now allows cleartext HTTP (`expo-build-properties`), so a LAN
  Navidrome at `http://192.0.2.x:4533` can be used. The login form warns when the
  URL starts with `http://`; HTTPS remains the default recommendation.
- Login fields expose Android autofill hints (`username`, `current-password`,
  `importantForAutofill`), so Bitwarden/Google can fill server credentials.
- Native audio items now carry an explicit MIME type derived from the track suffix
  (or the requested transcode). `/rest/stream` URLs have no file extension, and
  ExoPlayer benefits from the hint.
- Release APK built and installed on the connected Z Flip; first launch verified.
- Still to verify: real playback on the device, local-Wi-Fi login, autofill sheet.

### Security/UX additions

- `remember` now controls persistence of the API key/token. Without it, the
  persisted server has no secret, and a reload shows the unlock screen with the
  URL/username prefilled.
- Remembered token sessions store a replayable token+salt, with a warning in the
  login form.
- PWA manifest + service worker cache only the app shell.
- Focus-visible outline and reduced-motion CSS on web.

## 2026-11-04

- Added per-ABI Android release packaging through a config plugin; arm64-v8a APK
  drops from 105 MB universal to 38 MB.
- Added a shared `ActionSheet` used by the player and album screens; album top bar
  now exposes Add album to next/queue and Open artist.
- Fixed album/playlist "+" to append to the queue end.
- Removed the seek/30 s skip buttons from the Android notification; only
  play/pause and previous/next remain.
- Added web keyboard-first transport (`/`, Space, arrows, Escape) and restored
  focus-visible rings on inputs.
- Hardened the Playwright network guard and added an app-shell-only service worker
  cache test.
- Added add-to-playlist: `updatePlaylist` client, shared multi-select sheet with
  Favourited pseudo-playlist, duplicate skip and read-only owner handling.
- Player is now an overlay sheet: the mini-player drag moves its top edge 1:1 and
  release past 75% snaps it open.
- Rebuilt `MarqueeText` as a seamless two-copy loop; width is measured through a
  hidden horizontal ScrollView so it works on native and web.
- Synced the native RNTP queue with `setMediaItems`, which restores the Android
  notification previous/next buttons (queue size is no longer 1).
- Reduced the horizontal swipe rebound with a 170 ms timing reset.
- Intercepted native auto-advance so title/cover/lyrics follow the track that
  actually started; normal transitions update without reloading.
- Add-to-playlist now marks playlists that already contain the track and refreshes
  membership after an add; toggling a checked playlist removes the track (and
  Favourited toggles star/unstar).
- The maximised player title uses the one-line marquee, with longer still pauses
  (4.5 s initial, 6 s between passes).
- Real offline mode: automatic on no network, manual toggle in Downloads, offline
  Home/Library/detail screens, paused React Query traffic and queue skipping.
- Hardening: Valibot envelope/model schemas, CSP meta + `docs/csp.md`, progress
  labels/heading roles/focus E2E, retrying Subsonic reads with backoff, and a
  600-track queue stress test.
- Scale/UX: pinned albums/playlists, recently added section, songs in Library
  search, load-more albums, `docs/motion.md` and a dev component gallery.
- Favourites: `getStarred2`, a Favourited card in the Playlists section and a
  dedicated screen with offline fallback.
- Downloads: active transfer speed/progress and loose-track filtering.
- Downloads: parallel count setting, downloaded/total collection counters and
  auto-download of tracks added to a downloaded playlist.
- Favourites can be pinned and is downloadable as the `__favourites` collection;
  starring/unstarring syncs that collection, and Home shows the card in both
  Pinned and Your playlists.
- The queue sheet is now above the player's shared cover/title/play; the cover
  swipe is restored after the morph.
- Add-to-playlist shows shuffle-excluded playlists with a Shuffle badge.
- Mini player → player uses a measured shared-element morph: background grows
  from the pill, artwork/title/play fly to measured expanded rects, expanded
  content fades late; 1:1 drag and no squashed layout. Transform-only background,
  radius compensation, hardware textures released at rest, deferred blur, a soft
  scrim, marquee pause only while moving and hysteresis on the details fade keep
  the drag smooth.
- Animation/gesture deep dive: isolated 2 Hz playback progress into
  `PlaybackProgress`, pre-mounted the player surface, combined morph reactions,
  time-based scrim/details opacity, memoized lyric rows and split `LyricsBody`,
  shared skeleton pulse and `startTransition` for artwork palettes.
- The morph keeps its shared overlays for the whole transition; the queue-only
  element swap happens when the queue opens, and memoized `PlayerScreen` avoids
  the full-player refresh at the end.

## Initial scaffold

- Scaffolded Expo 58 + RN 0.88 + Expo Router + TypeScript strict.
- Added design tokens, theme provider, artwork palette, UI primitives.
- Added adaptive shell (tabs/rail/sidebar) and persistent player bar.
- Added Subsonic client and auth store.
- Added library, search, album, artist, playlist, genre screens.
- Added pure queue reducer + tests and Zustand player store.
- Added web audio adapter and native RNTP v5 adapter.
- Added player modal, queue modal, drag-and-drop + keyboard fallback.
- Added mock Subsonic server with generated covers and WAV audio.
- Verified web build and main flows with Playwright at desktop and mobile sizes.
- Fixed a React hook-order crash in the now-playing bar after starting playback.
