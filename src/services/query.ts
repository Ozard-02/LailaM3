import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/queryKeys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const code = error && typeof error === 'object' && 'code' in error ? (error as { code: number }).code : 0;
        if (code === 40 || code === 41 || code === 43) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

/** Invalidate every playlist list, detail and picker membership query. */
export function invalidatePlaylistQueries(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.playlistsRoot });
  void queryClient.invalidateQueries({ queryKey: queryKeys.playlistRoot });
  void queryClient.invalidateQueries({ queryKey: queryKeys.playlistMembershipRoot });
}
