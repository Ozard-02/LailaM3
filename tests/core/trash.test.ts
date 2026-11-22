import { describe, expect, it } from 'vitest';
import type { ServerConfig, Track } from '@/core/models';
import type { QueueState } from '@/core/queue/reducer';
import {
  createTrashAlbumUndo,
  createTrashUndo,
  removeTracksEverywhere,
  removeTrackEverywhere,
  restoreTracksEverywhere,
  restoreTrackEverywhere,
} from '@/core/trash';

function track(id: string): Track {
  return { id, title: `Track ${id}`, artist: 'Artist', album: 'Album' };
}

const server: ServerConfig = {
  url: 'https://music.example.test',
  username: 'laila',
  authMode: 'apiKey',
  apiKey: 'test',
  headers: {},
};

const state: QueueState = {
  queue: [track('a'), track('b'), track('c'), track('c'), track('d')],
  index: 2,
  upNext: [track('c'), track('e')],
  originalQueue: [track('a'), track('b'), track('c'), track('d')],
  repeat: 'off',
  shuffle: true,
};

describe('trash queue helpers', () => {
  it('captures every position before removing a track', () => {
    const undo = createTrashUndo(state, track('c'), server, 'trash');
    expect(undo.queuePositions).toEqual([2, 3]);
    expect(undo.upNextPositions).toEqual([0]);
    expect(undo.originalQueuePositions).toEqual([2]);
  });

  it('removes every occurrence and keeps the current track', () => {
    const afterNext: QueueState = { ...state, index: 4 };
    const removed = removeTrackEverywhere(afterNext, 'c');
    expect(removed.queue.map((item) => item.id)).toEqual(['a', 'b', 'd']);
    expect(removed.upNext.map((item) => item.id)).toEqual(['e']);
    expect(removed.originalQueue?.map((item) => item.id)).toEqual(['a', 'b', 'd']);
    expect(removed.index).toBe(2);
  });

  it('restores all occurrences without changing the current track', () => {
    const undo = createTrashUndo(state, track('c'), server, 'trash');
    const afterNext: QueueState = { ...state, index: 4 };
    const removed = removeTrackEverywhere(afterNext, 'c');
    const restored = restoreTrackEverywhere(removed, undo);

    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b', 'c', 'c', 'd']);
    expect(restored.upNext.map((item) => item.id)).toEqual(['c', 'e']);
    expect(restored.originalQueue?.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(restored.index).toBe(4);
    expect(restored.queue[restored.index]?.id).toBe('d');
  });

  it('restores an ended queue as ended', () => {
    const before: QueueState = { ...state, queue: [track('a')], index: 1, upNext: [] };
    const undo = createTrashUndo(
      { ...before, queue: [track('a'), track('b')], index: 1 },
      track('b'),
      server,
      'trash',
    );
    const removed = removeTrackEverywhere(before, 'b');
    const restored = restoreTrackEverywhere(removed, undo);
    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b']);
    expect(restored.index).toBe(2);
  });

  it('does not recreate an original queue that is currently disabled', () => {
    const undo = createTrashUndo(state, track('a'), server, 'trash');
    const removed = removeTrackEverywhere({ ...state, originalQueue: null }, 'a');
    const restored = restoreTrackEverywhere(removed, undo);
    expect(restored.originalQueue).toBeNull();
    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b', 'c', 'c', 'd']);
  });

  it('captures an album snapshot and marks which tracks were actually added', () => {
    const undo = createTrashAlbumUndo(
      state,
      'Album',
      [track('c'), track('b')],
      server,
      'trash',
      new Set(['c']),
    );
    expect(undo.albumName).toBe('Album');
    expect(undo.entries.map((entry) => entry.addedToPlaylist)).toEqual([true, false]);
    expect(undo.entries[0]?.queuePositions).toEqual([2, 3]);
  });

  it('removes an album in one pass and keeps the next surviving track', () => {
    const removed = removeTracksEverywhere(state, ['b', 'c']);
    expect(removed.queue.map((item) => item.id)).toEqual(['a', 'd']);
    expect(removed.upNext.map((item) => item.id)).toEqual(['e']);
    expect(removed.originalQueue?.map((item) => item.id)).toEqual(['a', 'd']);
    expect(removed.index).toBe(2);
  });

  it('restores an album with duplicates without changing the playing track', () => {
    const listening = { ...state, index: 0 };
    const undo = createTrashAlbumUndo(
      listening,
      'Album',
      [track('b'), track('c')],
      server,
      'trash',
      new Set(['b', 'c']),
    );
    const removed = removeTracksEverywhere(listening, ['b', 'c']);
    const restored = restoreTracksEverywhere(removed, undo);
    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b', 'c', 'c', 'd']);
    expect(restored.upNext.map((item) => item.id)).toEqual(['c', 'e']);
    expect(restored.originalQueue?.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(restored.index).toBe(0);
    expect(restored.queue[restored.index]?.id).toBe('a');
  });

  it('restores an album after the current track was removed', () => {
    const undo = createTrashAlbumUndo(
      state,
      'Album',
      [track('c')],
      server,
      'trash',
      new Set(['c']),
    );
    const removed = removeTracksEverywhere(state, ['c']);
    expect(removed.queue[removed.index]?.id).toBe('d');
    const restored = restoreTracksEverywhere(removed, undo);
    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b', 'c', 'c', 'd']);
    expect(restored.queue[restored.index]?.id).toBe('d');
  });

  it('restores a queue emptied by album trash with the first track selected', () => {
    const before: QueueState = {
      queue: [track('a'), track('b')],
      index: 0,
      upNext: [],
      originalQueue: null,
      repeat: 'off',
      shuffle: false,
    };
    const undo = createTrashAlbumUndo(
      before,
      'Album',
      [track('a'), track('b')],
      server,
      'trash',
      new Set(['a', 'b']),
    );
    const removed = removeTracksEverywhere(before, ['a', 'b']);
    expect(removed.index).toBe(-1);
    const restored = restoreTracksEverywhere(removed, undo);
    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b']);
    expect(restored.index).toBe(0);
  });

  it('keeps an ended album queue ended after restore', () => {
    const before: QueueState = {
      ...state,
      queue: [track('a'), track('b')],
      index: 2,
      upNext: [],
      originalQueue: null,
    };
    const undo = createTrashAlbumUndo(
      before,
      'Album',
      [track('b')],
      server,
      'trash',
      new Set(['b']),
    );
    const removed = removeTracksEverywhere(before, ['b']);
    const restored = restoreTracksEverywhere(removed, undo);
    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b']);
    expect(restored.index).toBe(2);
  });
});
