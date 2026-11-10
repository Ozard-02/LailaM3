import { describe, expect, it } from 'vitest';
import type { Track } from '@/core/models';
import {
  applyTrackPatches,
  currentTrack,
  emptyQueue,
  queueReducer,
  type QueueState,
} from '@/core/queue/reducer';

function track(id: string): Track {
  return { id, title: `Track ${id}` };
}

const tracks = [track('a'), track('b'), track('c'), track('d')];

function play(state: QueueState = emptyQueue, startIndex = 0): QueueState {
  return queueReducer(state, { type: 'play', tracks, startIndex });
}

describe('queue reducer', () => {
  it('plays a list and starts at the requested index', () => {
    const state = play(emptyQueue, 2);
    expect(state.queue.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(state.index).toBe(2);
    expect(currentTrack(state)?.id).toBe('c');
  });

  it('advances to the next track', () => {
    const state = queueReducer(play(), { type: 'next' });
    expect(currentTrack(state)?.id).toBe('b');
  });

  it('stops at the end when repeat is off', () => {
    const state = queueReducer(play(emptyQueue, 3), { type: 'next' });
    expect(state.index).toBe(4);
    expect(currentTrack(state)).toBeUndefined();
  });

  it('wraps around when repeat is all', () => {
    const first = queueReducer(play(emptyQueue, 3), { type: 'setRepeat', repeat: 'all' });
    const state = queueReducer(first, { type: 'next' });
    expect(state.index).toBe(0);
    expect(currentTrack(state)?.id).toBe('a');
  });

  it('stays on the same track when repeat is one and playback advances', () => {
    const first = queueReducer(play(emptyQueue, 2), { type: 'setRepeat', repeat: 'one' });
    const state = queueReducer(first, { type: 'advance' });
    expect(state.index).toBe(2);
  });

  it('manual next still advances when repeat is one', () => {
    const first = queueReducer(play(emptyQueue, 2), { type: 'setRepeat', repeat: 'one' });
    const state = queueReducer(first, { type: 'next' });
    expect(state.index).toBe(3);
  });

  it('goes to the previous track and wraps with repeat all', () => {
    expect(currentTrack(queueReducer(play(emptyQueue, 2), { type: 'previous' }))?.id).toBe('b');
    const wrapped = queueReducer(
      queueReducer(play(emptyQueue, 0), { type: 'setRepeat', repeat: 'all' }),
      { type: 'previous' },
    );
    expect(currentTrack(wrapped)?.id).toBe('d');
  });

  it('consumes upNext before the queue', () => {
    const queued = queueReducer(play(), { type: 'playNext', tracks: [track('x')] });
    const state = queueReducer(queued, { type: 'next' });
    expect(state.queue.map((item) => item.id)).toEqual(['a', 'x', 'b', 'c', 'd']);
    expect(currentTrack(state)?.id).toBe('x');
    expect(state.upNext).toHaveLength(0);
  });

  it('appends to the bottom of upNext', () => {
    const first = queueReducer(play(), { type: 'playNext', tracks: [track('x')] });
    const second = queueReducer(first, { type: 'playNext', tracks: [track('y')] });
    expect(second.upNext.map((item) => item.id)).toEqual(['x', 'y']);
    const state = queueReducer(second, { type: 'next' });
    expect(currentTrack(state)?.id).toBe('x');
  });

  it('removes a track and keeps the current track', () => {
    const state = queueReducer(play(emptyQueue, 2), { type: 'remove', index: 0 });
    expect(state.queue.map((item) => item.id)).toEqual(['b', 'c', 'd']);
    expect(currentTrack(state)?.id).toBe('c');
    expect(state.index).toBe(1);
  });

  it('moves a queued track to Up next without duplicating it', () => {
    const state = queueReducer(play(emptyQueue, 2), { type: 'moveToUpNext', index: 0 });
    expect(state.queue.map((item) => item.id)).toEqual(['b', 'c', 'd']);
    expect(state.index).toBe(1);
    expect(currentTrack(state)?.id).toBe('c');
    expect(state.upNext.map((item) => item.id)).toEqual(['a']);
  });

  it('keeps the current index when moving a track after it', () => {
    const state = queueReducer(play(emptyQueue, 1), { type: 'moveToUpNext', index: 3 });
    expect(state.queue.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(state.index).toBe(1);
    expect(state.upNext.map((item) => item.id)).toEqual(['d']);
  });

  it('does not move the currently playing track to Up next', () => {
    const before = play(emptyQueue, 2);
    const state = queueReducer(before, { type: 'moveToUpNext', index: 2 });
    expect(state).toBe(before);
  });

  it('moving the current track keeps it current', () => {
    const state = queueReducer(play(emptyQueue, 1), { type: 'move', from: 1, to: 3 });
    expect(state.queue.map((item) => item.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(currentTrack(state)?.id).toBe('b');
    expect(state.index).toBe(3);
  });

  it('shuffle keeps the current track and unshuffle restores order', () => {
    const base = play(emptyQueue, 2);
    const shuffled = queueReducer(base, { type: 'toggleShuffle' });
    expect(shuffled.shuffle).toBe(true);
    expect(currentTrack(shuffled)?.id).toBe('c');
    expect(shuffled.queue).toHaveLength(4);

    const restored = queueReducer(shuffled, { type: 'toggleShuffle' });
    expect(restored.shuffle).toBe(false);
    expect(restored.queue.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(currentTrack(restored)?.id).toBe('c');
  });

  it('reorders while keeping the current track', () => {
    const state = queueReducer(play(emptyQueue, 1), {
      type: 'reorder',
      queue: [track('d'), track('b'), track('a'), track('c')],
    });
    expect(state.queue.map((item) => item.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(currentTrack(state)?.id).toBe('b');
    expect(state.index).toBe(1);
  });

  it('enqueue appends and keeps the current index', () => {
    const state = queueReducer(play(emptyQueue, 1), { type: 'enqueue', tracks: [track('e')] });
    expect(state.queue.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(state.index).toBe(1);
  });

  it('clear empties the queue', () => {
    const state = queueReducer(play(), { type: 'clear' });
    expect(state.queue).toHaveLength(0);
    expect(state.index).toBe(-1);
  });
});

describe('queue metadata patches', () => {
  const shuffled: QueueState = {
    queue: [track('a'), track('b')],
    index: 1,
    upNext: [track('c')],
    originalQueue: [track('b'), track('a')],
    repeat: 'all',
    shuffle: true,
  };

  it('patches the shuffled queue, original order and up next', () => {
    const patched = applyTrackPatches(shuffled, [
      { id: 'a', coverArt: 'cover-a' },
      { id: 'b', coverArt: 'cover-b' },
      { id: 'c', coverArt: 'cover-c' },
    ]);

    expect(patched.queue.map((item) => item.coverArt)).toEqual(['cover-a', 'cover-b']);
    expect(patched.originalQueue?.map((item) => item.coverArt)).toEqual(['cover-b', 'cover-a']);
    expect(patched.upNext.map((item) => item.coverArt)).toEqual(['cover-c']);
    expect(patched.queue.map((item) => item.id)).toEqual(['a', 'b']);
    expect(patched.originalQueue?.map((item) => item.id)).toEqual(['b', 'a']);
    expect(patched.index).toBe(1);
    expect(patched.shuffle).toBe(true);
    expect(patched.repeat).toBe('all');
  });

  it('keeps metadata when unshuffling after hydration', () => {
    const patched = applyTrackPatches(shuffled, [
      { id: 'a', coverArt: 'cover-a' },
      { id: 'b', coverArt: 'cover-b' },
    ]);
    const restored = queueReducer(patched, { type: 'toggleShuffle' });
    expect(restored.shuffle).toBe(false);
    expect(restored.queue.map((item) => item.coverArt)).toEqual(['cover-b', 'cover-a']);
    expect(currentTrack(restored)?.coverArt).toBe('cover-b');
  });

  it('leaves an absent original queue alone', () => {
    const flat: QueueState = { ...emptyQueue, queue: [track('a')], index: 0 };
    const patched = applyTrackPatches(flat, [{ id: 'a', coverArt: 'cover-a' }]);
    expect(patched.originalQueue).toBeNull();
    expect(patched.queue[0]?.coverArt).toBe('cover-a');
  });

  it('returns the same state when nothing matches', () => {
    expect(applyTrackPatches(shuffled, [])).toBe(shuffled);
    expect(applyTrackPatches(shuffled, [{ id: 'missing', coverArt: 'cover-x' }])).toBe(shuffled);
  });

  it('patches duplicate ids in the queue', () => {
    const state: QueueState = {
      ...emptyQueue,
      queue: [track('a'), track('a')],
      index: 0,
    };
    const patched = applyTrackPatches(state, [{ id: 'a', coverArt: 'cover-a' }]);
    expect(patched.queue.map((item) => item.coverArt)).toEqual(['cover-a', 'cover-a']);
  });
});

describe('queue stress', () => {
  it('keeps a 600-track queue bounded through repeated navigation and edits', () => {
    const many = Array.from({ length: 600 }, (_, index) => track(`s-${index}`));
    let state = queueReducer(emptyQueue, { type: 'play', tracks: many, startIndex: 0 });
    for (let i = 0; i < 200; i += 1) {
      state = queueReducer(state, { type: 'next' });
    }
    expect(state.index).toBe(200);
    expect(state.queue).toHaveLength(600);

    state = queueReducer(state, { type: 'toggleShuffle' });
    expect(state.queue).toHaveLength(600);
    expect(currentTrack(state)?.id).toBe('s-200');
    state = queueReducer(state, { type: 'toggleShuffle' });
    expect(state.queue.map((item) => item.id)).toEqual(many.map((item) => item.id));

    state = queueReducer(state, { type: 'remove', index: 0 });
    expect(state.queue).toHaveLength(599);
    state = queueReducer(state, { type: 'enqueue', tracks: many.slice(0, 10) });
    expect(state.queue).toHaveLength(609);
    expect(state.upNext).toHaveLength(0);
  });
});
