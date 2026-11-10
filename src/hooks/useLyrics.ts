import { useQuery } from '@tanstack/react-query';
import type { Lyrics } from '@/core/lyrics/lrc';
import { queryKeys } from '@/core/queryKeys';
import { getLyrics, getLyricsBySongId } from '@/core/subsonic/client';
import { useAuthStore } from '@/stores/auth';
import { useCurrentTrack } from '@/stores/player';

export function useLyrics() {
  const server = useAuthStore((state) => state.server);
  const track = useCurrentTrack();

  return useQuery<Lyrics | null>({
    queryKey: queryKeys.lyrics(server, track?.id),
    enabled: Boolean(server && track),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (!server || !track) return null;
      try {
        const byId = await getLyricsBySongId(server, track.id);
        if (byId) return byId;
      } catch {
        // Fall back to the legacy endpoint; many servers only implement one.
      }
      if (!track.artist) return null;
      try {
        return await getLyrics(server, track.artist, track.title);
      } catch {
        return null;
      }
    },
  });
}
