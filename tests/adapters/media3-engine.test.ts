import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAudioEngine } from '@/adapters/native/audio.native';

const { fake, state } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const fake = {
    setup: vi.fn(async () => undefined),
    setQueue: vi.fn(async () => undefined),
    syncQueue: vi.fn(async () => undefined),
    skipToIndex: vi.fn(async () => true),
    setRepeatMode: vi.fn(async () => undefined),
    setRemoteHandling: vi.fn(async () => undefined),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    getSnapshot: vi.fn(),
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
  return {
    fake,
    state: {
      raw: {
        state: 'idle' as 'idle' | 'buffering' | 'ready' | 'ended',
        playing: false,
        position: 0,
        duration: 0,
        buffered: 0,
        error: null as string | null,
      },
    },
  };
});

vi.mock('../../modules/laila-player', () => ({ lailaPlayer: fake }));

function source(id: string) {
  return {
    id,
    url: `https://example.test/${id}`,
    title: `Title ${id}`,
    artist: 'Artist',
    album: 'Album',
    artwork: `https://example.test/${id}.jpg`,
    headers: { Authorization: 'Bearer test' },
    duration: 120,
    mimeType: 'audio/flac',
  };
}

describe('media3 native adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.raw = {
      state: 'idle',
      playing: false,
      position: 0,
      duration: 0,
      buffered: 0,
      error: null,
    };
    fake.getSnapshot.mockImplementation(() => state.raw);
  });

  it('sets up once and maps sources with headers', async () => {
    const engine = new NativeAudioEngine();
    await engine.setQueue([source('a'), source('b')], 0);

    expect(fake.setup).toHaveBeenCalledOnce();
    expect(fake.setRemoteHandling).toHaveBeenCalledWith(true);
    expect(fake.setQueue).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'a',
          url: 'https://example.test/a',
          headers: { Authorization: 'Bearer test' },
          artwork: 'https://example.test/a.jpg',
          mimeType: 'audio/flac',
        }),
        expect.objectContaining({ id: 'b' }),
      ],
      0,
    );
  });

  it('does not rebuild an unchanged queue', async () => {
    const engine = new NativeAudioEngine();
    await engine.setQueue([source('a'), source('b')], 1);
    await engine.setQueue([source('a'), source('b')], 1);
    expect(fake.setQueue).toHaveBeenCalledTimes(1);
  });

  it('routes remote and auto transitions to the store handlers', async () => {
    const engine = new NativeAudioEngine();
    const next = vi.fn();
    const previous = vi.fn();
    const auto = vi.fn(() => 'keep' as const);
    engine.setRemoteHandlers({ next, previous });
    engine.setAutoAdvanceHandler(auto);
    await engine.setQueue([source('a'), source('b')], 0);

    fake.emit('onRemoteNext');
    fake.emit('onRemotePrevious');
    fake.emit('onAutoAdvance', { mediaId: 'b', index: 1, reason: 'auto' });

    expect(next).toHaveBeenCalledOnce();
    expect(previous).toHaveBeenCalledOnce();
    expect(auto).toHaveBeenCalledWith({ mediaId: 'b', index: 1, reason: 'auto' });
    expect(fake.pause).not.toHaveBeenCalled();
  });

  it('pauses the native player when the store takes over', async () => {
    const engine = new NativeAudioEngine();
    engine.setAutoAdvanceHandler(() => 'takeover');
    await engine.setQueue([source('a'), source('b')], 0);

    fake.emit('onAutoAdvance', { mediaId: 'x', reason: 'auto' });

    expect(fake.pause).toHaveBeenCalledOnce();
  });

  it('syncs the effective queue and repeat mode without reloading', async () => {
    const engine = new NativeAudioEngine();
    await engine.setQueue([source('a')], 0);
    await engine.syncQueue([source('a'), source('b')], 0);
    await engine.setRepeatMode('all');

    expect(fake.syncQueue).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })],
      0,
    );
    expect(fake.setRepeatMode).toHaveBeenCalledWith('all');
    expect(fake.setQueue).toHaveBeenCalledTimes(1);
  });

  it('skips only when the native queue still has the expected id', async () => {
    const engine = new NativeAudioEngine();
    await engine.setQueue([source('a'), source('b')], 0);

    fake.skipToIndex.mockResolvedValueOnce(true);
    expect(await engine.skipToIndex(1, 'b')).toBe(true);
    expect(fake.skipToIndex).toHaveBeenCalledWith(1, 'b');

    fake.skipToIndex.mockResolvedValueOnce(false);
    expect(await engine.skipToIndex(0, 'stale')).toBe(false);
  });

  it('maps buffering, playing, paused, ended and errors', async () => {
    const engine = new NativeAudioEngine();
    await engine.setQueue([source('a')], 0);

    state.raw = { ...state.raw, state: 'buffering', position: 1, duration: 10, buffered: 5 };
    expect(await engine.getState()).toMatchObject({
      status: 'loading',
      position: 1,
      duration: 10,
      buffered: 5,
    });

    state.raw = { ...state.raw, state: 'ready', playing: true };
    expect((await engine.getState()).status).toBe('playing');

    state.raw = { ...state.raw, playing: false };
    expect((await engine.getState()).status).toBe('paused');

    state.raw = { ...state.raw, state: 'ended' };
    expect((await engine.getState()).status).toBe('ended');

    fake.emit('onError', { code: 'ERROR_CODE_IO', message: 'stream failed' });
    expect(await engine.getState()).toMatchObject({
      status: 'error',
      error: 'stream failed',
    });
  });

  it('falls back to the track duration when the native duration is unknown', async () => {
    const engine = new NativeAudioEngine();
    await engine.setQueue([{ ...source('a'), duration: 241 }], 0);
    state.raw = { ...state.raw, state: 'ready', duration: 0 };
    expect((await engine.getState()).duration).toBe(241);
  });

  it('destroys the native module', async () => {
    const engine = new NativeAudioEngine();
    await engine.destroy();
    expect(fake.destroy).toHaveBeenCalledOnce();
  });
});
