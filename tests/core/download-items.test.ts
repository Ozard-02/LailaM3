import { describe, expect, it } from 'vitest';
import type { DownloadEntry, OfflineCollection, OfflineTrack } from '@/core/offline';
import { buildDownloadItems, downloadItemKey } from '@/utils/downloadItems';

const track = (id: string) => ({ id, title: `Track ${id}` });
const active = (id: string): DownloadEntry => ({ track: track(id), status: 'downloading', progress: 0.5 });
const entry = (id: string): OfflineTrack => ({
  track: track(id),
  fileUri: `file:///${id}.flac`,
  size: 100,
  downloadedAt: 1,
  extension: 'flac',
});
const collection = (id: string): OfflineCollection => ({
  id,
  type: 'album',
  name: `Collection ${id}`,
  trackIds: [],
  downloadedAt: 1,
});

describe('buildDownloadItems', () => {
  it('groups active downloads, collections and loose tracks', () => {
    const items = buildDownloadItems({
      active: [active('a1')],
      collections: [collection('c1')],
      tracks: [entry('t1')],
    });
    expect(items.map((item) => item.kind)).toEqual([
      'section',
      'active',
      'section',
      'collection',
      'section',
      'track',
    ]);
  });

  it('returns a single empty row when there is nothing to show', () => {
    expect(buildDownloadItems({ active: [], collections: [], tracks: [] })).toEqual([
      { kind: 'empty' },
    ]);
  });

  it('produces stable unique keys', () => {
    const items = buildDownloadItems({
      active: [active('a1')],
      collections: [collection('c1')],
      tracks: [entry('t1')],
    });
    const keys = items.map(downloadItemKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
