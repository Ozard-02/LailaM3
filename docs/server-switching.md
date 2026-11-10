# Server instances and network switching

Laila can hold several addresses for the **same library**: home Wi-Fi, cellular,
or a public reverse proxy. It switches automatically and keeps downloads valid
across addresses.

## How it works

- `ServerConfig` has optional `name` and `network` (`SSID` or `__cellular__`).
- `useAuthStore` keeps `servers[]`, the active `server`, and a persisted
  `fallbackKey`.
- `src/core/servers/switch.ts` is the pure decision function:
  - bound SSID/cellular wins;
  - leaving a bound network falls back to the remembered unbound instance, then
    any unbound instance;
  - unknown network → no change.
- `src/components/NetworkBridge.tsx` listens to
  `@react-native-community/netinfo` and app resume. Web is a no-op (browsers do
  not expose the SSID).
- `app/(main)/servers.tsx` lists instances, shows the active one, lets the user
  bind the current network, switch manually, or remove an instance.
- The login screen can name a server and bind it to the current Wi-Fi/cellular
  network.
- `src/core/offline/index.ts` is still keyed by **track id**. There is no server
  field in a download entry. The downloaded flag therefore survives an address
  change.
- `src/stores/offline.ts` builds a download URL when a queued item starts, so a
  server switch re-points queued downloads automatically. An in-flight
  `DownloadTask` keeps the URL it started with.
- `PlayerSourceBridge` detects a change in the active server URL, credentials or
  proxy headers and calls `refreshSources()`. The native queue is rebuilt with the
  new absolute stream URLs while preserving the current index, position and
  play/pause state; otherwise the next track would try a stale URL.
- Token-auth servers are only usable after a reload if the user opted into
  "Remember this server" (token+salt stored, with a warning). Otherwise the app
  shows the unlock screen with URL/username prefilled.

## Tests

- `tests/core/server-switch.test.ts` — Wi-Fi, cellular, fallback, no-match.
- `tests/core/offline.test.ts` — downloads keyed by track id, shared-song removal.
- `tests/e2e/app.spec.ts` — saved server instances screen; unlock-after-reload.

## Device validation

Confirmed:

- SSID permission and SSID detection on Android 13+.
- Wi-Fi ↔ cellular transition while a track is playing. The native queue now
  rebuilds its absolute stream URLs after the switch, so the next track keeps
  working.

Still to validate:

- Wi-Fi ↔ cellular transition during a download (queued re-point, in-flight keep).
- Fallback when the bound address is unreachable even if the network matches.
