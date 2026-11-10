import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { AlbumListType, ServerConfig } from '@/core/models';
import { queryKeys } from '@/core/queryKeys';
import {
  getAlbum,
  getStarred2,
  getAlbumList2,
  getArtist,
  getArtists,
  getPlaylist,
  getPlaylists,
  getGenres,
  getSongsByGenre,
  search3,
} from '@/core/subsonic/client';
import { useAuthStore } from '@/stores/auth';

function useServer(): ServerConfig {
  const server = useAuthStore((state) => state.server);
  if (!server) throw new Error('Not signed in');
  return server;
}

export function useAlbums(
  type: AlbumListType = 'newest',
  size = 30,
  options?: { refetchOnMount?: boolean | 'always' },
) {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.albums(server, type, size),
    queryFn: () => getAlbumList2(server as ServerConfig, type, { size }),
    enabled: Boolean(server),
    refetchOnMount: options?.refetchOnMount,
  });
}

export function useAlbumPages(
  type: AlbumListType = 'alphabeticalByName',
  size = 120,
  options?: { enabled?: boolean },
) {
  const server = useAuthStore((state) => state.server);
  return useInfiniteQuery({
    queryKey: queryKeys.albumPages(server, type, size),
    queryFn: ({ pageParam }) =>
      getAlbumList2(server as ServerConfig, type, { size, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === size ? allPages.length * size : undefined,
    enabled: Boolean(server) && (options?.enabled ?? true),
  });
}

export function useAlbum(id: string | undefined) {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.album(server, id),
    queryFn: () => getAlbum(server as ServerConfig, id as string),
    enabled: Boolean(server && id),
  });
}

export function useArtists(options?: { enabled?: boolean }) {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.artists(server),
    queryFn: () => getArtists(server as ServerConfig),
    enabled: Boolean(server) && (options?.enabled ?? true),
  });
}

export function useArtist(id: string | undefined) {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.artist(server, id),
    queryFn: () => getArtist(server as ServerConfig, id as string),
    enabled: Boolean(server && id),
  });
}

export function useStarred() {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.starred(server),
    queryFn: () => getStarred2(server as ServerConfig),
    enabled: Boolean(server),
  });
}

export function usePlaylists() {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.playlists(server),
    queryFn: () => getPlaylists(server as ServerConfig),
    enabled: Boolean(server),
  });
}

export function usePlaylist(id: string | undefined) {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.playlist(server, id),
    queryFn: () => getPlaylist(server as ServerConfig, id as string),
    enabled: Boolean(server && id),
  });
}

export function useGenres() {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.genres(server),
    queryFn: () => getGenres(server as ServerConfig),
    enabled: Boolean(server),
  });
}

export function useSongsByGenre(genre: string | undefined) {
  const server = useAuthStore((state) => state.server);
  return useQuery({
    queryKey: queryKeys.genreSongs(server, genre),
    queryFn: () => getSongsByGenre(server as ServerConfig, genre as string),
    enabled: Boolean(server && genre),
  });
}

export function useSearch(query: string) {
  const server = useAuthStore((state) => state.server);
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search(server, trimmed),
    queryFn: () => search3(server as ServerConfig, trimmed),
    enabled: Boolean(server && trimmed.length > 1),
    staleTime: 30_000,
  });
}

export { useServer };
