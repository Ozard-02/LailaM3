import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig, Track } from '@/core/models';
import { emptyOfflineIndex } from '@/core/offline';
import { currentTrack, type QueueState } from '@/core/queue/reducer';
import { useAuthStore } from '@/stores/auth';
import { useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { clearLastPlay } from '@/stores/player/session';
import { useSettingsStore } from '@/stores/settings';

const mocks = vi.hoisted(() => ({
  load: vi.fn(async () => undefined),
  setQueue: vi.fn(async (_sources: { id: string }[], _index: number) => undefined),
  syncQueue: vi.fn(async (_sources: { id: string }[], _index: number) => undefined),
  skipToIndex: vi.fn(async (_index: number, _mediaId: string) => true),
  removeQueueItem: vi.fn(async (_index: number, _mediaId: string) => undefined),
  setRepeatMode: vi.fn(async () => undefined),
  play: vi.fn(async () => undefined),
  pause: vi.fn(async () => undefined),
  seek: vi.fn(async () => undefined),
  setVolume: vi.fn(async () => undefined),
  getState: vi.fn(async () => ({
    status: 'paused' as const,
    position: 0,
    duration: 0,
    buffered: 0,
  })),
  scrobble: vi.fn(async () => undefined),
  getPlaylist: vi.fn(async () => ({ songs: [] as { id: string }[] })),
  getRandomSongs: vi.fn(async () => [] as Track[]),
}));

vi.mock('@/services/audio', () => ({
  audioEngine: {
    load: mocks.load,
    setQueue: mocks.setQueue,
    syncQueue: mocks.syncQueue,
    skipToIndex: mocks.skipToIndex,
    removeQueueItem: mocks.removeQueueItem,
    setRepeatMode: mocks.setRepeatMode,
    play: mocks.play,
    pause: mocks.pause,
    seek: mocks.seek,
    setVolume: mocks.setVolume,
    getState: mocks.getState,
    subscribe: () => () => undefined,
    destroy: vi.fn(async () => undefined),
  },
}));

vi.mock('@/core/subsonic/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/subsonic/client')>();
  return {
    ...actual,
    scrobble: mocks.scrobble,
    getPlaylist: mocks.getPlaylist,
    getRandomSongs: mocks.getRandomSongs,
  };
});

const server: ServerConfig = {
  url: 'https://music.example.test',
  username: 'laila',
  authMode: 'apiKey',
  apiKey: 'test',
  headers: {},
};

function track(id: string, duration?: number): Track {
  return { id, title: `Track ${id}`, duration };
}

function queueState(ids: string[], index: number): QueueState {
  return {
    queue: ids.map((id) => track(id)),
    index,
    upNext: [],
    originalQueue: null,
    repeat: 'off',
    shuffle: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearLastPlay();
  useAuthStore.setState({ server });
  useSettingsStore.setState({ continueWithRadio: false });
  useOfflineStore.setState({
    index: emptyOfflineIndex(),
    offlineMode: false,
    networkOffline: false,
  });
  usePlayerStore.setState({
    castTarget: null,
    radioMode: false,
    error: null,
    seekRevision: 0,
  });
});

describe('_handleAutoAdvance', () => {
  it('adopts a normal auto-advance without pausing or reloading', () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c'], 0),
      status: 'playing',
      position: 28,
    });

    const decision = usePlayerStore.getState()._handleAutoAdvance({
      mediaId: 'b',
      index: 1,
      reason: 'auto',
    });

    expect(decision).toBe('keep');
    const state = usePlayerStore.getState();
    expect(currentTrack(state.queueState)?.id).toBe('b');
    expect(state.queueState.index).toBe(1);
    expect(state.position).toBe(0);
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.setQueue).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.scrobble).toHaveBeenCalledWith(server, 'b', { submission: false });
  });

  it('keeps the engine playing when Up Next matches the transition', () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b'], 0),
      status: 'playing',
      position: 12,
    });

    usePlayerStore.getState().addToQueue([track('u')], 'next');
    const [sources, index] = mocks.syncQueue.mock.calls[0] ?? [[], -1];
    expect((sources as { id: string }[]).map((item) => item.id)).toEqual(['a', 'u', 'b']);
    expect(index).toBe(0);

    vi.clearAllMocks();

    const decision = usePlayerStore.getState()._handleAutoAdvance({
      mediaId: 'u',
      index: 1,
      reason: 'auto',
    });

    expect(decision).toBe('keep');
    const state = usePlayerStore.getState();
    expect(state.queueState.queue.map((item) => item.id)).toEqual(['a', 'u', 'b']);
    expect(state.queueState.index).toBe(1);
    expect(state.queueState.upNext).toEqual([]);
    expect(currentTrack(state.queueState)?.id).toBe('u');
    expect(mocks.setQueue).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.scrobble).toHaveBeenCalledWith(server, 'u', { submission: false });
  });

  it('keeps repeat-one loops on the same track without reloading', () => {
    usePlayerStore.setState({
      queueState: { ...queueState(['a', 'b'], 0), repeat: 'one' },
      status: 'playing',
      position: 154,
    });

    const decision = usePlayerStore.getState()._handleAutoAdvance({
      mediaId: 'a',
      index: 0,
      reason: 'repeat',
    });

    expect(decision).toBe('keep');
    const state = usePlayerStore.getState();
    expect(currentTrack(state.queueState)?.id).toBe('a');
    expect(state.queueState.index).toBe(0);
    expect(state.position).toBe(0);
    expect(mocks.setQueue).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.scrobble).toHaveBeenCalledWith(server, 'a', { submission: false });
  });

  it('seeds the adopted track duration when the metadata has one', () => {
    usePlayerStore.setState({
      queueState: {
        ...queueState(['a', 'b'], 0),
        queue: [track('a', 180), track('b', 245)],
      },
      status: 'playing',
      position: 170,
      duration: 180,
    });

    const decision = usePlayerStore.getState()._handleAutoAdvance({
      mediaId: 'b',
      index: 1,
      reason: 'auto',
    });

    expect(decision).toBe('keep');
    expect(usePlayerStore.getState().duration).toBe(245);
  });

  it('takes over and reloads when the native media id mismatches', async () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c'], 0),
      status: 'playing',
      position: 30,
    });

    const decision = usePlayerStore.getState()._handleAutoAdvance({
      mediaId: 'z',
      index: 1,
      reason: 'auto',
    });

    expect(decision).toBe('takeover');
    await vi.waitFor(() => expect(mocks.setQueue).toHaveBeenCalledTimes(1));
    expect(mocks.setQueue.mock.calls[0]?.[1]).toBe(1);
    await vi.waitFor(() => expect(mocks.play).toHaveBeenCalledTimes(1));
    expect(currentTrack(usePlayerStore.getState().queueState)?.id).toBe('b');
  });

  it('takes over and stops when the queue has no next track', async () => {
    usePlayerStore.setState({
      queueState: queueState(['a'], 0),
      status: 'playing',
      position: 61,
    });

    const decision = usePlayerStore.getState()._handleAutoAdvance({
      mediaId: 'b',
      index: 1,
      reason: 'auto',
    });

    expect(decision).toBe('takeover');
    await vi.waitFor(() => expect(mocks.pause).toHaveBeenCalled());
    const state = usePlayerStore.getState();
    expect(state.status).toBe('ended');
    expect(state.queueState.index).toBe(1);
  });
});

describe('native queue synchronization', () => {
  it('syncs after shuffle and keeps reorder in the unshuffled order', () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c', 'd'], 0),
      status: 'playing',
    });

    usePlayerStore.getState().toggleShuffle();
    expect(mocks.syncQueue).toHaveBeenCalledTimes(1);
    const shuffled = mocks.syncQueue.mock.calls[0]?.[0] as { id: string }[] | undefined;
    expect(new Set((shuffled ?? []).map((item) => item.id))).toEqual(
      new Set(['a', 'b', 'c', 'd']),
    );
    expect(mocks.syncQueue.mock.calls[0]?.[1]).toBe(0);

    vi.clearAllMocks();
    usePlayerStore.getState().reorder([
      track('d'),
      track('b'),
      track('a'),
      track('c'),
    ]);

    const reordered = mocks.syncQueue.mock.calls[0]?.[0] as { id: string }[] | undefined;
    expect((reordered ?? []).map((item) => item.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(mocks.syncQueue.mock.calls[0]?.[1]).toBe(2);
    expect(usePlayerStore.getState().queueState.originalQueue?.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('syncs after move and after removing another track', () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c', 'd'], 0),
      status: 'playing',
    });

    usePlayerStore.getState().move(1, 3);
    const moved = mocks.syncQueue.mock.calls[0]?.[0] as { id: string }[] | undefined;
    expect((moved ?? []).map((item) => item.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(mocks.syncQueue.mock.calls[0]?.[1]).toBe(0);

    vi.clearAllMocks();
    usePlayerStore.getState().removeAt(1);

    const removed = mocks.syncQueue.mock.calls[0]?.[0] as { id: string }[] | undefined;
    expect((removed ?? []).map((item) => item.id)).toEqual(['a', 'd', 'b']);
    expect(mocks.syncQueue.mock.calls[0]?.[1]).toBe(0);
    expect(mocks.setQueue).not.toHaveBeenCalled();
  });

  it('loads the new current track when removeAt removes the playing one', async () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c'], 0),
      status: 'playing',
    });

    usePlayerStore.getState().removeAt(0);

    expect(usePlayerStore.getState().queueState.queue.map((item) => item.id)).toEqual([
      'b',
      'c',
    ]);
    await vi.waitFor(() => expect(mocks.setQueue).toHaveBeenCalledTimes(1));
    expect(mocks.setQueue.mock.calls[0]?.[1]).toBe(0);
    expect(mocks.syncQueue).not.toHaveBeenCalled();
    expect(currentTrack(usePlayerStore.getState().queueState)?.id).toBe('b');
  });
});

describe('_syncFromEngine duration fallback', () => {
  function stateWithDuration(duration = 245): QueueState {
    return {
      ...queueState(['a', 'b'], 0),
      queue: [track('a', duration), track('b', 120)],
    };
  }

  it.each([-9223372036854776, 0, Number.POSITIVE_INFINITY, Number.NaN])(
    'falls back to the track duration when the engine reports %s',
    (reported) => {
      usePlayerStore.setState({
        queueState: stateWithDuration(),
        status: 'playing',
        position: 0,
        duration: 0,
      });

      usePlayerStore.getState()._syncFromEngine({
        status: 'playing',
        position: 12,
        duration: reported,
        buffered: 0,
      });

      const state = usePlayerStore.getState();
      expect(state.duration).toBe(245);
      expect(state.position).toBe(12);
      expect(state.status).toBe('playing');
    },
  );

  it('keeps a valid reported duration', () => {
    usePlayerStore.setState({
      queueState: stateWithDuration(),
      status: 'playing',
      position: 0,
      duration: 0,
    });

    usePlayerStore.getState()._syncFromEngine({
      status: 'playing',
      position: 12,
      duration: 244.8,
      buffered: 0,
    });

    expect(usePlayerStore.getState().duration).toBe(244.8);
  });

  it('keeps a known store duration when the track has no hint', () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b'], 0),
      status: 'playing',
      position: 0,
      duration: 180,
    });

    usePlayerStore.getState()._syncFromEngine({
      status: 'playing',
      position: 12,
      duration: 0,
      buffered: 0,
    });

    expect(usePlayerStore.getState().duration).toBe(180);
  });
});
