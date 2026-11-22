import type { Track } from '@/core/models';
import { queryKeys, serverKey } from '@/core/queryKeys';
import { scrobble } from '@/core/subsonic/client';
import { logger } from '@/core/utils/logger';
import { queryClient } from '@/services/query';
import { useAuthStore } from '@/stores/auth';

/**
 * Server-qualified: track ids are local to one Navidrome instance, so a play
 * started on server A must never be scrobbled against server B after a switch.
 */
let lastPlay: { id: string; startedAt: number; server: string } | null = null;

export function clearLastPlay(): void {
  lastPlay = null;
}

export function submitScrobble(): void {
  const server = useAuthStore.getState().server;
  if (!server || !lastPlay) return;
  if (lastPlay.server !== serverKey(server)) {
    // The play belongs to a previous server; drop it instead of sending the
    // id somewhere it does not exist.
    lastPlay = null;
    return;
  }
  const elapsed = Date.now() - lastPlay.startedAt;
  if (elapsed < 30_000) return;
  const id = lastPlay.id;
  const startedAt = lastPlay.startedAt;
  lastPlay = null;
  void scrobble(server, id, {
    submission: true,
    // Subsonic/OpenSubsonic `time` is milliseconds since 1970. Sending seconds
    // made Navidrome treat every play as 1970 and never refresh its recent list.
    time: Math.floor(startedAt),
  })
    .then(() =>
      queryClient.invalidateQueries({ queryKey: queryKeys.albumList(server, 'recent') }),
    )
    .catch((error) => logger.debug('Scrobble failed', { error }));
}

export function markPlay(track: Track): void {
  submitScrobble();
  const server = useAuthStore.getState().server;
  lastPlay = server
    ? { id: track.id, startedAt: Date.now(), server: serverKey(server) }
    : null;
  if (server) {
    void scrobble(server, track.id, { submission: false }).catch((error) =>
      logger.debug('Now-playing report failed', { error }),
    );
  }
}
