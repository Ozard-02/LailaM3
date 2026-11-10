# DLNA / UPnP speakers

Android-only output target for local smart speakers, TVs and AV receivers that
expose UPnP `MediaRenderer:1`. Web cannot do this: browsers have no raw
multicast sockets, so the Devices screen shows an explanatory note there.

## Discovery

`modules/dlna` is a local Expo module (Kotlin, no npm dependency):

- sends an SSDP `M-SEARCH` to `239.255.255.250:1900` for
  `urn:schemas-upnp-org:device:MediaRenderer:1`, repeating once a second for
  the scan window (1–8 s, default 3.5 s);
- holds a `WifiManager.MulticastLock` while scanning;
- fetches each `LOCATION` description over HTTP and extracts `friendlyName`,
  `UDN`, `manufacturer`, `modelName` and the `AVTransport` /
  `RenderingControl` `controlURL`s;
- resolves relative control URLs against the description URL and discards
  devices without AVTransport.

`src/adapters/native/dlna.native.ts` wraps the module; the web adapter returns
`[]`. The Devices screen auto-scans on open (20 s cache) and exposes a manual
rescan.

## Playback

`src/core/dlna/control.ts` is a pure TS SOAP client:

- `SetAVTransportURI` with DIDL-Lite metadata, then `Play`;
- `Pause`, `Stop`, `Seek`, `GetTransportInfo`, `GetPositionInfo`;
- `SetVolume` through RenderingControl when the renderer exposes it.

The player store keeps its queue model authoritative while casting:

- `castTo(renderer)` pauses the local engine and sends the current track;
- a 1 s poll updates status/position/duration; end-of-track advances the queue;
- play/pause/next/previous/seek/volume route to the renderer while a cast
  target is active;
- `stopCast()` stops the renderer and reloads the current track locally at the
  last known position.

## Security and limits

- The stream URL sent to a renderer contains the same Subsonic API key /
  token+salt as local playback. Only cast to devices you trust on your own
  network; the URL is never logged (SOAP errors carry the action and status
  only).
- A renderer must be able to reach the Navidrome URL. `file://` downloads are
  never sent; casting uses the remote stream URL and needs a network.
- The renderer must support the stream format selected in Settings. If a device
  stays silent with `Original`/FLAC, set Streaming quality to MP3 and cast again.
- Some renderers expect their own app for queue management; Laila sends one
  track at a time and advances explicitly.
- The Android media notification follows the local engine (paused while
  casting), not the renderer.
- Cast state is in-memory; restarting the app does not stop a renderer that is
  already playing.
- A real DLNA speaker/TV pass is still pending; the web path is a no-op.
