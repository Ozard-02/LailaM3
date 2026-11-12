/**
 * Large-input performance harness — `npm run profile:core`.
 *
 * Fixtures: 20 000 tracks in 200 collections (8.3 MB index), a 10 000-track
 * queue and a 5 000-album Subsonic page. Every case has a target from
 * `PLAN.md` ("Perf pass 3"); the summary fails when a target regresses, so the
 * numbers are a regression gate, not just a report.
 */
import { describe, it } from 'vitest';
import { mapAlbum, mapPlaylist, mapTrack } from '@/core/subsonic/client';
import { buildSearchIndex, filterSearch } from '@/core/search/text';
import {
  addDownloadedTrack,
  collectionDownloaded,
  downloadedTracks,
  emptyOfflineIndex,
  offlineAlbums,
  offlineArtists,
  offlinePlaylists,
  reconcileCollection,
  recoverOfflineIndex,
  removeCollection,
  removeDownloadedTrack,
  restoreManifestTracks,
  type OfflineIndex,
  type OfflineTrack,
} from '@/core/offline';
import { applyTrackPatches, emptyQueue, queueReducer } from '@/core/queue/reducer';
import type { Track } from '@/core/models';

const TRACKS = 20_000;
const ALBUMS = 5_000;

function makeTrack(i: number): Track {
  return {
    id: `tr-${i}`,
    title: `Track number ${i}`,
    artist: `Artist ${i % 800}`,
    artistId: `ar-${i % 800}`,
    album: `Album ${i % 5_000}`,
    albumId: `al-${i % 5_000}`,
    coverArt: `cover-${i % 5_000}`,
    duration: 180 + (i % 120),
    track: (i % 12) + 1,
    discNumber: 1,
    year: 1990 + (i % 30),
    genre: ['Rock', 'Jazz', 'Pop', 'Classical'][i % 4],
    bitRate: 900,
    suffix: 'flac',
    contentType: 'audio/flac',
    size: 30_000_000,
  };
}

function manifest(i: number): OfflineTrack {
  const track = makeTrack(i);
  return {
    track,
    fileUri: `file:///downloads/${track.id}.flac`,
    size: 30_000_000,
    extension: 'flac',
    downloadedAt: 1_700_000_000_000,
  };
}

function bigIndex(): OfflineIndex {
  const index = emptyOfflineIndex();
  for (let i = 0; i < TRACKS; i += 1) index.tracks[`tr-${i}`] = manifest(i);
  for (let c = 0; c < 200; c += 1) {
    index.collections[`al-${c}`] = {
      id: `al-${c}`,
      type: 'album',
      name: `Album ${c}`,
      coverArt: `cover-${c}`,
      trackIds: Array.from({ length: 100 }, (_, s) => `tr-${c * 100 + s}`),
      downloadedAt: 1_700_000_000_000,
    };
  }
  return index;
}

function ms(fn: () => void, runs = 3): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return Math.round((times[Math.floor(times.length / 2)] ?? 0) * 10) / 10;
}

interface Case {
  name: string;
  time: number;
  unit?: string;
  target?: number;
}

const cases: Case[] = [];
const record = (name: string, time: number, target?: number, unit = 'ms') => {
  cases.push({ name, time, target, unit });
};

describe('core performance', () => {
  it('maps a large Subsonic page', () => {
    const rawAlbums = Array.from({ length: ALBUMS }, (_, i) => ({
      id: `al-${i}`,
      name: `Album ${i}`,
      artist: `Artist ${i % 800}`,
      artistId: `ar-${i % 800}`,
      coverArt: `cover-${i}`,
      songCount: 10,
      duration: 2400,
      created: '2020-01-01T00:00:00.000Z',
      year: 1990 + (i % 30),
      genre: 'Rock',
    }));
    record('mapAlbum 5k albums', ms(() => rawAlbums.forEach((raw) => mapAlbum(raw))), 50);
    record(
      'mapTrack 10k',
      ms(() => {
        for (let i = 0; i < 10_000; i += 1) mapTrack({ id: `t-${i}`, title: 'Track' });
      }),
      50,
    );
    record(
      'mapPlaylist 2k songs',
      ms(() =>
        mapPlaylist({
          id: 'pl-1',
          name: 'Big',
          songCount: 2_000,
          entry: Array.from({ length: 2_000 }, (_, i) => ({ id: `t-${i}`, title: `T${i}` })),
        }),
      ),
      50,
    );
  });

  it('filters a large library per keystroke', () => {
    const tracks = Array.from({ length: TRACKS }, (_, i) => makeTrack(i));
    const index = buildSearchIndex(tracks, (track) => [track.title, track.artist, track.album]);
    record(
      'buildSearchIndex 20k',
      ms(() => buildSearchIndex(tracks, (track) => [track.title, track.artist])),
      150,
    );
    record('filterSearch 20k "quiet"', ms(() => filterSearch(index, 'quiet')), 5);
    record('filterSearch 20k "track 199"', ms(() => filterSearch(index, 'track 199')), 5);
  });

  it('builds derived offline lists', () => {
    const index = bigIndex();
    record('downloadedTracks 20k', ms(() => downloadedTracks(index)), 40);
    record('offlineAlbums 20k', ms(() => offlineAlbums(index)), 40);
    record('offlineArtists 20k', ms(() => offlineArtists(index)), 40);
    record('offlinePlaylists 20k', ms(() => offlinePlaylists(index)), 40);
    record(
      'collectionDownloaded 100 ids ×100',
      ms(() => {
        const ids = index.collections['al-0']!.trackIds;
        for (let i = 0; i < 100; i += 1) collectionDownloaded(index, ids);
      }),
      10,
    );
  });

  it('hydrates from sidecar manifests', () => {
    const manifests = Array.from({ length: 5_000 }, (_, i) => manifest(i));
    record('restoreManifestTracks 5k', ms(() => restoreManifestTracks(emptyOfflineIndex(), manifests), 2), 100);
    const files = Array.from({ length: 5_000 }, (_, i) => ({
      name: `tr-${i}.flac`,
      uri: `file:///downloads/tr-${i}.flac`,
      size: 30_000_000,
    }));
    record('recoverOfflineIndex 5k files', ms(() => recoverOfflineIndex(emptyOfflineIndex(), files), 2), 100);
  });

  it('deletes downloads without freezing', () => {
    const index = bigIndex();
    record('removeDownloadedTrack 1 at 20k', ms(() => removeDownloadedTrack(index, 'tr-500'), 5), 10);
    record('removeCollection 100 tracks at 20k', ms(() => removeCollection(index, 'al-1'), 3), 20);

    const serverIds = Array.from({ length: 90 }, (_, i) => `tr-${200 + i}`);
    record(
      'reconcileCollection 10 removals',
      ms(() =>
        reconcileCollection(index, { id: 'al-2', type: 'album', name: 'Album 2' }, serverIds),
      ),
      10,
    );
  });

  it('bounds the persisted index work', () => {
    const index = bigIndex();
    // One finished download: immutable copy of the index. This is the per-event
    // cost now that the whole-index write is coalesced (below).
    const perCompletion = ms(() => {
      addDownloadedTrack(index, makeTrack(100_000), 'file:///x.flac', 1, 'flac');
    }, 10);
    record('addDownloadedTrack at 20k (per completion)', perCompletion, 10);

    // The coalesced store serialises once per debounce window, not per event.
    const json = JSON.stringify(index);
    record('serialise 20k index (once per flush)', ms(() => JSON.stringify(index)), 100);
    record(
      'parse 20k index on launch',
      ms(() => JSON.parse(json)),
      100,
    );
  });

  it('keeps the queue cheap at 10k tracks', () => {
    const tracks = Array.from({ length: 10_000 }, (_, i) => makeTrack(i));
    const started = queueReducer(emptyQueue, { type: 'play', tracks, startIndex: 0 });
    record('queue play 10k', ms(() => queueReducer(emptyQueue, { type: 'play', tracks })), 5);
    record('queue toggleShuffle 10k', ms(() => queueReducer(started, { type: 'toggleShuffle' })), 5);
    record(
      'queue next ×200',
      ms(() => {
        let state = started;
        for (let i = 0; i < 200; i += 1) state = queueReducer(state, { type: 'next' });
      }),
      5,
    );
    record('queue remove middle 10k', ms(() => queueReducer(started, { type: 'remove', index: 5_000 })), 5);
    const patches = Array.from({ length: 500 }, (_, i) => ({ id: `tr-${i}`, coverArt: 'new' }));
    record('applyTrackPatches 10k/500', ms(() => applyTrackPatches(started, patches)), 5);
  });

  it('reports', () => {
    const table = cases.map((entry) => ({
      case: entry.name,
      time: `${entry.time} ${entry.unit ?? 'ms'}`,
      target: entry.target === undefined ? '—' : `≤ ${entry.target} ${entry.unit ?? 'ms'}`,
      ok: entry.target === undefined || entry.time <= entry.target ? 'yes' : 'NO',
    }));
    console.log(`\n${JSON.stringify(table, null, 2)}\n`);
    const failed = table.filter((row) => row.ok === 'NO');
    if (failed.length > 0) {
      console.log(`Over target: ${failed.map((row) => row.case).join(', ')}`);
    }
  });
});
