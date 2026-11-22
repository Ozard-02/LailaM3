import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig, Track } from '@/core/models';
import {
  addCollection,
  addCover,
  addDownloadedTrack,
  emptyOfflineIndex,
} from '@/core/offline';
import { useAuthStore } from '@/stores/auth';
import { useOfflineStore } from '@/stores/offline';
import { useSettingsStore } from '@/stores/settings';

interface PendingDownload {
  trackId: string;
  extension: string;
  resolve: (file: { uri: string; size: number } | null) => void;
  reject: (error: unknown) => void;
  cancelled: boolean;
}

const mocks = vi.hoisted(() => ({
  pending: [] as PendingDownload[],
  offlineFiles: {
    createDownload: vi.fn(),
    remove: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
    existsAt: vi.fn(async () => false),
    sizeAt: vi.fn(async () => 0),
    freeSpace: vi.fn(async () => null),
    uriFor: vi.fn(() => ''),
    sizeFor: vi.fn(async () => 0),
    downloadCover: vi.fn(async () => null),
    removeCover: vi.fn(async () => undefined),
    coverExists: vi.fn(async () => false),
    listAudio: vi.fn(async () => []),
    listCovers: vi.fn(async () => []),
    saveManifest: vi.fn(async () => undefined),
    listManifests: vi.fn(async () => []),
    removeManifest: vi.fn(async () => undefined),
    clearManifests: vi.fn(async () => undefined),
  },
}));

vi.mock('@/services/offline', () => ({ offlineFiles: mocks.offlineFiles }));

const server: ServerConfig = {
  url: 'https://music.example.test',
  username: 'laila',
  authMode: 'apiKey',
  apiKey: 'test',
  headers: {},
};

function track(id: string, extra: Partial<Track> = {}): Track {
  return { id, title: `Track ${id}`, ...extra };
}

function downloaded(id: string, coverArt?: string) {
  return addDownloadedTrack(
    emptyOfflineIndex(),
    track(id, { coverArt }),
    `file:///${id}.flac`,
    100,
    'flac',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending.length = 0;
  useAuthStore.setState({ server });
  useSettingsStore.setState({ parallelDownloads: 1, downloadQuality: 'original' });
  useOfflineStore.setState({
    index: emptyOfflineIndex(),
    downloads: {},
    active: 0,
    offlineMode: false,
    networkOffline: false,
  });

  mocks.offlineFiles.createDownload.mockImplementation(
    (options: { trackId: string; extension: string }) => {
      let resolve!: PendingDownload['resolve'];
      let reject!: PendingDownload['reject'];
      const promise = new Promise<{ uri: string; size: number } | null>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const pending: PendingDownload = {
        trackId: options.trackId,
        extension: options.extension,
        resolve,
        reject,
        cancelled: false,
      };
      mocks.pending.push(pending);
      return {
        start: () => promise,
        pause: async () => undefined,
        resume: () => promise,
        cancel: () => {
          pending.cancelled = true;
        },
      };
    },
  );
});

afterEach(async () => {
  await useOfflineStore.getState().clearAll();
});

describe('offline download lifecycle races', () => {
  it('prunes the covers of removed tracks before the index is rewritten', async () => {
    let index = downloaded('t1', 'cover-track');
    index = addCover(index, 'cover-track', 'file:///cover-track.jpg', 10);
    index = addCover(index, 'cover-album', 'file:///cover-album.jpg', 10);
    index = addCollection(index, {
      id: 'al-1',
      type: 'album',
      name: 'Album',
      trackIds: ['t1'],
      coverArt: 'cover-album',
    });
    useOfflineStore.setState({ index });

    await useOfflineStore.getState().removeCollection('al-1');

    expect(mocks.offlineFiles.removeCover).toHaveBeenCalledWith('cover-track');
    expect(mocks.offlineFiles.removeCover).toHaveBeenCalledWith('cover-album');
    expect(useOfflineStore.getState().index.covers).toEqual({});
  });

  it('does not resurrect a track removed while its download is in flight', async () => {
    useOfflineStore.getState().downloadTracks([track('t1', { suffix: 'flac' })], {
      id: 'al-1',
      type: 'album',
      name: 'Album',
    });
    const pending = mocks.pending[0];
    expect(pending?.trackId).toBe('t1');
    expect(useOfflineStore.getState().downloads.t1?.status).toBe('downloading');

    await useOfflineStore.getState().removeTrack('t1');
    expect(pending?.cancelled).toBe(true);
    expect(useOfflineStore.getState().downloads.t1).toBeUndefined();

    // The native task cannot always abort immediately; its late completion
    // must discard the file instead of writing the index.
    pending?.resolve({ uri: 'file:///t1.flac', size: 100 });
    await vi.waitFor(() => {
      expect(useOfflineStore.getState().active).toBe(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(useOfflineStore.getState().index.tracks.t1).toBeUndefined();
    expect(useOfflineStore.getState().downloads.t1).toBeUndefined();
    expect(mocks.offlineFiles.remove).toHaveBeenCalledWith(
      't1',
      'flac',
      'file:///t1.flac',
    );
  });

  it('prunes a completed download from downloads once it is flushed to the index', async () => {
    useOfflineStore.getState().downloadTracks([track('t1', { size: 100 })]);
    const pending = mocks.pending[0];
    pending?.resolve({ uri: 'file:///t1.flac', size: 100 });

    await vi.waitFor(() => {
      expect(useOfflineStore.getState().index.tracks.t1).toBeDefined();
    });

    expect(useOfflineStore.getState().downloads.t1).toBeUndefined();
  });
});
