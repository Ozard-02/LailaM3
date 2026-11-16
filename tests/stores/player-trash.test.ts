import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Album, ServerConfig, Track } from '@/core/models';
import { emptyOfflineIndex } from '@/core/offline';
import type { QueueState } from '@/core/queue/reducer';
import { serverKey } from '@/core/queryKeys';
import { useAuthStore } from '@/stores/auth';
import { useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';

const mocks = vi.hoisted(() => ({
  load: vi.fn(async () => undefined),
  setQueue: vi.fn(async () => undefined),
  removeQueueItem: vi.fn(async (_index: number, _mediaId: string) => undefined),
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
  getPlaylist: vi.fn(async () => ({ songs: [] as { id: string }[] })),
  updatePlaylist: vi.fn(async () => undefined),
  scrobble: vi.fn(async () => undefined),
}));

vi.mock('@/services/audio', () => ({
  audioEngine: {
    load: mocks.load,
    setQueue: mocks.setQueue,
    removeQueueItem: mocks.removeQueueItem,
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
    getPlaylist: mocks.getPlaylist,
    updatePlaylist: mocks.updatePlaylist,
    scrobble: mocks.scrobble,
  };
});

const server: ServerConfig = {
  url: 'https://music.example.test',
  username: 'laila',
  authMode: 'apiKey',
  apiKey: 'test',
  headers: {},
};

function track(id: string): Track {
  return { id, title: `Track ${id}` };
}

function album(name: string, ids: string[]): Album {
  return { id: `al-${name}`, name, songs: ids.map(track) };
}

function queueState(ids: string[], index: number): QueueState {
  return {
    queue: ids.map(track),
    index,
    upNext: [],
    originalQueue: null,
    repeat: 'off',
    shuffle: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ server });
  useSettingsStore.setState({ trashPlaylistIds: { [serverKey(server)]: 'trash' } });
  useOfflineStore.setState({
    index: emptyOfflineIndex(),
    offlineMode: false,
    networkOffline: false,
  });
  usePlayerStore.setState({
    castTarget: null,
    radioMode: false,
    error: null,
  });
});

describe('trashTrack playback continuity', () => {
  it('removes a non-current track without reloading the playing track', async () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c'], 0),
      status: 'playing',
      position: 42,
    });

    const pauses = mocks.pause.mock.calls.length;
    await usePlayerStore.getState().trashTrack(2);

    expect(mocks.removeQueueItem).toHaveBeenCalledWith(2, 'c');
    expect(mocks.setQueue).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.seek).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.pause).toHaveBeenCalledTimes(pauses);

    const queue = usePlayerStore.getState().queueState;
    expect(queue.queue.map((item) => item.id)).toEqual(['a', 'b']);
    expect(queue.index).toBe(0);
    expect(usePlayerStore.getState().status).toBe('playing');
    expect(usePlayerStore.getState().position).toBe(42);
  });

  it('keeps the next track playing when the current track is trashed', async () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c'], 1),
      status: 'playing',
      position: 42,
    });

    const pauses = mocks.pause.mock.calls.length;
    await usePlayerStore.getState().trashTrack(1);

    // One load for the skip, then an in-place removal: no second setQueue,
    // seek or pause that would restart the next track.
    expect(mocks.setQueue).toHaveBeenCalledTimes(1);
    expect(mocks.setQueue).toHaveBeenCalledWith(expect.any(Array), 2);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.removeQueueItem).toHaveBeenCalledWith(1, 'b');
    expect(mocks.seek).not.toHaveBeenCalled();
    expect(mocks.pause).toHaveBeenCalledTimes(pauses);

    const queue = usePlayerStore.getState().queueState;
    expect(queue.queue.map((item) => item.id)).toEqual(['a', 'c']);
    expect(queue.index).toBe(1);
  });

  it('removes every native copy of a duplicated track, highest index first', async () => {
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c', 'b'], 0),
      status: 'playing',
      position: 12,
    });

    await usePlayerStore.getState().trashTrack(1);

    expect(mocks.removeQueueItem.mock.calls).toEqual([
      [3, 'b'],
      [1, 'b'],
    ]);
    expect(mocks.setQueue).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().queueState.queue.map((item) => item.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('reads removal positions after an Up next insertion', async () => {
    const state = queueState(['a', 'b', 'a'], 0);
    state.upNext = [track('u')];
    usePlayerStore.setState({ queueState: state, status: 'playing', position: 8 });

    await usePlayerStore.getState().trashTrack(0);

    // next() inserts u at index 1, so the duplicate copies are at 0 and 3.
    expect(mocks.removeQueueItem.mock.calls).toEqual([
      [3, 'a'],
      [0, 'a'],
    ]);
    expect(mocks.setQueue).toHaveBeenCalledTimes(1);
    expect(mocks.setQueue).toHaveBeenCalledWith(expect.any(Array), 1);

    const queue = usePlayerStore.getState().queueState;
    expect(queue.queue.map((item) => item.id)).toEqual(['u', 'b']);
    expect(queue.index).toBe(0);
  });
});

describe('trashLibraryTrack', () => {
  it('trashes a track that is not in the queue without touching playback', async () => {
    mocks.getPlaylist
      .mockResolvedValueOnce({ songs: [] })
      .mockResolvedValueOnce({ songs: [{ id: 'z' }] });
    usePlayerStore.setState({
      queueState: queueState(['a', 'b'], 0),
      status: 'playing',
      position: 21,
    });

    const outcome = await usePlayerStore.getState().trashLibraryTrack(track('z'));

    expect(outcome.ok).toBe(true);
    expect(mocks.updatePlaylist).toHaveBeenCalledWith(server, 'trash', {
      songIdToAdd: 'z',
    });
    // The queue and the playing track are untouched, and nothing reloads.
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.setQueue).not.toHaveBeenCalled();
    expect(mocks.removeQueueItem).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().queueState.queue.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
    expect(usePlayerStore.getState().status).toBe('playing');
    expect(usePlayerStore.getState().position).toBe(21);

    // Undo removes the playlist entry again.
    if (!outcome.ok) return;
    await usePlayerStore.getState().undoTrash(outcome.undo);
    expect(mocks.updatePlaylist).toHaveBeenLastCalledWith(server, 'trash', {
      songIndexToRemove: 0,
    });
  });

  it('skips ahead when the library row is the track that is playing', async () => {
    mocks.getPlaylist.mockResolvedValueOnce({ songs: [] });
    usePlayerStore.setState({
      queueState: queueState(['a', 'b'], 0),
      status: 'playing',
      position: 12,
    });

    const outcome = await usePlayerStore.getState().trashLibraryTrack(track('a'));

    expect(outcome.ok).toBe(true);
    expect(mocks.setQueue).toHaveBeenCalledTimes(1);
    expect(mocks.setQueue).toHaveBeenCalledWith(expect.any(Array), 1);
    expect(usePlayerStore.getState().queueState.queue.map((item) => item.id)).toEqual(['b']);
  });

  it('reports a missing trash playlist without changing the queue', async () => {
    useSettingsStore.setState({ trashPlaylistIds: {} });
    usePlayerStore.setState({ queueState: queueState(['a'], 0), status: 'playing' });

    const outcome = await usePlayerStore.getState().trashLibraryTrack(track('a'));

    expect(outcome).toEqual({ ok: false, reason: 'no-playlist' });
    expect(mocks.updatePlaylist).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().queueState.queue.map((item) => item.id)).toEqual(['a']);
  });
});

describe('trashAlbum', () => {
  it('batches missing tracks into the playlist and removes the album in place', async () => {
    mocks.getPlaylist.mockResolvedValueOnce({ songs: [{ id: 'a' }] });
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c'], 0),
      status: 'playing',
      position: 18,
    });

    const outcome = await usePlayerStore
      .getState()
      .trashAlbum(album('Album', ['b']));

    expect(outcome.ok).toBe(true);
    expect(mocks.updatePlaylist).toHaveBeenCalledWith(server, 'trash', {
      songIdToAdd: ['b'],
    });
    expect(mocks.removeQueueItem).toHaveBeenCalledWith(1, 'b');
    expect(mocks.setQueue).not.toHaveBeenCalled();
    expect(mocks.pause).not.toHaveBeenCalled();

    const queue = usePlayerStore.getState().queueState;
    expect(queue.queue.map((item) => item.id)).toEqual(['a', 'c']);
    expect(queue.index).toBe(0);
    expect(usePlayerStore.getState().status).toBe('playing');
  });

  it('loads the next surviving track once when the album includes the current one', async () => {
    mocks.getPlaylist.mockResolvedValueOnce({ songs: [] });
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c', 'd'], 1),
      status: 'playing',
      position: 30,
    });

    const outcome = await usePlayerStore
      .getState()
      .trashAlbum(album('Album', ['b', 'c']));

    expect(outcome.ok).toBe(true);
    expect(mocks.setQueue).toHaveBeenCalledTimes(1);
    expect(mocks.setQueue).toHaveBeenCalledWith(expect.any(Array), 1);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.removeQueueItem).not.toHaveBeenCalled();

    const queue = usePlayerStore.getState().queueState;
    expect(queue.queue.map((item) => item.id)).toEqual(['a', 'd']);
    expect(queue.index).toBe(1);
    expect(queue.queue[queue.index]?.id).toBe('d');
  });

  it('promotes an up-next track instead of stopping when the album was playing', async () => {
    mocks.getPlaylist.mockResolvedValueOnce({ songs: [] });
    const state = queueState(['a', 'b'], 0);
    state.upNext = [track('u')];
    usePlayerStore.setState({ queueState: state, status: 'playing', position: 18 });

    const outcome = await usePlayerStore
      .getState()
      .trashAlbum(album('Album', ['a']));

    expect(outcome.ok).toBe(true);
    expect(mocks.setQueue).toHaveBeenCalledTimes(1);
    expect(mocks.setQueue).toHaveBeenCalledWith(expect.any(Array), 0);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    const queue = usePlayerStore.getState().queueState;
    expect(queue.queue.map((item) => item.id)).toEqual(['u', 'b']);
    expect(queue.queue[queue.index]?.id).toBe('u');
    expect(queue.upNext).toEqual([]);
  });

  it('restores the whole album and removes only the tracks it added', async () => {
    mocks.getPlaylist
      .mockResolvedValueOnce({ songs: [{ id: 'a' }] })
      .mockResolvedValueOnce({ songs: [{ id: 'b' }, { id: 'a' }] });
    usePlayerStore.setState({
      queueState: queueState(['a', 'b', 'c'], 0),
      status: 'playing',
      position: 18,
    });

    const outcome = await usePlayerStore
      .getState()
      .trashAlbum(album('Album', ['a', 'b']));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    await usePlayerStore.getState().undoTrashAlbum(outcome.undo);

    expect(mocks.updatePlaylist).toHaveBeenLastCalledWith(server, 'trash', {
      songIndexToRemove: [0],
    });
    expect(usePlayerStore.getState().queueState.queue.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    // Playback stays on the surviving track c, now back at its original index.
    expect(usePlayerStore.getState().queueState.index).toBe(2);
    expect(
      usePlayerStore.getState().queueState.queue[
        usePlayerStore.getState().queueState.index
      ]?.id,
    ).toBe('c');
  });

  it('reports a missing trash playlist without changing the queue', async () => {
    useSettingsStore.setState({ trashPlaylistIds: {} });
    usePlayerStore.setState({
      queueState: queueState(['a', 'b'], 0),
      status: 'playing',
    });

    const outcome = await usePlayerStore
      .getState()
      .trashAlbum(album('Album', ['a', 'b']));

    expect(outcome).toEqual({ ok: false, reason: 'no-playlist' });
    expect(usePlayerStore.getState().queueState.queue.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
