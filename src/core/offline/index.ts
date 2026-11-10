import type { Album, Artist, Genre, Playlist, Track } from '../models';

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'done' | 'error';
export type DownloadQuality = 'original' | 'opus' | 'mp3';

export interface OfflineTrack {
  track: Track;
  fileUri: string;
  size: number;
  downloadedAt: number;
  extension: string;
}

export interface OfflineCollection {
  id: string;
  type: 'album' | 'playlist';
  name: string;
  trackIds: string[];
  coverArt?: string;
  downloadedAt: number;
}

export interface OfflineCover {
  fileUri: string;
  size: number;
  downloadedAt: number;
}

export interface OfflineIndex {
  version: 1;
  tracks: Record<string, OfflineTrack>;
  collections: Record<string, OfflineCollection>;
  covers: Record<string, OfflineCover>;
}

export interface DownloadEntry {
  track: Track;
  status: DownloadStatus;
  progress: number;
  quality?: DownloadQuality;
  error?: string;
  bytesWritten?: number;
  totalBytes?: number;
  downloadSpeed?: number;
}

export const FAVOURITES_COLLECTION = {
  id: '__favourites',
  type: 'playlist' as const,
  name: 'Favourited',
};

/**
 * Best-effort size before a download. `track.size` is exact for original
 * files; transcoded downloads are estimated from duration and bitrate.
 */
export function estimateDownloadBytes(
  tracks: Track[],
  quality: DownloadQuality,
): number | undefined {
  let total = 0;
  for (const track of tracks) {
    if (quality === 'original') {
      if (track.size && track.size > 0) total += track.size;
      else if (track.duration && track.bitRate) total += track.bitRate * 125 * track.duration;
      else return undefined;
    } else {
      if (!track.duration) return undefined;
      const kbps = quality === 'opus' ? 128 : 192;
      total += kbps * 125 * track.duration;
    }
  }
  return total > 0 ? total : undefined;
}

/**
 * Size-only integrity check. OpenSubsonic does not expose a content hash, so
 * the server-declared original size is the strongest signal available.
 */
export function downloadSizeError(
  expectedBytes: number | undefined,
  actualBytes: number,
  original: boolean,
): string | null {
  if (actualBytes <= 0) return 'The downloaded file is empty.';
  if (!original || !expectedBytes) return null;
  if (actualBytes !== expectedBytes) {
    return `Download incomplete: ${actualBytes} of ${expectedBytes} bytes.`;
  }
  return null;
}

export function emptyOfflineIndex(): OfflineIndex {
  return { version: 1, tracks: {}, collections: {}, covers: {} };
}

export function isDownloaded(index: OfflineIndex, trackId: string): boolean {
  return Boolean(index.tracks[trackId]);
}

export function localUri(index: OfflineIndex, trackId: string): string | undefined {
  return index.tracks[trackId]?.fileUri;
}

export function addDownloadedTrack(
  index: OfflineIndex,
  track: Track,
  fileUri: string,
  size: number,
  extension: string,
): OfflineIndex {
  return {
    ...index,
    tracks: {
      ...index.tracks,
      [track.id]: {
        track,
        fileUri,
        size,
        extension,
        downloadedAt: Date.now(),
      },
    },
  };
}

export function removeDownloadedTrack(index: OfflineIndex, trackId: string): OfflineIndex {
  const tracks = { ...index.tracks };
  delete tracks[trackId];
  const collections: Record<string, OfflineCollection> = {};
  for (const [id, collection] of Object.entries(index.collections)) {
    const trackIds = collection.trackIds.filter((track) => track !== trackId);
    if (trackIds.length > 0) collections[id] = { ...collection, trackIds };
  }
  return { ...index, tracks, collections };
}

export function addCollection(
  index: OfflineIndex,
  collection: Omit<OfflineCollection, 'downloadedAt'>,
): OfflineIndex {
  return {
    ...index,
    collections: {
      ...index.collections,
      [collection.id]: { ...collection, downloadedAt: Date.now() },
    },
  };
}

export function addCover(
  index: OfflineIndex,
  coverArt: string,
  fileUri: string,
  size: number,
): OfflineIndex {
  return {
    ...index,
    covers: {
      ...(index.covers ?? {}),
      [coverArt]: { fileUri, size, downloadedAt: Date.now() },
    },
  };
}

export interface RecoveredFile {
  name: string;
  uri: string;
  size: number;
}

/**
 * Rebuild playable entries from files left in the downloads directory. Used
 * when the persisted index is missing (e.g. a legacy store write failed).
 * Collections and original metadata cannot be recovered from a file name.
 */
export function recoverOfflineIndex(
  index: OfflineIndex,
  files: RecoveredFile[],
  covers: RecoveredFile[] = [],
): OfflineIndex {
  let next = index;
  for (const file of files) {
    const dot = file.name.lastIndexOf('.');
    if (dot <= 0) continue;
    const id = file.name.slice(0, dot);
    const extension = file.name.slice(dot + 1).toLowerCase();
    if (!id || !extension) continue;
    next = addDownloadedTrack(next, { id, title: id }, file.uri, file.size, extension);
  }
  for (const file of covers) {
    const dot = file.name.lastIndexOf('.');
    if (dot <= 0) continue;
    const id = file.name.slice(0, dot);
    if (!id) continue;
    next = addCover(next, id, file.uri, file.size);
  }
  return next;
}

/**
 * Restore tracks from per-download sidecars. Existing index entries win; a
 * manifest only fills a missing id, so a newer server metadata version is not
 * overwritten by an older sidecar.
 */
export function restoreManifestTracks(
  index: OfflineIndex,
  manifests: OfflineTrack[],
): OfflineIndex {
  let next = index;
  for (const manifest of manifests) {
    if (next.tracks[manifest.track.id]) continue;
    next = {
      ...next,
      tracks: { ...next.tracks, [manifest.track.id]: manifest },
    };
  }
  return next;
}

export function coverUri(index: OfflineIndex, coverArt: string | undefined): string | undefined {
  if (!coverArt) return undefined;
  return index.covers?.[coverArt]?.fileUri;
}

export function coverStillUsed(index: OfflineIndex, coverArt: string): boolean {
  return (
    Object.values(index.tracks).some((entry) => entry.track.coverArt === coverArt) ||
    Object.values(index.collections).some((collection) => collection.coverArt === coverArt)
  );
}

export function mergeCollectionTracks(
  index: OfflineIndex,
  collection: Omit<OfflineCollection, 'downloadedAt' | 'trackIds'>,
  trackIds: string[],
): OfflineIndex {
  const existing = index.collections[collection.id];
  const merged = existing
    ? Array.from(new Set([...existing.trackIds, ...trackIds]))
    : trackIds;
  return addCollection(index, {
    ...collection,
    coverArt: collection.coverArt ?? existing?.coverArt,
    trackIds: merged,
  });
}

export interface CollectionReconcilePlan {
  index: OfflineIndex;
  /** Removed from this collection and not referenced by any other collection. */
  removedTrackIds: string[];
  /** Removed tracks that currently have a downloaded file to delete. */
  deleteTrackIds: string[];
}

/**
 * Reconcile a downloaded collection with the server's current track ids.
 * Tracks are kept if another collection still uses them; orphaned files are
 * reported for deletion but never removed from other collections.
 */
export function reconcileCollection(
  index: OfflineIndex,
  collection: Omit<OfflineCollection, 'downloadedAt' | 'trackIds'>,
  trackIds: string[],
): CollectionReconcilePlan | null {
  const existing = index.collections[collection.id];
  if (!existing) return null;

  const nextTrackIds = Array.from(new Set(trackIds));
  const nextSet = new Set(nextTrackIds);
  const otherCollections = Object.entries(index.collections).filter(
    ([id]) => id !== collection.id,
  );
  const removedTrackIds = existing.trackIds.filter(
    (trackId) =>
      !nextSet.has(trackId) &&
      !otherCollections.some(([, other]) => other.trackIds.includes(trackId)),
  );
  const deleteTrackIds = removedTrackIds.filter((trackId) => Boolean(index.tracks[trackId]));

  const collections = {
    ...index.collections,
    [collection.id]: {
      ...existing,
      name: collection.name || existing.name,
      coverArt: collection.coverArt ?? existing.coverArt,
      trackIds: nextTrackIds,
    },
  };
  let next: OfflineIndex = { ...index, collections };
  for (const trackId of deleteTrackIds) {
    next = removeDownloadedTrack(next, trackId);
  }

  return { index: next, removedTrackIds, deleteTrackIds };
}

export function removeCollectionTrack(
  index: OfflineIndex,
  collectionId: string,
  trackId: string,
): OfflineIndex {
  const collection = index.collections[collectionId];
  if (!collection) return index;
  const trackIds = collection.trackIds.filter((id) => id !== trackId);
  if (trackIds.length === collection.trackIds.length) return index;

  const collections = { ...index.collections };
  if (trackIds.length === 0) delete collections[collectionId];
  else collections[collectionId] = { ...collection, trackIds };

  const stillUsed = Object.values(collections).some((item) => item.trackIds.includes(trackId));
  const next = { ...index, collections };
  return stillUsed ? next : removeDownloadedTrack(next, trackId);
}

export function removeCollection(index: OfflineIndex, collectionId: string): OfflineIndex {
  const collection = index.collections[collectionId];
  if (!collection) return index;
  let next = index;
  const stillUsed = new Set<string>();
  for (const [id, other] of Object.entries(index.collections)) {
    if (id === collectionId) continue;
    other.trackIds.forEach((trackId) => stillUsed.add(trackId));
  }
  for (const trackId of collection.trackIds) {
    if (!stillUsed.has(trackId)) next = removeDownloadedTrack(next, trackId);
  }
  const collections = { ...next.collections };
  delete collections[collectionId];
  return { ...next, collections };
}

export function collectionDownloaded(index: OfflineIndex, trackIds: string[]): number {
  if (trackIds.length === 0) return 1;
  const done = trackIds.filter((id) => isDownloaded(index, id)).length;
  return done / trackIds.length;
}

export function downloadedTracks(index: OfflineIndex): Track[] {
  return Object.values(index.tracks)
    .map((entry) => entry.track)
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
}

export function offlineAlbums(index: OfflineIndex): Album[] {
  const albums = new Map<string, Album>();
  for (const entry of Object.values(index.tracks)) {
    const track = entry.track;
    const key = track.albumId ?? `album:${track.album ?? 'unknown'}`;
    const existing = albums.get(key);
    if (existing) {
      existing.songs?.push(track);
      continue;
    }
    albums.set(key, {
      id: key,
      name: track.album ?? 'Unknown album',
      artist: track.artist,
      artistId: track.artistId,
      coverArt: track.coverArt,
      year: track.year,
      genre: track.genre,
      songs: [track],
    });
  }
  return [...albums.values()]
    .map((album) => {
      const songs = (album.songs ?? []).sort((a, b) => (a.track ?? 0) - (b.track ?? 0));
      return {
        ...album,
        songs,
        songCount: songs.length,
        duration: songs.reduce((sum, track) => sum + (track.duration ?? 0), 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function offlinePlaylists(index: OfflineIndex): Playlist[] {
  const tracks = new Map(
    Object.values(index.tracks).map((entry) => [entry.track.id, entry.track] as const),
  );
  return Object.values(index.collections)
    .filter((collection) => collection.type === 'playlist')
    .map((collection) => {
      const songs = collection.trackIds
        .map((trackId) => tracks.get(trackId))
        .filter((track): track is Track => Boolean(track));
      return {
        id: collection.id,
        name: collection.name,
        songs,
        songCount: songs.length,
        duration: songs.reduce((sum, track) => sum + (track.duration ?? 0), 0),
        coverArt: songs[0]?.coverArt,
      };
    })
    .filter((playlist) => playlist.songs.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function offlineArtists(index: OfflineIndex): Artist[] {
  const albums = offlineAlbums(index);
  const artists = new Map<string, Artist>();
  for (const album of albums) {
    const key = album.artistId ?? `artist:${album.artist ?? 'Unknown artist'}`;
    const existing = artists.get(key);
    if (existing) {
      existing.albums?.push(album);
      continue;
    }
    artists.set(key, {
      id: key,
      name: album.artist ?? 'Unknown artist',
      coverArt: album.coverArt,
      albums: [album],
    });
  }
  return [...artists.values()]
    .map((artist) => ({ ...artist, albumCount: artist.albums?.length ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function offlineGenres(index: OfflineIndex): Genre[] {
  const genres = new Map<string, { songCount: number; albumIds: Set<string> }>();
  for (const entry of Object.values(index.tracks)) {
    const track = entry.track;
    if (!track.genre) continue;
    const existing = genres.get(track.genre) ?? { songCount: 0, albumIds: new Set<string>() };
    existing.songCount += 1;
    if (track.albumId) existing.albumIds.add(track.albumId);
    genres.set(track.genre, existing);
  }
  return [...genres.entries()]
    .map(([name, value]) => ({
      name,
      songCount: value.songCount,
      albumCount: value.albumIds.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function offlineTracksByGenre(index: OfflineIndex, genre: string): Track[] {
  return downloadedTracks(index).filter(
    (track) => track.genre?.toLowerCase() === genre.toLowerCase(),
  );
}

export function nextDownloadedIndex(
  index: OfflineIndex,
  tracks: Track[],
  start: number,
  wrap: boolean,
): number {
  for (let i = Math.max(0, start); i < tracks.length; i += 1) {
    const track = tracks[i];
    if (track && isDownloaded(index, track.id)) return i;
  }
  if (wrap) {
    for (let i = 0; i < Math.max(0, start) && i < tracks.length; i += 1) {
      const track = tracks[i];
      if (track && isDownloaded(index, track.id)) return i;
    }
  }
  return -1;
}
