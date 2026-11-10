import type { Track } from '@/core/models';
import { queryKeys } from '@/core/queryKeys';
import { scrobble } from '@/core/subsonic/client';
import { logger } from '@/core/utils/logger';
import { queryClient } from '@/services/query';
import { useAuthStore } from '@/stores/auth';

let lastPlay: { id: string; startedAt: number } | null = null;

export function submitScrobble(): void {
  const server = useAuthStore.getState().server;
  if (!server || !lastPlay) return;
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
  lastPlay = { id: track.id, startedAt: Date.now() };
  const server = useAuthStore.getState().server;
  if (server) {
    void scrobble(server, track.id, { submission: false }).catch((error) =>
      logger.debug('Now-playing report failed', { error }),
    );
  }
}
