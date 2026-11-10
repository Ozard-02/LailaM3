import { describe, expect, it } from 'vitest';
import type { Track } from '@/core/models';
import { fromSegueState, toSegueState } from '@/core/segue/state';
import type { QueueState } from '@/core/queue/reducer';

function track(id: string): Track {
  return { id, title: `Track ${id}`, artist: 'Artist', album: 'Album', duration: 120 };
}

const queue: QueueState = {
  queue: [track('a'), track('b'), track('c')],
  index: 1,
  upNext: [],
  originalQueue: [track('b'), track('c'), track('a')],
  repeat: 'all',
  shuffle: true,
};

describe('segue state mapping', () => {
  it('maps a queue to a Segue player state with order', () => {
    const state = toSegueState(queue, 'playing', 42.5, 0.8);
    expect(state.status).toBe('playing');
    expect(state.positionMs).toBe(42500);
    expect(state.index).toBe(1);
    expect(state.volume).toBe(80);
    expect(state.repeat).toBe('all');
    expect(state.shuffle).toBe(true);
    expect(state.queue?.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(state.order).toEqual([2, 0, 1]);
    expect(state.queue?.[0]?.durationMs).toBe(120000);
  });

  it('maps stopped and paused states', () => {
    expect(toSegueState({ ...queue, queue: [], index: -1 }, 'idle', 0, 1).status).toBe('stopped');
    // A real stop keeps the queue but reports stopped, not paused.
    expect(toSegueState(queue, 'idle', 0, 1).status).toBe('stopped');
    expect(toSegueState(queue, 'paused', 1, 1).status).toBe('paused');
  });

  it('keeps coverArt through queue mapping', () => {
    const state = toSegueState(
      { ...queue, queue: [{ ...track('a'), coverArt: 'cover-a' }], index: 0 },
      'playing',
      0,
      1,
    );
    expect(state.queue?.[0]?.coverArt).toBe('cover-a');
    const transfer = fromSegueState({
      status: 'playing',
      positionMs: 0,
      index: 0,
      queue: [{ id: 'a', title: 'A', coverArt: 'cover-a' }],
    });
    expect(transfer.tracks[0]?.coverArt).toBe('cover-a');
  });

  it('restores a transfer and drops items without ids', () => {
    const transfer = fromSegueState({
      status: 'paused',
      positionMs: 5000,
      index: 2,
      repeat: 'one',
      shuffle: false,
      queue: [
        { id: 'a', title: 'A' },
        { title: 'No id' },
        { id: 'c', title: 'C' },
      ],
    });
    expect(transfer.tracks.map((item) => item.id)).toEqual(['a', 'c']);
    expect(transfer.index).toBe(1);
    expect(transfer.dropped).toBe(1);
    expect(transfer.repeat).toBe('one');
    expect(transfer.shuffle).toBe(false);
    expect(transfer.positionMs).toBe(5000);
  });

  it('rebuilds the unshuffled order from order', () => {
    const transfer = fromSegueState({
      status: 'playing',
      positionMs: 0,
      index: 0,
      repeat: 'off',
      shuffle: true,
      queue: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
      order: [2, 0, 1],
    });
    expect(transfer.originalQueue?.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });
});
