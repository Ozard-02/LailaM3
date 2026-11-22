import { useCallback, useRef, useState } from 'react';
import type { Artist, ServerConfig, Track } from '@/core/models';
import { filterExcludedSongs } from '@/core/exclusions';
import { downloadedTracks } from '@/core/offline';
import { shuffled } from '@/core/queue/reducer';
import { getAlbum, getArtist, getTopSongs } from '@/core/subsonic/client';
import { queryKeys, serverKey } from '@/core/queryKeys';
import { logger } from '@/core/utils/logger';
import { loadShuffleExclusions } from '@/services/exclusions';
import { queryClient } from '@/services/query';
import { useAuthStore } from '@/stores/auth';
import { isOfflineNow, useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';

const TOP_SONGS_COUNT = 50;
const ALBUM_BATCH = 4;
/** Avoid two background appends racing after a double press / remount. */
const appendInFlight = new Set<string>();

async function fetchArtistTracks(
  server: ServerConfig,
  artist: Artist,
): Promise<Track[]> {
  let albums = artist.albums ?? [];
  if (albums.length === 0) {
    const full = await getArtist(server, artist.id);
    albums = full.albums ?? [];
  }

  const byId = new Map<string, Track>();
  for (let index = 0; index < albums.length; index += ALBUM_BATCH) {
    const batch = albums.slice(index, index + ALBUM_BATCH);
    const results = await Promise.allSettled(
      batch.map((album) =>
        album.songs?.length ? Promise.resolve(album) : getAlbum(server, album.id),
      ),
    );
    for (const result of results) {
      if (result.status !== 'fulfilled') {
        logger.warn('Could not load an artist album', { error: result.reason });
        continue;
      }
      for (const track of result.value.songs ?? []) {
        if (!byId.has(track.id)) byId.set(track.id, track);
      }
    }
  }
  return [...byId.values()];
}

function offlineArtistTracks(artist: Artist): Track[] {
  return downloadedTracks(useOfflineStore.getState().index).filter(
    (track) =>
      track.artistId === artist.id ||
      (track.artist && track.artist === artist.name),
  );
}

/**
 * Starts an artist-only shuffle immediately with the server's top songs, then
 * appends the rest of the discography in the background. The append is skipped
 * if the user has already started a different queue.
 */
export function useArtistShuffle() {
  const playTracks = usePlayerStore((state) => state.playTracks);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const showToast = useUIStore((state) => state.showToast);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const shuffleArtist = useCallback(
    async (artist: Artist) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (isOfflineNow()) {
          const tracks = offlineArtistTracks(artist);
          if (tracks.length === 0) {
            setError('No downloaded tracks for this artist.');
            return;
          }
          await playTracks(shuffled(tracks), 0);
          return;
        }

        const auth = useAuthStore.getState().server;
        if (!auth) {
          setError('Not signed in.');
          return;
        }

        const excluded = await loadShuffleExclusions(auth);
        let topSongs: Track[] = [];
        try {
          topSongs = await getTopSongs(auth, artist.name, { count: TOP_SONGS_COUNT });
        } catch (error) {
          logger.warn('Could not load top songs for the artist', { error });
        }

        const allowedTop = filterExcludedSongs(topSongs, excluded);
        if (allowedTop.length === 0) {
          // Servers without getTopSongs still get a working shuffle by
          // loading the complete discography before starting.
          const all = await queryClient.fetchQuery({
            queryKey: queryKeys.artistTracks(auth, artist.id),
            queryFn: () => fetchArtistTracks(auth, artist),
            staleTime: 10 * 60_000,
          });
          const allowed = filterExcludedSongs(all, excluded);
          if (allowed.length === 0) {
            setError('No tracks to shuffle for this artist.');
            return;
          }
          await playTracks(shuffled(allowed), 0);
          return;
        }

        const firstQueue = shuffled(allowedTop);
        const anchor = firstQueue[0]?.id;
        await playTracks(firstQueue, 0);

        const key = `${serverKey(auth)}:${artist.id}`;
        if (!anchor || appendInFlight.has(key)) return;
        appendInFlight.add(key);
        void (async () => {
          try {
            const all = await queryClient.fetchQuery({
              queryKey: queryKeys.artistTracks(auth, artist.id),
              queryFn: () => fetchArtistTracks(auth, artist),
              staleTime: 10 * 60_000,
            });
            const queued = usePlayerStore.getState().queueState;
            const known = new Set(
              [...queued.queue, ...queued.upNext].map((track) => track.id),
            );
            const rest = filterExcludedSongs(
              all.filter((track) => !known.has(track.id)),
              excluded,
            );
            if (rest.length === 0) return;

            // The user may have started another album or artist while the
            // albums were loading. Only append to the queue this shuffle
            // created.
            const latest = usePlayerStore.getState().queueState;
            if (latest.queue[0]?.id !== anchor) return;
            addToQueue(shuffled(rest), 'end');
            showToast({
              message: `Added ${rest.length} more tracks by ${artist.name}.`,
              tone: 'success',
            });
          } catch (error) {
            logger.warn('Could not append the rest of the artist', { error });
          } finally {
            appendInFlight.delete(key);
          }
        })();
      } catch (error) {
        logger.warn('Artist shuffle failed', { error });
        setError('Could not start this artist.');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [addToQueue, playTracks, showToast],
  );

  return { shuffleArtist, busy, error };
}
