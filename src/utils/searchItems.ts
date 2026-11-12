import type { Album, Artist, Genre, Playlist, Track } from '@/core/models';

/** One row of the virtualised library search list. */
export type SearchItem =
  | { kind: 'section'; title: string }
  | { kind: 'song'; track: Track; index: number }
  | { kind: 'albumRow'; albums: Album[] }
  | { kind: 'artist'; artist: Artist }
  | { kind: 'playlistRow'; playlists: Playlist[] }
  | { kind: 'genres'; genres: Genre[] }
  | { kind: 'notice'; text: string }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'count'; count: number };

export interface SearchData {
  songs: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  genres: Genre[];
  /** Cards per album grid row. */
  albumColumns: number;
  /** Cards per playlist grid row. */
  playlistColumns: number;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const width = Math.max(1, Math.floor(size));
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += width) {
    rows.push(items.slice(index, index + width));
  }
  return rows;
}

/**
 * Flatten every search section into list rows. Grids are chunked by their
 * column count so a virtualised list can render them without mounting every
 * card. Genres stay in one row: they are pills and usually few.
 */
export function buildSearchItems(data: SearchData): SearchItem[] {
  const items: SearchItem[] = [];

  if (data.songs.length > 0) {
    items.push({ kind: 'section', title: 'Songs' });
    data.songs.forEach((track, index) => items.push({ kind: 'song', track, index }));
  }
  if (data.albums.length > 0) {
    items.push({ kind: 'section', title: 'Albums' });
    for (const albums of chunk(data.albums, data.albumColumns)) {
      items.push({ kind: 'albumRow', albums });
    }
  }
  if (data.artists.length > 0) {
    items.push({ kind: 'section', title: 'Artists' });
    for (const artist of data.artists) items.push({ kind: 'artist', artist });
  }
  if (data.playlists.length > 0) {
    items.push({ kind: 'section', title: 'Playlists' });
    for (const playlists of chunk(data.playlists, data.playlistColumns)) {
      items.push({ kind: 'playlistRow', playlists });
    }
  }
  if (data.genres.length > 0) {
    items.push({ kind: 'section', title: 'Genres' });
    items.push({ kind: 'genres', genres: data.genres });
  }

  return items;
}

export function searchItemKey(item: SearchItem): string {
  switch (item.kind) {
    case 'section':
      return `section:${item.title}`;
    case 'song':
      return `song:${item.track.id}`;
    case 'albumRow':
      return `albums:${item.albums[0]?.id ?? 'row'}`;
    case 'artist':
      return `artist:${item.artist.id}`;
    case 'playlistRow':
      return `playlists:${item.playlists[0]?.id ?? 'row'}`;
    case 'genres':
      return 'genres';
    default:
      return item.kind;
  }
}
