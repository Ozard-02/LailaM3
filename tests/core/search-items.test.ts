import { describe, expect, it } from 'vitest';
import { buildSearchItems, chunk, searchItemKey } from '@/utils/searchItems';

const album = (id: string) => ({ id, name: `Album ${id}`, artist: 'Artist' });
const artist = (id: string) => ({ id, name: `Artist ${id}` });
const playlist = (id: string) => ({ id, name: `Playlist ${id}` });
const genre = (name: string) => ({ name });
const track = (id: string) => ({ id, title: `Track ${id}` });

describe('chunk', () => {
  it('splits into rows of the requested width', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('buildSearchItems', () => {
  it('builds sections and chunks grids by column count', () => {
    const items = buildSearchItems({
      songs: [track('t1')],
      albums: [album('a1'), album('a2'), album('a3')],
      artists: [artist('ar1')],
      playlists: [playlist('p1'), playlist('p2')],
      genres: [genre('Rock')],
      albumColumns: 2,
      playlistColumns: 2,
    });

    expect(items.map((item) => item.kind)).toEqual([
      'section',
      'song',
      'section',
      'albumRow',
      'albumRow',
      'section',
      'artist',
      'section',
      'playlistRow',
      'section',
      'genres',
    ]);
    const albumRows = items.filter((item) => item.kind === 'albumRow');
    expect(albumRows).toHaveLength(2);
    expect(albumRows[0]?.kind === 'albumRow' && albumRows[0].albums).toHaveLength(2);
    expect(albumRows[1]?.kind === 'albumRow' && albumRows[1].albums).toHaveLength(1);
  });

  it('returns no rows for empty data', () => {
    expect(
      buildSearchItems({
        songs: [],
        albums: [],
        artists: [],
        playlists: [],
        genres: [],
        albumColumns: 3,
        playlistColumns: 3,
      }),
    ).toEqual([]);
  });

  it('produces stable unique keys', () => {
    const items = buildSearchItems({
      songs: [track('t1')],
      albums: [album('a1')],
      artists: [artist('ar1')],
      playlists: [playlist('p1')],
      genres: [genre('Rock')],
      albumColumns: 2,
      playlistColumns: 2,
    });
    const keys = items.map(searchItemKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
