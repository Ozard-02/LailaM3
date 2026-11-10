# Server instances and network switching

Laila can hold several addresses for the **same library**: home Wi-Fi, cellular,
or a public reverse proxy. It switches automatically and keeps downloads valid
across addresses.

This mirrors the feature in `the previous prototype` (`app/contexts/networkAutoSwitch.js`,
`app/screens/Settings/AddServer.js`, `app/utils/downloadManager.native.js`).

## What the previous prototype did

- Each saved server (`settings.servers[]`) had an optional `network`:
  - a Wi-Fi SSID, or
  - the sentinel `__cellular__`.
- On every `NetInfo` change and app resume, `decide()`:
  - on cellular, picked the server bound to `__cellular__`;
  - on Wi-Fi, picked the server whose `network` matched the lowercased SSID;
  - if leaving a bound network, restored the last unbound server (`lastFallback`)
    or any unbound server.
- `Player.switchServer(server)` re-pointed the active config.
- The download index was keyed by **song id**, not by server URL. So a download
  done on the LAN address still counted as downloaded on the public/cellular
  address of the same library.
- Queued downloads were re-pointed to the new address (`repointQueued`); in-flight
  downloads kept their URL because the bytes are the same library. This avoided
  throwing away partial downloads.

## What Laila does

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
