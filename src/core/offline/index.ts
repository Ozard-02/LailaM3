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

export interface DownloadedTrackInput {
  track: Track;
  fileUri: string;
  size: number;
  extension: string;
}

/**
 * Batch insert: copies the tracks record once for the whole batch. Completion
 * handlers should buffer entries and call this instead of copying per track
 * (O(tracks × downloads) on large libraries).
 */
export function addDownloadedTracks(
  index: OfflineIndex,
  entries: readonly DownloadedTrackInput[],
): OfflineIndex {
  if (entries.length === 0) return index;
  const tracks = { ...index.tracks };
  const downloadedAt = Date.now();
  for (const entry of entries) {
    tracks[entry.track.id] = {
      track: entry.track,
      fileUri: entry.fileUri,
      size: entry.size,
      extension: entry.extension,
      downloadedAt,
    };
  }
  return { ...index, tracks };
}

export function addDownloadedTrack(
  index: OfflineIndex,
  track: Track,
  fileUri: string,
  size: number,
  extension: string,
): OfflineIndex {
  return addDownloadedTracks(index, [{ track, fileUri, size, extension }]);
}

export function removeDownloadedTrack(index: OfflineIndex, trackId: string): OfflineIndex {
  return removeDownloadedTracks(index, [trackId]);
}

/**
 * Batch removal. Copying the index once per track made deleting a downloaded
 * album O(tracks × index size): 1.2 s for 100 tracks at 20k. Callers that
 * remove many ids must use this instead of looping `removeDownloadedTrack`.
 */
export function removeDownloadedTracks(
  index: OfflineIndex,
  trackIds: readonly string[],
): OfflineIndex {
  if (trackIds.length === 0) return index;
  const remove = new Set(trackIds);

  let removedAny = false;
  const tracks: Record<string, OfflineTrack> = {};
  for (const [id, entry] of Object.entries(index.tracks)) {
    if (remove.has(id)) {
      removedAny = true;
      continue;
    }
    tracks[id] = entry;
  }
  if (!removedAny) return index;

  let collectionsChanged = false;
  const collections: Record<string, OfflineCollection> = {};
  for (const [id, collection] of Object.entries(index.collections)) {
    const kept = collection.trackIds.filter((trackId) => !remove.has(trackId));
    if (kept.length === collection.trackIds.length && kept.length > 0) {
      collections[id] = collection;
      continue;
    }
    collectionsChanged = true;
    // An empty collection is dropped, as before.
    if (kept.length > 0) collections[id] = { ...collection, trackIds: kept };
  }

  return {
    ...index,
    tracks,
    collections: collectionsChanged ? collections : index.collections,
  };
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
  let tracks: Record<string, OfflineTrack> | null = null;
  let coverEntries: Record<string, OfflineCover> | null = null;
  const at = Date.now();
  for (const file of files) {
    const dot = file.name.lastIndexOf('.');
    if (dot <= 0) continue;
    const id = file.name.slice(0, dot);
    const extension = file.name.slice(dot + 1).toLowerCase();
    if (!id || !extension) continue;
    if (!tracks) tracks = { ...index.tracks };
    tracks[id] = {
      track: { id, title: id },
      fileUri: file.uri,
      size: file.size,
      extension,
      downloadedAt: at,
    };
  }
  for (const file of covers) {
    const dot = file.name.lastIndexOf('.');
    if (dot <= 0) continue;
    const id = file.name.slice(0, dot);
    if (!id) continue;
    if (!coverEntries) coverEntries = { ...(index.covers ?? {}) };
    coverEntries[id] = { fileUri: file.uri, size: file.size, downloadedAt: at };
  }
  if (!tracks && !coverEntries) return index;
  return {
    ...index,
    tracks: tracks ?? index.tracks,
    covers: coverEntries ?? index.covers,
  };
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
  let tracks: Record<string, OfflineTrack> | null = null;
  for (const manifest of manifests) {
    if ((tracks ?? index.tracks)[manifest.track.id]) continue;
    if (!tracks) tracks = { ...index.tracks };
    tracks[manifest.track.id] = manifest;
  }
  return tracks ? { ...index, tracks } : index;
}

/**
 * True for an entry rebuilt from a file name by `recoverOfflineIndex`: the
 * title is the id and no metadata survived. The sidecar manifest for the same
 * download still has the original track, so its fields can be restored without
 * touching entries that came from the server.
 */
export function isRecoveredEntry(entry: OfflineTrack): boolean {
  const track = entry.track;
  return track.title === track.id && !track.album && !track.artist && !track.coverArt;
}

/**
 * Upgrades entries that were recovered from file names with the metadata from
 * their sidecar manifest. Normal index entries always win, as in
 * `restoreManifestTracks`.
 */
export function mergeRecoveredMetadata(
  index: OfflineIndex,
  manifests: OfflineTrack[],
): OfflineIndex {
  if (manifests.length === 0) return index;
  const byId = new Map(manifests.map((manifest) => [manifest.track.id, manifest]));
  let tracks: Record<string, OfflineTrack> | null = null;
  for (const [id, entry] of Object.entries(index.tracks)) {
    if (!isRecoveredEntry(entry)) continue;
    const manifest = byId.get(id);
    if (!manifest) continue;
    if (!tracks) tracks = { ...index.tracks };
    tracks[id] = { ...entry, track: { ...manifest.track, id } };
  }
  return tracks ? { ...index, tracks } : index;
}

export function coverUri(index: OfflineIndex, coverArt: string | undefined): string | undefined {
  if (!coverArt) return undefined;
  return index.covers?.[coverArt]?.fileUri;
}

/**
 * Choose the oldest downloads to drop until the library fits `limitBytes`.
 * Tracks in `keepTrackIds` (the current queue) are never evicted. Returns the
 * ids oldest-first and the bytes they would free.
 */
export function planEviction(
  index: OfflineIndex,
  limitBytes: number,
  keepTrackIds: ReadonlySet<string> = new Set(),
): { trackIds: string[]; freedBytes: number } {
  let total = 0;
  for (const entry of Object.values(index.tracks)) total += entry.size;
  if (total <= limitBytes) return { trackIds: [], freedBytes: 0 };

  const candidates = Object.entries(index.tracks)
    .filter(([id]) => !keepTrackIds.has(id))
    .sort((a, b) => a[1].downloadedAt - b[1].downloadedAt);

  const trackIds: string[] = [];
  let freed = 0;
  for (const [id, entry] of candidates) {
    if (total - freed <= limitBytes) break;
    trackIds.push(id);
    freed += entry.size;
  }
  return { trackIds, freedBytes: freed };
}

/** All covers still referenced by a track or collection. O(tracks + collections). */
export function usedCovers(index: OfflineIndex): Set<string> {
  const used = new Set<string>();
  for (const entry of Object.values(index.tracks)) {
    if (entry.track.coverArt) used.add(entry.track.coverArt);
  }
  for (const collection of Object.values(index.collections)) {
    if (collection.coverArt) used.add(collection.coverArt);
  }
  return used;
}

export function coverStillUsed(index: OfflineIndex, coverArt: string): boolean {
  // Single check: short-circuit instead of building the full set.
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
  // One pass over the other collections instead of scanning their id arrays
  // for every removed track.
  const usedElsewhere = new Set<string>();
  for (const [id, other] of Object.entries(index.collections)) {
    if (id === collection.id) continue;
    for (const trackId of other.trackIds) usedElsewhere.add(trackId);
  }
  const removedTrackIds = existing.trackIds.filter(
    (trackId) => !nextSet.has(trackId) && !usedElsewhere.has(trackId),
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
  const next = removeDownloadedTracks({ ...index, collections }, deleteTrackIds);

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
  return stillUsed ? next : removeDownloadedTracks(next, [trackId]);
}

export function removeCollection(index: OfflineIndex, collectionId: string): OfflineIndex {
  const collection = index.collections[collectionId];
  if (!collection) return index;
  const stillUsed = new Set<string>();
  for (const [id, other] of Object.entries(index.collections)) {
    if (id === collectionId) continue;
    other.trackIds.forEach((trackId) => stillUsed.add(trackId));
  }
  const unused = collection.trackIds.filter((trackId) => !stillUsed.has(trackId));
  const next = removeDownloadedTracks(index, unused);
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
