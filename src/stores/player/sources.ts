import type { Track } from '@/core/models';
import { buildCoverUrl, buildStreamUrl } from '@/core/subsonic/params';
import { mimeForTrack, mimeForTranscode } from '@/core/subsonic/mime';
import { useAuthStore } from '@/stores/auth';
import { useOfflineStore } from '@/stores/offline';
import { useSettingsStore } from '@/stores/settings';

export function sourceFor(track: Track, options?: { remote?: boolean }) {
  const server = useAuthStore.getState().server;
  if (!server) throw new Error('Not signed in');
  const settings = useSettingsStore.getState();
  // A DLNA renderer cannot read the phone's file:// downloads.
  const downloaded = options?.remote ? undefined : useOfflineStore.getState().localUri(track.id);
  return {
    id: track.id,
    url:
      downloaded ??
      buildStreamUrl(server, track.id, {
        format: settings.quality,
        maxBitRate: settings.maxBitRate,
      }),
    headers: downloaded ? undefined : server.headers,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.coverArt ? buildCoverUrl(server, track.coverArt, 600) : undefined,
    artworkHeaders: server.headers,
    duration: track.duration,
    mimeType:
      settings.quality === 'raw'
        ? mimeForTrack(track)
        : mimeForTranscode(settings.quality),
  };
}
