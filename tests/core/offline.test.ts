import { describe, expect, it } from 'vitest';
import {
  addCollection,
  addCover,
  addDownloadedTrack,
  collectionDownloaded,
  coverStillUsed,
  coverUri,
  emptyOfflineIndex,
  isDownloaded,
  localUri,
  mergeCollectionTracks,
  mergeRecoveredMetadata,
  nextDownloadedIndex,
  offlineAlbums,
  offlineArtists,
  offlineGenres,
  offlinePlaylists,
  offlineTracksByGenre,
  reconcileCollection,
  recoverOfflineIndex,
  restoreManifestTracks,
  removeCollection,
  removeCollectionTrack,
  removeDownloadedTrack,
  removeDownloadedTracks,
  downloadSizeError,
  estimateDownloadBytes,
} from '@/core/offline';

const track = (id: string) => ({ id, title: `Track ${id}` });

describe('offline index', () => {
  it('adds and removes downloaded tracks', () => {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 1234, 'flac');
    expect(isDownloaded(index, 'a')).toBe(true);
    expect(localUri(index, 'a')).toBe('file:///a.flac');

    index = removeDownloadedTrack(index, 'a');
    expect(isDownloaded(index, 'a')).toBe(false);
    expect(localUri(index, 'a')).toBeUndefined();
  });

  it('removes a track from collections when the file goes', () => {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 10, 'flac');
    index = addDownloadedTrack(index, track('b'), 'file:///b.flac', 10, 'flac');
    index = addCollection(index, {
      id: 'al-1',
      type: 'album',
      name: 'Album',
      trackIds: ['a', 'b'],
    });
    index = removeDownloadedTrack(index, 'a');
    expect(index.collections['al-1']?.trackIds).toEqual(['b']);
  });

  it('removes unused files when a collection is removed', () => {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 10, 'flac');
    index = addDownloadedTrack(index, track('b'), 'file:///b.flac', 10, 'flac');
    index = addCollection(index, {
      id: 'al-1',
      type: 'album',
      name: 'Album',
      trackIds: ['a'],
    });
    index = addCollection(index, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Playlist',
      trackIds: ['a', 'b'],
    });
    index = removeCollection(index, 'al-1');
    expect(isDownloaded(index, 'a')).toBe(true);

    index = removeCollection(index, 'pl-1');
    expect(isDownloaded(index, 'a')).toBe(false);
    expect(isDownloaded(index, 'b')).toBe(false);
  });

  it('keys downloads by track id, not by server address', () => {
    // the previous prototype's rule: a second URL for the same library must not hide downloads.
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('shared-song'), 'file:///shared.flac', 10, 'flac');
    expect(isDownloaded(index, 'shared-song')).toBe(true);
    // The index has no server field by design; switching URL keeps the same entry.
    expect(localUri(index, 'shared-song')).toBe('file:///shared.flac');
  });

  it('reports collection progress', () => {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 10, 'flac');
    expect(collectionDownloaded(index, [])).toBe(1);
    expect(collectionDownloaded(index, ['a'])).toBe(1);
    expect(collectionDownloaded(index, ['a', 'b'])).toBe(0.5);
  });
});

describe('download estimates and integrity', () => {
  it('estimates original and transcoded downloads', () => {
    const tracks = [
      { id: 'a', title: 'A', size: 1_000_000, duration: 60, bitRate: 1411 },
      { id: 'b', title: 'B', duration: 120 },
    ];
    expect(estimateDownloadBytes(tracks, 'original')).toBeUndefined();
    expect(
      estimateDownloadBytes([{ ...tracks[0]!, size: 1_000_000 }], 'original'),
    ).toBe(1_000_000);
    expect(estimateDownloadBytes([{ id: 'c', title: 'C', duration: 60 }], 'opus')).toBe(
      128 * 125 * 60,
    );
    expect(estimateDownloadBytes([{ id: 'd', title: 'D' }], 'mp3')).toBeUndefined();
  });

  it('accepts original files only at the declared size', () => {
    expect(downloadSizeError(1000, 1000, true)).toBeNull();
    expect(downloadSizeError(1000, 999, true)).toContain('incomplete');
    expect(downloadSizeError(undefined, 0, true)).toContain('empty');
    // Transcodes have a different size by design.
    expect(downloadSizeError(1000, 320_000, false)).toBeNull();
  });
});

describe('downloaded playlist reconciliation', () => {
  function sharedIndex() {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 10, 'flac');
    index = addDownloadedTrack(index, track('b'), 'file:///b.flac', 10, 'flac');
    index = addCollection(index, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Evening',
      trackIds: ['a', 'b'],
    });
    index = addCollection(index, {
      id: 'pl-2',
      type: 'playlist',
      name: 'Other',
      trackIds: ['b'],
    });
    return index;
  }

  it('replaces the collection, keeps shared tracks and flags only unused files', () => {
    const plan = reconcileCollection(
      sharedIndex(),
      { id: 'pl-1', type: 'playlist', name: 'Evening updated', coverArt: 'cover-9' },
      ['b', 'c'],
    );
    expect(plan).not.toBeNull();
    expect(plan?.index.collections['pl-1']?.trackIds).toEqual(['b', 'c']);
    expect(plan?.index.collections['pl-1']?.name).toBe('Evening updated');
    expect(plan?.index.collections['pl-1']?.coverArt).toBe('cover-9');
    expect(plan?.index.tracks.a).toBeUndefined();
    expect(plan?.index.tracks.b).toBeDefined();
    // b is still used by pl-2, so only a is removed.
    expect(plan?.removedTrackIds).toEqual(['a']);
    expect(plan?.deleteTrackIds).toEqual(['a']);
  });

  it('reports removed tracks that were never downloaded', () => {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 10, 'flac');
    index = addCollection(index, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Evening',
      trackIds: ['a', 'b'],
    });
    const plan = reconcileCollection(
      index,
      { id: 'pl-1', type: 'playlist', name: 'Evening' },
      ['a'],
    );
    expect(plan?.removedTrackIds).toEqual(['b']);
    expect(plan?.deleteTrackIds).toEqual([]);
    expect(plan?.index.tracks.a).toBeDefined();
  });

  it('deduplicates the server order and drops an empty collection', () => {
    let index = addDownloadedTrack(emptyOfflineIndex(), track('a'), 'file:///a.flac', 10, 'flac');
    index = addCollection(index, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Evening',
      trackIds: ['a'],
    });
    const deduped = reconcileCollection(
      index,
      { id: 'pl-1', type: 'playlist', name: 'Evening' },
      ['a', 'a'],
    );
    expect(deduped?.index.collections['pl-1']?.trackIds).toEqual(['a']);

    const empty = reconcileCollection(
      index,
      { id: 'pl-1', type: 'playlist', name: 'Evening' },
      [],
    );
    expect(empty?.index.collections['pl-1']).toBeUndefined();
    expect(empty?.index.tracks.a).toBeUndefined();
  });

  it('returns null for a collection that is not downloaded', () => {
    expect(
      reconcileCollection(emptyOfflineIndex(), {
        id: 'missing',
        type: 'playlist',
        name: 'Missing',
      }, ['a']),
    ).toBeNull();
  });
});

describe('offline library helpers', () => {
  const richTrack = (id: string, albumId: string, track: number, genre: string) => ({
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    artistId: 'ar-1',
    album: 'Album',
    albumId,
    coverArt: 'cover-1',
    track,
    genre,
    duration: 10,
  });

  function indexWithTracks() {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, richTrack('a', 'al-1', 1, 'Jazz'), 'file:///a.flac', 10, 'flac');
    index = addDownloadedTrack(index, richTrack('b', 'al-1', 2, 'Jazz'), 'file:///b.flac', 10, 'flac');
    index = addDownloadedTrack(index, richTrack('c', 'al-2', 1, 'Rock'), 'file:///c.flac', 10, 'flac');
    index = addCollection(index, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Favourites',
      trackIds: ['a', 'c'],
    });
    return index;
  }

  it('builds offline albums, artists, genres and playlists', () => {
    const index = indexWithTracks();
    expect(offlineAlbums(index).map((album) => album.id)).toEqual(['al-1', 'al-2']);
    expect(offlineAlbums(index)[0]?.songs?.map((track) => track.id)).toEqual(['a', 'b']);
    expect(offlineArtists(index)[0]?.albumCount).toBe(2);
    expect(offlineGenres(index).map((genre) => genre.name)).toEqual(['Jazz', 'Rock']);
    expect(offlinePlaylists(index)[0]?.songs?.map((track) => track.id)).toEqual(['a', 'c']);
    expect(offlineTracksByGenre(index, 'jazz').map((track) => track.id)).toEqual(['a', 'b']);
  });

  it('finds the next downloaded track, optionally wrapping', () => {
    const index = indexWithTracks();
    const tracks = [
      richTrack('a', 'al-1', 1, 'Jazz'),
      { ...richTrack('missing', 'al-2', 1, 'Rock') },
      richTrack('c', 'al-2', 1, 'Rock'),
    ];
    expect(nextDownloadedIndex(index, tracks, 0, false)).toBe(0);
    expect(nextDownloadedIndex(index, tracks, 1, false)).toBe(2);
    expect(nextDownloadedIndex(index, tracks, 2, false)).toBe(2);
    expect(nextDownloadedIndex(index, tracks, 2, true)).toBe(2);
    expect(nextDownloadedIndex(index, tracks, 3, false)).toBe(-1);
  });
});

describe('collection merging', () => {
  it('appends new tracks without duplicating existing ones', () => {
    let index = emptyOfflineIndex();
    index = addCollection(index, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Playlist',
      trackIds: ['a'],
    });
    index = mergeCollectionTracks(
      index,
      { id: 'pl-1', type: 'playlist', name: 'Playlist' },
      ['a', 'b', 'b'],
    );
    expect(index.collections['pl-1']?.trackIds).toEqual(['a', 'b']);
  });
});

describe('collection track removal', () => {
  it('removes a track from one collection and deletes the file only when unused', () => {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 10, 'flac');
    index = addCollection(index, {
      id: '__favourites',
      type: 'playlist',
      name: 'Favourited',
      trackIds: ['a'],
    });
    index = removeCollectionTrack(index, '__favourites', 'a');
    expect(index.collections['__favourites']).toBeUndefined();
    expect(isDownloaded(index, 'a')).toBe(false);

    let shared = emptyOfflineIndex();
    shared = addDownloadedTrack(shared, track('b'), 'file:///b.flac', 10, 'flac');
    shared = addCollection(shared, {
      id: '__favourites',
      type: 'playlist',
      name: 'Favourited',
      trackIds: ['b'],
    });
    shared = addCollection(shared, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Other',
      trackIds: ['b'],
    });
    shared = removeCollectionTrack(shared, '__favourites', 'b');
    expect(isDownloaded(shared, 'b')).toBe(true);
  });
});

describe('offline cover cache', () => {
  it('stores a local cover by coverArt id and reports whether it is still used', () => {
    let index = emptyOfflineIndex();
    index = addCover(index, 'cover-1', 'file:///cover-1.jpg', 1234);
    expect(coverUri(index, 'cover-1')).toBe('file:///cover-1.jpg');
    expect(coverUri(index, 'missing')).toBeUndefined();

    index = addDownloadedTrack(
      index,
      {
        id: 'a',
        title: 'A',
        coverArt: 'cover-1',
      },
      'file:///a.flac',
      10,
      'flac',
    );
    expect(coverStillUsed(index, 'cover-1')).toBe(true);
    index = removeDownloadedTrack(index, 'a');
    expect(coverStillUsed(index, 'cover-1')).toBe(false);
  });

  it('preserves a collection cover when appending tracks', () => {
    let index = emptyOfflineIndex();
    index = addCollection(index, {
      id: 'pl-1',
      type: 'playlist',
      name: 'Playlist',
      trackIds: ['a'],
      coverArt: 'cover-9',
    });
    index = mergeCollectionTracks(
      index,
      { id: 'pl-1', type: 'playlist', name: 'Playlist' },
      ['b'],
    );
    expect(index.collections['pl-1']?.coverArt).toBe('cover-9');
    expect(index.collections['pl-1']?.trackIds).toEqual(['a', 'b']);
  });
});

describe('offline recovery', () => {
  it('rebuilds playable entries from orphaned audio and cover files', () => {
    const index = recoverOfflineIndex(
      emptyOfflineIndex(),
      [
        { name: 'song-1.flac', uri: 'file:///song-1.flac', size: 10 },
        { name: 'weird name.mp3', uri: 'file:///weird name.mp3', size: 20 },
        { name: 'no-extension', uri: 'file:///no-extension', size: 1 },
      ],
      [{ name: 'cover-1.jpg', uri: 'file:///cover-1.jpg', size: 5 }],
    );

    expect(isDownloaded(index, 'song-1')).toBe(true);
    expect(localUri(index, 'song-1')).toBe('file:///song-1.flac');
    expect(index.tracks['song-1']?.extension).toBe('flac');
    expect(isDownloaded(index, 'weird name')).toBe(true);
    expect(isDownloaded(index, 'no-extension')).toBe(false);
    expect(coverUri(index, 'cover-1')).toBe('file:///cover-1.jpg');
  });
});

describe('offline manifests', () => {
  it('restores the original track id and metadata without overwriting newer entries', () => {
    const track = {
      id: 'artist/song:1',
      title: 'Original title',
      artist: 'Artist',
      album: 'Album',
      coverArt: 'cover-1',
    };
    const manifest = {
      track,
      fileUri: 'file:///artist_song_1.flac',
      size: 10,
      extension: 'flac',
      downloadedAt: 123,
    };

    let index = restoreManifestTracks(emptyOfflineIndex(), [manifest]);
    expect(isDownloaded(index, 'artist/song:1')).toBe(true);
    expect(index.tracks['artist/song:1']?.track.title).toBe('Original title');

    const newer = { ...manifest, track: { ...track, title: 'Newer server title' } };
    index = restoreManifestTracks(index, [newer]);
    expect(index.tracks['artist/song:1']?.track.title).toBe('Original title');
  });
});

describe('batch removal', () => {
  it('removes several tracks in one pass and keeps shared collections', () => {
    let index = emptyOfflineIndex();
    for (const id of ['a', 'b', 'c', 'd']) {
      index = addDownloadedTrack(index, track(id), `file:///${id}.flac`, 10, 'flac');
    }
    index = addCollection(index, { id: 'al-1', type: 'album', name: 'A', trackIds: ['a', 'b'] });
    index = addCollection(index, { id: 'pl-1', type: 'playlist', name: 'P', trackIds: ['a', 'c'] });

    const next = removeDownloadedTracks(index, ['a', 'b']);

    expect(isDownloaded(next, 'a')).toBe(false);
    expect(isDownloaded(next, 'b')).toBe(false);
    expect(isDownloaded(next, 'c')).toBe(true);
    expect(next.collections['al-1']).toBeUndefined();
    expect(next.collections['pl-1']?.trackIds).toEqual(['c']);
  });

  it('returns the same index when none of the ids exist', () => {
    const index = addDownloadedTrack(emptyOfflineIndex(), track('a'), 'file:///a.flac', 10, 'flac');
    expect(removeDownloadedTracks(index, [])).toBe(index);
    expect(removeDownloadedTracks(index, ['missing'])).toBe(index);
  });

  it('matches single removal semantics on a large index', () => {
    let index = emptyOfflineIndex();
    const ids = Array.from({ length: 500 }, (_, i) => `t-${i}`);
    for (const id of ids) {
      index = addDownloadedTrack(index, track(id), `file:///${id}.flac`, 10, 'flac');
    }
    index = addCollection(index, { id: 'big', type: 'playlist', name: 'Big', trackIds: ids });

    const removed = ids.slice(0, 200);
    const next = removeDownloadedTracks(index, removed);

    expect(Object.keys(next.tracks)).toHaveLength(300);
    expect(next.collections['big']?.trackIds).toHaveLength(300);
    expect(next.collections['big']?.trackIds).not.toContain(removed[0]);
  });
});

describe('recovered metadata', () => {
  const manifest = {
    track: {
      id: 'abc',
      title: 'Real title',
      artist: 'Artist',
      album: 'Album',
      albumId: 'al-1',
      coverArt: 'cover-1',
    },
    fileUri: 'file:///downloads/abc.flac',
    size: 10,
    extension: 'flac',
    downloadedAt: 1,
  };

  it('restores metadata from the sidecar for entries rebuilt from file names', () => {
    const recovered = recoverOfflineIndex(emptyOfflineIndex(), [
      { name: 'abc.flac', uri: 'file:///downloads/abc.flac', size: 10 },
    ]);
    expect(recovered.tracks.abc?.track.title).toBe('abc');

    const merged = mergeRecoveredMetadata(recovered, [manifest]);
    expect(merged.tracks.abc?.track).toMatchObject({
      id: 'abc',
      title: 'Real title',
      artist: 'Artist',
      albumId: 'al-1',
    });
    // The local file entry is preserved.
    expect(merged.tracks.abc?.fileUri).toBe('file:///downloads/abc.flac');
    expect(merged.tracks.abc?.size).toBe(10);
  });

  it('never overwrites an entry that came from the server', () => {
    const index = addDownloadedTrack(
      emptyOfflineIndex(),
      { id: 'abc', title: 'Newer server title', albumId: 'al-2' },
      'file:///downloads/abc.flac',
      10,
      'flac',
    );
    expect(mergeRecoveredMetadata(index, [manifest])).toBe(index);
  });

  it('leaves entries without a sidecar alone', () => {
    const recovered = recoverOfflineIndex(emptyOfflineIndex(), [
      { name: 'xyz.flac', uri: 'file:///downloads/xyz.flac', size: 10 },
    ]);
    expect(mergeRecoveredMetadata(recovered, [manifest])).toBe(recovered);
  });
});
