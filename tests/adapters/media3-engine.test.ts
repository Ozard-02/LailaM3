import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAudioEngine } from '@/adapters/native/audio.native';

const { fake, state } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const fake = {
    setup: vi.fn(async () => undefined),
    setQueue: vi.fn(async () => undefined),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    seekTo: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    setPauseOnAutoAdvance: vi.fn(async () => undefined),
    setRemoteHandling: vi.fn(async () => undefined),
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
    expect(fake.setPauseOnAutoAdvance).toHaveBeenCalledWith(true);
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
    const auto = vi.fn();
    engine.setRemoteHandlers({ next, previous });
    engine.setAutoAdvanceHandler(auto);
    await engine.setQueue([source('a'), source('b')], 0);

    fake.emit('onRemoteNext');
    fake.emit('onRemotePrevious');
    fake.emit('onAutoAdvance', { mediaId: 'b' });

    expect(next).toHaveBeenCalledOnce();
    expect(previous).toHaveBeenCalledOnce();
    expect(auto).toHaveBeenCalledWith('b');
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

  it('destroys the native module', async () => {
    const engine = new NativeAudioEngine();
    await engine.destroy();
    expect(fake.destroy).toHaveBeenCalledOnce();
  });
});
