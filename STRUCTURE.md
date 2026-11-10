# STRUCTURE — Laila

Public source layout and layer rules.

```text
laila/
├── app/                     # Expo Router routes (login, main shell, player, queue, devices)
├── src/
│   ├── core/                # pure TypeScript: no React/RN/audio/browser APIs
│   │   ├── audio/
│   │   ├── dlna/
│   │   ├── exclusions/
│   │   ├── http/
│   │   ├── lyrics/
│   │   ├── models/
│   │   ├── offline/
│   │   ├── queue/
│   │   ├── search/
│   │   ├── segue/
│   │   ├── servers/
│   │   ├── subsonic/
│   │   ├── trash/
│   │   └── utils/
│   ├── ports/               # interfaces: audio, storage, offline files, network, DLNA
│   ├── adapters/            # native, web and storage implementations of the ports
│   ├── services/            # wiring: query client, exclusions, storage, audio, network
│   ├── stores/              # Zustand stores built on the pure core
│   ├── hooks/               # React hooks for library, lyrics, free space, chrome
│   ├── theme/               # tokens, palette extraction, light/dark theme
│   ├── ui/                  # primitives and design-system components
│   ├── components/          # feature components
│   └── utils/               # formatting and haptics
├── modules/
│   ├── dlna/                # local Expo module: SSDP discovery and AVTransport
│   └── laila-player/        # local Expo module: Media3 playback and media session
├── plugins/                 # config plugins (per-ABI APK splits)
├── scripts/                 # mock server and library profiler
├── tests/
│   ├── core/                # Vitest unit tests
│   └── e2e/                 # Playwright desktop, mobile and Firefox checks
├── docs/                    # screenshots and public technical notes
├── assets/                  # bundled icons and splash images
├── public/                  # web manifest, service worker and static icons
├── app.json
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── vitest.config.ts
```

## Layer rules

| Path | Owns | Must not |
|---|---|---|
| `src/core/subsonic` | Query building, parsing, errors, redaction | Import React/RN/audio |
| `src/core/queue` | Pure queue reducer | Import Zustand/audio/DOM |
| `src/core/segue` | Protocol, discovery, handoff, state mapping | Import React/RN/audio |
| `src/core/offline` | Index/metadata logic | Touch FileSystem directly |
| `src/ports/*` | Interfaces only | Contain platform code |
| `src/adapters/native/*` | Media3 bridge, JSON state files, SecureStore secrets, FileSystem, DLNA | Leak into core |
| `src/adapters/web/*` | HTMLAudioElement, localStorage, browser APIs | Leak into core |
| `src/theme/*` | Tokens, palette, motion | Contain navigation |
| `src/ui/*` | Primitives | Contain business logic |
| `src/stores/*` | Zustand state | Own pure queue logic |

## Refactor rules

- No new features during the refactor/efficiency pass; changes must preserve
  user-visible behaviour.
- Move pure logic down into `src/core`; keep adapters and stores thin.
- Split files by responsibility, not by arbitrary line count. Audit before
  moving modules or renaming directories.
- Measure before and after. Keep a change only when it reduces cost or clearly
  improves organisation without regression.
- Do not implement a wholesale performance rewrite; cherry-pick only candidates
  that address a measured bottleneck.

## Dependency direction

```text
app / components / stores
        │
        ▼
      ports  ◄──── adapters (native/web)
        ▲
        │
      core (pure)
```

- `core` never imports upward.
- `adapters` implement `ports`; they do not import screens/stores.
- `stores` use `core` and `ports`; screens use `stores`/hooks.
- Platform selection uses `.native.ts` / `.web.ts` files.

## Related docs

- `DESIGN.md` — architecture, adaptive breakpoints, deployment and design system.
- `docs/testing.md` — test layout, commands, matrices and device status.
- `docs/performance.md` — library profiling and the refactor baseline.

The test directories themselves are listed in the source tree above:
`tests/core/` for Vitest and `tests/e2e/` for Playwright.
