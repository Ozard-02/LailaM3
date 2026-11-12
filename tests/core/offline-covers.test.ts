import { describe, expect, it, vi } from 'vitest';
import {
  addCollection,
  addDownloadedTrack,
  addDownloadedTracks,
  coverStillUsed,
  emptyOfflineIndex,
  planEviction,
  usedCovers,
} from '@/core/offline';

const track = (id: string, coverArt?: string) => ({ id, title: `Track ${id}`, coverArt });

describe('usedCovers', () => {
  it('collects covers from tracks and collections', () => {
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a', 'cover-a'), 'file:///a.flac', 1, 'flac');
    index = addDownloadedTrack(index, track('b', 'cover-b'), 'file:///b.flac', 1, 'flac');
    index = addCollection(index, {
      id: 'c',
      type: 'album',
      name: 'C',
      trackIds: ['a'],
      coverArt: 'cover-c',
    });

    const used = usedCovers(index);
    expect(used.has('cover-a')).toBe(true);
    expect(used.has('cover-b')).toBe(true);
    expect(used.has('cover-c')).toBe(true);
    expect(coverStillUsed(index, 'cover-b')).toBe(true);
    expect(coverStillUsed(index, 'cover-missing')).toBe(false);
  });
});

describe('addDownloadedTracks', () => {
  it('inserts a whole batch in one copy', () => {
    let index = emptyOfflineIndex();
    const before = index.tracks;
    index = addDownloadedTracks(index, [
      { track: track('a'), fileUri: 'file:///a.flac', size: 10, extension: 'flac' },
      { track: track('b'), fileUri: 'file:///b.flac', size: 20, extension: 'flac' },
    ]);
    expect(index.tracks).not.toBe(before);
    expect(index.tracks.a?.size).toBe(10);
    expect(index.tracks.b?.size).toBe(20);
    expect(addDownloadedTracks(index, [])).toBe(index);
  });
});

describe('planEviction', () => {
  it('drops the oldest downloads until the index fits the budget', () => {
    let now = 1_000;
    const random = vi.spyOn(Date, 'now').mockImplementation(() => (now += 1_000));
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 500, 'flac');
    index = addDownloadedTrack(index, track('b'), 'file:///b.flac', 500, 'flac');
    index = addDownloadedTrack(index, track('c'), 'file:///c.flac', 500, 'flac');
    random.mockRestore();

    expect(planEviction(index, 1_200).trackIds).toEqual(['a']);
    expect(planEviction(index, 900).trackIds).toEqual(['a', 'b']);
    expect(planEviction(index, 10_000).trackIds).toEqual([]);
  });

  it('never evicts tracks in the current queue', () => {
    let now = 1_000;
    const random = vi.spyOn(Date, 'now').mockImplementation(() => (now += 1_000));
    let index = emptyOfflineIndex();
    index = addDownloadedTrack(index, track('a'), 'file:///a.flac', 500, 'flac');
    index = addDownloadedTrack(index, track('b'), 'file:///b.flac', 500, 'flac');
    random.mockRestore();

    const plan = planEviction(index, 100, new Set(['a']));
    expect(plan.trackIds).toEqual(['b']);
  });
});
