import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAudioEngine } from '@/adapters/native/audio.native';
import type { AudioSource, AutoAdvanceTransition } from '@/ports/audio';

const { fake } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const fake = {
    setup: vi.fn(async () => undefined),
    setQueue: vi.fn(async () => undefined),
    syncQueue: vi.fn(async () => undefined),
    removeQueueItem: vi.fn(async () => undefined),
    skipToIndex: vi.fn(async () => true),
    setRepeatMode: vi.fn(async () => undefined),
    setRemoteHandling: vi.fn(async () => undefined),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    seekTo: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    getSnapshot: vi.fn(() => ({
      state: 'ready' as const,
      playing: false,
      position: 0,
      duration: 0,
      buffered: 0,
      error: null,
    })),
    addListener: vi.fn((event: string, listener: (payload?: unknown) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    }),
    emit(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  };
  return { fake };
});

vi.mock('../../modules/laila-player', () => ({ lailaPlayer: fake }));

function source(id: string, duration = 180): AudioSource {
  return { id, url: `https://example.test/${id}`, title: id, duration };
}

describe('NativeAudioEngine auto-advance', () => {
  let engine: NativeAudioEngine;
  let decisions: AutoAdvanceTransition[];

  beforeEach(async () => {
    vi.clearAllMocks();
    decisions = [];
    engine = new NativeAudioEngine();
    engine.setAutoAdvanceHandler((transition) => {
      decisions.push(transition);
      return 'keep';
    });
    await engine.setQueue([source('a'), source('b')], 0);
  });

  it('passes the media id, native index and reason to the handler', () => {
    fake.emit('onAutoAdvance', { mediaId: 'b', index: 1, reason: 'auto' });
    expect(decisions).toEqual([{ mediaId: 'b', index: 1, reason: 'auto' }]);
    expect(fake.pause).not.toHaveBeenCalled();
  });

  it('derives the index when the native event omits it', () => {
    fake.emit('onAutoAdvance', { mediaId: 'b', reason: 'auto' });
    expect(decisions[0]).toMatchObject({ mediaId: 'b', index: 1, reason: 'auto' });
  });

  it('keeps repeat transitions on the same item without pausing', () => {
    fake.emit('onAutoAdvance', { mediaId: 'a', index: 0, reason: 'repeat' });
    expect(decisions[0]).toMatchObject({ mediaId: 'a', index: 0, reason: 'repeat' });
    expect(fake.pause).not.toHaveBeenCalled();
  });

  it('pauses the native player when the store takes over', () => {
    engine.setAutoAdvanceHandler(() => 'takeover');
    fake.emit('onAutoAdvance', { mediaId: 'other', index: 3, reason: 'auto' });
    expect(fake.pause).toHaveBeenCalledOnce();
  });
});

describe('NativeAudioEngine queue synchronization', () => {
  let engine: NativeAudioEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    engine = new NativeAudioEngine();
    await engine.setQueue([source('a')], 0);
  });

  it('mirrors Up Next by syncing the queue at the active index', async () => {
    await engine.syncQueue([source('a'), source('b'), source('c')], 0);
    expect(fake.syncQueue).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: 'a' }),
        expect.objectContaining({ id: 'b' }),
        expect.objectContaining({ id: 'c' }),
      ],
      0,
    );
    expect(fake.setQueue).toHaveBeenCalledTimes(1);
  });

  it('keeps the active index when a track before it is removed', async () => {
    await engine.syncQueue([source('b')], 0);
    expect(fake.syncQueue).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: 'b' })],
      0,
    );
  });

  it('clears the native queue when the store clears it', async () => {
    await engine.syncQueue([], -1);
    expect(fake.syncQueue).toHaveBeenLastCalledWith([], -1);
  });

  it('mirrors repeat mode onto the native player', async () => {
    await engine.setRepeatMode('one');
    await engine.setRepeatMode('off');
    expect(fake.setRepeatMode.mock.calls).toEqual([['one'], ['off']]);
  });

  it('reports whether the native skip matched the expected item', async () => {
    fake.skipToIndex.mockResolvedValueOnce(false);
    expect(await engine.skipToIndex(1, 'stale')).toBe(false);
    fake.skipToIndex.mockResolvedValueOnce(true);
    expect(await engine.skipToIndex(1, 'b')).toBe(true);
  });
});
