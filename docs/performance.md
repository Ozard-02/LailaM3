# Library performance — 1000+ albums

Repeatable profiler for the Library's offset pagination and grid rendering.

## Current priority — 2026-11-06

No new features. The current pass is an incremental refactor/efficiency review:
measure first, keep only changes with a measurable win, and do not attempt a
full rewrite. Record before/after numbers here for:

- web export size and startup/hydration time;
- library grid timings, request counts and JS heap;
- player/queue open and scroll cost;
- Android cold start, background playback and memory;
- any network/storage work removed or consolidated.

## Refactor baseline — 2026-11-06 (before changes)

- Unit: 97 tests in 17 files.
- E2E: 56 default checks; 94 with `FULL_E2E=1`.
- Web export (`expo export -p web`): common JS 4.3 MB, entry JS 1.1 MB,
  `dist/` 6.2 MB.
- Android release APK (`arm64-v8a`): 39 MB.
- Library 5k profile (2026-11-05): 542 ms first grid, 44 requests, 368 DOM cards,
  78 MB heap.
- Known costs to re-measure after the pass:
  - `PlayerBridge` Media Session effect re-runs on every position update.
  - Download progress updates the whole offline store on every chunk.
  - Library tabs and `VirtualTrackList` use FlashList on web.
  - Player and offline stores serialize partialized state on every `set`.

## Refactor result — 2026-11-06

- Unit: **105 tests** in 19 files.
- Web export: common JS **4.43 MB** (was 4.51 MB), entry **1.12 MB**
  (unchanged), `dist/` **6.1 MB** (was 6.2 MB). FlashList is no longer referenced
  by the web JS bundle.
- Web Library tabs and `VirtualTrackList` now use a windowed FlatList; small
  nested grids use a flex-wrap view instead of FlashList.
- `PlayerBridge` position updates no longer recreate Media Session metadata or
  re-register action handlers.
- Download progress is a transient, 250 ms-throttled store; the persisted
  offline index is no longer updated on every progress chunk.
- Android release APK: **39 MB**, build successful.
- Still to measure: cold-start/hydration with a large download index and CPU/GC
  during playback and parallel downloads.

## Pass 2 — bundle (2026-11-08)

Per-package sizes come from Metro's indexed source map
(`npx expo export -p web --source-maps`, one section per module).

| Web JS | Before | Icons per module | + lazy pinyin |
|---|---|---|---|
| common chunk | 4328 KB | 2062 KB | **1578 KB** (gzip 336, brotli 270) |
| entry chunk | 1092 KB | 1092 KB | 1092 KB (gzip 286, brotli 227) |
| pinyin chunk (on demand) | — | — | 484 KB |

- `lucide-react-native` was 2325 KB (54% of common): Metro does not
  tree-shake, so the barrel bundled ~2,000 icons for 57 used. Now 53 KB via
  `src/ui/icons.ts`; lint bans the barrel.
- `pinyin-pro` (484 KB) moved to its own chunk, fetched the first time a
  local filter meets CJK text. The service worker caches it on first use like
  the route chunks; offline before first use, CJK still matches by characters.
- Remaining common: reanimated 652 KB, gesture-handler 273 KB, valibot 103 KB.
  Entry: expo-router 444 KB, react-native-web 310 KB, react-dom 204 KB. These
  are framework costs; no cheap change identified.
- Route chunks are already split by Expo Router.
- Android release APK (`arm64-v8a`): **38 MB → 35 MB**. Hermes bundle 6422 →
  4812 KB (icons; pinyin stays in the native bundle, which Metro does not
  split), `resources.arsc` 2466 → 1447 KB and `res/` 1113 → 842 KB from resource
  shrinking. R8 was already on in the generated `android/`; it is now pinned in
  `app.json` so a clean prebuild keeps it. Native `.so` libraries (24 MB) are
  React Native/Expo and unchanged. Bundle compression stays off (slower start).
- Serve `dist/` with gzip or brotli on the reverse proxy: startup JS on the wire
  is ~0.5–0.6 MB compressed vs 2.6 MB raw.

Android devices, release `arm64-v8a`, signed in with a restored queue. Three
cold starts each (`am force-stop` + `am start -W`); `TotalTime` is the first
frame (splash), so it mostly reflects native start, not JS load. PSS from
`dumpsys meminfo` right after the first frame.

| Device | Build | TotalTime ms (3 runs) | PSS MB (3 runs) |
|---|---|---|---|
| Phone SM-F766B | before | 160 / 135 / 125 | 78 / 80 / 85 |
| Phone SM-F766B | after | 128 / 130 / 131 | 84 / 83 / 77 |
| Tablet SM-X730 | before | 147 / 163 / 152 | 151 / 150 / 148 |
| Tablet SM-X730 | after | 120 / 137 / 120 | 142 / 142 / 142 |

Phone: within noise. Tablet: ~17% faster first frame and ~5% lower PSS.
No crashes or JS errors in logcat; Home renders with all icons on both.
Playback notification/lock-screen controls still need a manual check after
resource shrinking.

## Run

```sh
npm run build:web
npm run profile:library          # 1200 albums
MOCK_ALBUMS=5000 npm run profile:library
```

The script starts the mock server on port 4547 with `MOCK_ALBUMS` generated
albums, serves `dist/` on 4175, signs in, opens Library, scrolls to the end and
prints JSON. It counts every `getAlbumList2` request and its `offset`.

## First result — 2026-11-04

Chromium 1440×1000, production web export, mock server:

| Metric | 1200 albums |
|---|---|
| First album grid visible | **944 ms** (from clicking Library) |
| All pages loaded | **~5.2 s** from sign-in, 13 requests |
| Offsets requested | `0` ×3 (Home recent/newest + Library), then `120 … 1200` |
| Album cards in the DOM | **1200** |
| JS heap | **~228 MB** |

Interpretation:

- Offset pagination works: 120 albums per page, no re-query of the whole prefix.
- The 3 initial `offset=0` calls are different queries (Home recently played,
  Home recently added, Library), not duplicate Library pages.
- **FlashList on web renders all 1200 cards.** The grid is virtualised on
  Android, but the web build keeps every card in the DOM; 5k albums will need a
  windowed fallback or a smaller web page size. This is the main follow-up.
- Heap is dominated by the rendered cards and their images, not the query cache.

## Windowed web grid — 2026-11-05

`src/components/AlbumShelf.web.tsx` uses React Native Web's `FlatList`
(`VirtualizedList`) instead of FlashList. FlatList windows rows, so the DOM
stays bounded while the query cache keeps all pages.

| Metric | 1200 albums | 5000 albums |
|---|---|---|
| First album grid visible | **845 ms** | **542 ms** |
| `getAlbumList2` requests | 13 | 44 |
| Album cards in the DOM | **368** | **368** |
| JS heap | **~202 MB** | **~78 MB** |

`loadedMs` for 5k is ~103 s because the profiler scrolls in 350 ms steps and
waits for each new page; it is not the app's load time. The important result is
that 5k albums no longer mean 5k mounted cards. Heap varies between runs (image
decoding and GC), so treat it as an order of magnitude, not a precise figure.

## Follow-ups

- Profile a real Navidrome with 1000+ albums; the user treats this as working
  for now, so this is a regression check rather than a blocker.
- Consider a smaller first page on very large libraries if the initial query
  ever becomes the bottleneck; the current 120/page is fine at 5k.
