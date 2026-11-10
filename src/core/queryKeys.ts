import type { AlbumListType, ServerConfig } from './models';
import { serverKey as serverKeyFor } from './servers/switch';

export function serverKey(server: ServerConfig | null): string {
  return server ? serverKeyFor(server) : 'none';
}

export const queryKeys = {
  albums: (server: ServerConfig | null, type: AlbumListType, size: number) =>
    ['albums', serverKey(server), type, size] as const,
  /** Prefix for invalidating every page size of one album list type. */
  albumList: (server: ServerConfig | null, type: AlbumListType) =>
    ['albums', serverKey(server), type] as const,
  albumPages: (server: ServerConfig | null, type: AlbumListType, size: number) =>
    ['album-pages', serverKey(server), type, size] as const,
  album: (server: ServerConfig | null, id: string | undefined) =>
    ['album', serverKey(server), id] as const,
  artists: (server: ServerConfig | null) => ['artists', serverKey(server)] as const,
  artist: (server: ServerConfig | null, id: string | undefined) =>
    ['artist', serverKey(server), id] as const,
  starred: (server: ServerConfig | null) => ['starred', serverKey(server)] as const,
  playlists: (server: ServerConfig | null) => ['playlists', serverKey(server)] as const,
  /** Prefix for invalidating every playlist list. */
  playlistsRoot: ['playlists'] as const,
  playlist: (server: ServerConfig | null, id: string | undefined) =>
    ['playlist', serverKey(server), id] as const,
  /** Prefix for invalidating every playlist detail and membership query. */
  playlistRoot: ['playlist'] as const,
  playlistMembershipRoot: ['playlist-membership'] as const,
  playlistMembership: (
    server: ServerConfig | null,
    playlistIds: string[],
    trackIds: string[],
  ) => ['playlist-membership', serverKey(server), playlistIds.join('|'), trackIds.join('|')] as const,
  lyrics: (server: ServerConfig | null, trackId: string | undefined) =>
    ['lyrics', serverKey(server), trackId] as const,
  genres: (server: ServerConfig | null) => ['genres', serverKey(server)] as const,
  genreSongs: (server: ServerConfig | null, genre: string | undefined) =>
    ['genre-songs', serverKey(server), genre] as const,
  search: (server: ServerConfig | null, query: string) =>
    ['search', serverKey(server), query] as const,
};
