import type { DownloadEntry, OfflineCollection, OfflineTrack } from '@/core/offline';

/** One row of the virtualised Downloads list. */
export type DownloadItem =
  | { kind: 'section'; title: string; subtitle?: string }
  | { kind: 'active'; entry: DownloadEntry }
  | { kind: 'collection'; collection: OfflineCollection }
  | { kind: 'track'; entry: OfflineTrack }
  | { kind: 'empty' };

export interface DownloadData {
  active: DownloadEntry[];
  collections: OfflineCollection[];
  tracks: OfflineTrack[];
}

export function buildDownloadItems(data: DownloadData): DownloadItem[] {
  const items: DownloadItem[] = [];
  if (data.active.length > 0) {
    items.push({ kind: 'section', title: 'Downloading' });
    for (const entry of data.active) items.push({ kind: 'active', entry });
  }
  if (data.collections.length > 0) {
    items.push({ kind: 'section', title: 'Collections' });
    for (const collection of data.collections) items.push({ kind: 'collection', collection });
  }
  if (data.tracks.length > 0) {
    items.push({
      kind: 'section',
      title: 'Tracks',
      subtitle: 'Tracks that are not part of a downloaded album or playlist.',
    });
    for (const entry of data.tracks) items.push({ kind: 'track', entry });
  }
  if (items.length === 0) items.push({ kind: 'empty' });
  return items;
}

export function downloadItemKey(item: DownloadItem): string {
  switch (item.kind) {
    case 'section':
      return `section:${item.title}`;
    case 'active':
      return `active:${item.entry.track.id}`;
    case 'collection':
      return `collection:${item.collection.id}`;
    case 'track':
      return `track:${item.entry.track.id}`;
    case 'empty':
      return 'empty';
  }
}
