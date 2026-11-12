import { createCoalescedJSONStorage } from '@/adapters/storage/coalesced';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Album, Playlist, Track } from '@/core/models';
import {
  addCollection,
  addCover,
  addDownloadedTracks,
  coverStillUsed,
  isRecoveredEntry,
  mergeCollectionTracks,
  mergeRecoveredMetadata,
  downloadSizeError,
  planEviction,
  emptyOfflineIndex,
  reconcileCollection,
  recoverOfflineIndex,
  restoreManifestTracks,
  usedCovers,
  isDownloaded,
  localUri as localUriFromIndex,
  removeCollection as removeCollectionFromIndex,
  removeCollectionTrack,
  removeDownloadedTrack,
  removeDownloadedTracks,
  type DownloadEntry,
  type DownloadQuality,
  type DownloadStatus,
  type DownloadedTrackInput,
  type OfflineIndex,
  type OfflineTrack,
} from '@/core/offline';
import { buildCoverUrl, buildDownloadUrl } from '@/core/subsonic/params';
import { logger } from '@/core/utils/logger';
import type { OfflineDownloadTask } from '@/ports/offline';
import { offlineFiles } from '@/services/offline';
import { appStore } from '@/services/appStorage';
import { useAuthStore } from './auth';
import { useDownloadProgressStore } from './downloadProgress';
import { useSettingsStore } from './settings';


interface OfflineState {
  index: OfflineIndex;
  downloads: Record<string, DownloadEntry>;
  active: number;
  offlineMode: boolean;
  /** True when the OS reports no network; not persisted. */
  networkOffline: boolean;
  hydrate: () => Promise<void>;
  downloadAlbum: (album: Album) => void;
  downloadPlaylist: (playlist: Playlist) => void;
  reconcilePlaylist: (playlist: Playlist) => Promise<void>;
  downloadTracks: (
    tracks: Track[],
    collection?: { id: string; type: 'album' | 'playlist'; name: string; coverArt?: string },
    options?: { append?: boolean },
  ) => void;
  pause: (trackId: string) => void;
  resume: (trackId: string) => void;
  cancel: (trackId: string) => void;
  removeTrack: (trackId: string) => Promise<void>;
  removeCollection: (collectionId: string) => Promise<void>;
  removeCollectionTrack: (collectionId: string, trackId: string) => Promise<void>;
  /** Drop the oldest downloads until the local index fits the budget. */
  freeUpSpace: (keepTrackIds?: ReadonlySet<string>) => Promise<number>;
  clearAll: () => Promise<void>;
  setOfflineMode: (enabled: boolean) => void;
  setNetworkOffline: (offline: boolean) => void;
  localUri: (trackId: string) => string | undefined;
  isDownloaded: (trackId: string) => boolean;
}

type OfflinePersisted = { index: OfflineIndex; offlineMode: boolean };

const storage = createCoalescedJSONStorage<OfflinePersisted>(
  {
    getItem: (name) => appStore.get(name),
    setItem: (name, value) => appStore.set(name, value),
    removeItem: (name) => appStore.remove(name),
  },
  {
    // The index is 8 MB at 20k tracks. Writing it on every completed download
    // blocked the JS thread for ~59 ms; batch a second's worth of changes. The
    // per-download sidecar manifests are still written immediately, so a hard
    // kill loses at most the debounce window and hydrate restores from them.
    delayMs: 1_000,
    changed: (next, previous) =>
      next.index !== previous.index || next.offlineMode !== previous.offlineMode,
  },
);

const tasks = new Map<string, OfflineDownloadTask>();
const speedSamples = new Map<string, { bytes: number; at: number; speed: number }>();
const coverPending = new Set<string>();
/** Coalesce completed downloads before copying the offline index. */
const DOWNLOAD_FLUSH_MS = 250;

function extensionFor(track: Track, quality: DownloadQuality): string {
  if (quality === 'opus') return 'opus';
  if (quality === 'mp3') return 'mp3';
  return track.suffix?.toLowerCase() || 'bin';
}

function downloadOptions(quality: DownloadQuality): {
  format?: 'opus' | 'mp3';
  maxBitRate?: number;
} {
  if (quality === 'opus') return { format: 'opus', maxBitRate: 128 };
  if (quality === 'mp3') return { format: 'mp3', maxBitRate: 192 };
  return {};
}

function setStatus(
  set: (fn: (state: OfflineState) => Partial<OfflineState>) => void,
  trackId: string,
  status: DownloadStatus,
  progress?: number,
  error?: string,
  speed = 0,
  bytesWritten?: number,
  totalBytes?: number,
) {
  set((state) => {
    const existing = state.downloads[trackId];
    if (!existing) return state;
    return {
      downloads: {
        ...state.downloads,
        [trackId]: {
          ...existing,
          status,
          progress: progress ?? existing.progress,
          error,
          downloadSpeed: speed,
          bytesWritten: bytesWritten ?? existing.bytesWritten,
          totalBytes: totalBytes ?? existing.totalBytes,
        },
      },
    };
  });
  if (status === 'queued' || status === 'error') {
    useDownloadProgressStore.getState().clear(trackId);
  }
}

function setProgress(trackId: string, progress: number, bytesWritten: number, totalBytes: number) {
  const now = Date.now();
  const previous = speedSamples.get(trackId);
  let speed = previous?.speed ?? 0;
  if (previous && bytesWritten >= previous.bytes && now > previous.at) {
    const instant = ((bytesWritten - previous.bytes) * 1000) / (now - previous.at);
    speed = previous.speed > 0 ? previous.speed * 0.65 + instant * 0.35 : instant;
  }
  speedSamples.set(trackId, { bytes: bytesWritten, at: now, speed });
  useDownloadProgressStore.getState().set(trackId, {
    progress,
    bytesWritten,
    totalBytes,
    speed,
  });
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => {
      // Completion buffer: adding each track to the index copied the whole
      // tracks record (O(T), ~54 ms at 20k). Batch a short window and copy once.
      let pendingTracks: DownloadedTrackInput[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flushDownloadedTracks = () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (pendingTracks.length === 0) return;
        const entries = pendingTracks;
        pendingTracks = [];
        set((state) => ({ index: addDownloadedTracks(state.index, entries) }));
      };

      const queueDownloadedTrack = (entry: DownloadedTrackInput) => {
        pendingTracks.push(entry);
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flushDownloadedTracks();
        }, DOWNLOAD_FLUSH_MS);
      };

      const dropPendingTracks = (trackIds: ReadonlySet<string>) => {
        if (pendingTracks.length === 0) return;
        pendingTracks = pendingTracks.filter((entry) => !trackIds.has(entry.track.id));
      };

      const ensureCover = async (coverArt: string | undefined) => {
        if (!coverArt || coverPending.has(coverArt) || get().index.covers?.[coverArt]) return;
        const server = useAuthStore.getState().server;
        if (!server) return;
        coverPending.add(coverArt);
        try {
          const url = buildCoverUrl(server, coverArt, 600);
          const file = await offlineFiles.downloadCover(coverArt, url, server.headers);
          if (file) {
            set((state) => ({
              index: addCover(state.index, coverArt, file.uri, file.size),
            }));
          }
        } catch (error) {
          logger.debug('Cover download failed', { coverArt, error });
        } finally {
          coverPending.delete(coverArt);
        }
      };

      const rememberManifest = async (trackId: string, entry?: OfflineTrack) => {
        const stored = entry ?? get().index.tracks[trackId];
        if (!stored) return;
        try {
          await offlineFiles.saveManifest(stored);
        } catch (error) {
          logger.debug('Could not write download manifest', { trackId, error });
        }
      };

      const pruneCover = async (coverArt: string | undefined) => {
        if (!coverArt) return;
        if (coverStillUsed(get().index, coverArt)) return;
        await offlineFiles.removeCover(coverArt);
        set((state) => {
          const covers = { ...(state.index.covers ?? {}) };
          delete covers[coverArt];
          return { index: { ...state.index, covers } };
        });
      };

      /**
       * Batch prune: resolve the used-cover set once instead of scanning every
       * track per candidate (O(candidates × tracks) before).
       */
      const pruneCovers = async (candidates: Iterable<string | undefined>) => {
        const used = usedCovers(get().index);
        const removed: string[] = [];
        for (const coverArt of new Set(candidates)) {
          if (!coverArt || used.has(coverArt)) continue;
          await offlineFiles.removeCover(coverArt);
          removed.push(coverArt);
        }
        if (removed.length === 0) return;
        set((state) => {
          const covers = { ...(state.index.covers ?? {}) };
          for (const coverArt of removed) delete covers[coverArt];
          return { index: { ...state.index, covers } };
        });
      };

      const startOne = (next: DownloadEntry): boolean => {
        const server = useAuthStore.getState().server;
        if (!server) {
          setStatus(set, next.track.id, 'error', 0, 'Not signed in');
          return false;
        }

        const track = next.track;
        const quality = next.quality ?? useSettingsStore.getState().downloadQuality;
        const extension = extensionFor(track, quality);
        const task = offlineFiles.createDownload({
          url: buildDownloadUrl(server, track.id, downloadOptions(quality)),
          trackId: track.id,
          extension,
          headers: server.headers,
          onProgress: (progress, bytesWritten, totalBytes) =>
            setProgress(track.id, progress, bytesWritten ?? 0, totalBytes ?? 0),
        });
        tasks.set(track.id, task);
        set((state) => ({ active: state.active + 1 }));
        setStatus(set, track.id, 'downloading', 0);

        void task
          .start()
          .then(async (file) => {
            if (!file) {
              setStatus(set, track.id, 'paused');
              return;
            }
            const integrity = downloadSizeError(track.size, file.size, quality === 'original');
            if (integrity) {
              await offlineFiles.remove(track.id, extension, file.uri);
              throw new Error(integrity);
            }
            speedSamples.delete(track.id);
            useDownloadProgressStore.getState().clear(track.id);
            const stored: OfflineTrack = {
              track,
              fileUri: file.uri,
              size: file.size,
              extension,
              downloadedAt: Date.now(),
            };
            set((state) => ({
              downloads: {
                ...state.downloads,
                [track.id]: {
                  ...state.downloads[track.id]!,
                  progress: 1,
                  status: 'done',
                  downloadSpeed: 0,
                  bytesWritten: file.size,
                },
              },
            }));
            queueDownloadedTrack(stored);
            await rememberManifest(track.id, stored);
            void ensureCover(track.coverArt);
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : 'Download failed';
            logger.warn('Download failed', { trackId: track.id, message });
            setStatus(set, track.id, 'error', 0, message);
          })
          .finally(() => {
            tasks.delete(track.id);
            set((state) => ({ active: Math.max(0, state.active - 1) }));
            pump();
          });
        return true;
      };

      const pump = () => {
        const limit = useSettingsStore.getState().parallelDownloads;
        // Fill every free slot, not one per enqueue call.
        while (get().active < limit) {
          const next = Object.values(get().downloads).find(
            (entry) => entry.status === 'queued',
          );
          if (!next) return;
          if (!startOne(next)) return;
        }
      };

      const queueTracks = (tracks: Track[]) => {
        const quality = useSettingsStore.getState().downloadQuality;
        set((state) => {
          const downloads = { ...state.downloads };
          for (const track of tracks) {
            if (isDownloaded(state.index, track.id)) continue;
            const existing = downloads[track.id];
            if (existing && existing.status !== 'error') continue;
            downloads[track.id] = { track, status: 'queued', progress: 0, quality };
          }
          return { downloads };
        });
        pump();
      };

      const enqueue = (
        tracks: Track[],
        collection?: { id: string; type: 'album' | 'playlist'; name: string; coverArt?: string },
        append = false,
      ) => {
        if (collection) {
          set((state) => ({
            index: append
              ? mergeCollectionTracks(
                  state.index,
                  collection,
                  tracks.map((track) => track.id),
                )
              : addCollection(state.index, {
                  id: collection.id,
                  type: collection.type,
                  name: collection.name,
                  coverArt: collection.coverArt,
                  trackIds: tracks.map((track) => track.id),
                }),
          }));
          void ensureCover(collection.coverArt);
        }
        queueTracks(tracks);
      };

      return {
        index: emptyOfflineIndex(),
        downloads: {},
        active: 0,
        offlineMode: false,
        networkOffline: false,

        hydrate: async () => {
          const current = get().index;
          const normalized: OfflineIndex = {
            ...current,
            covers: current.covers ?? {},
          };
          let index = normalized;

          // One listing per directory: the size comes with it, so hydration
          // does not run two or three native stat calls per download. The
          // listing is only a fast path: a persisted URI that is absent there
          // is verified directly before it is treated as deleted, otherwise a
          // path-format difference would wipe the whole index.
          const audioFiles = await offlineFiles.listAudio();
          const audioByUri = new Map(audioFiles.map((file) => [file.uri, file.size]));
          const audioByName = new Map(audioFiles.map((file) => [file.name, file.size]));
          const verifyFileSize = async (uri: string): Promise<number | undefined> => {
            const listed = audioByUri.get(uri);
            if (listed !== undefined) return listed;
            const name = decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1));
            const byName = audioByName.get(name);
            if (byName !== undefined) return byName;
            if (!(await offlineFiles.existsAt(uri))) return undefined;
            return offlineFiles.sizeAt(uri);
          };

          // Sidecar manifests keep the original track id and metadata even when
          // the file name was sanitised or the index was lost.
          const manifests = await offlineFiles.listManifests();
          const validManifests: OfflineTrack[] = [];
          for (const manifest of manifests) {
            const size = await verifyFileSize(manifest.fileUri);
            // `undefined` means the file is gone. Only a confirmed size
            // mismatch deletes it; a zero-length stat can mean "unreadable".
            if (size !== undefined && (manifest.size <= 0 || size === manifest.size)) {
              validManifests.push(manifest);
            } else if (size !== undefined) {
              logger.warn('Removing truncated download manifest', {
                trackId: manifest.track.id,
                expected: manifest.size,
                actual: size,
              });
              await offlineFiles.remove(manifest.track.id, manifest.extension, manifest.fileUri);
              await offlineFiles.removeManifest(manifest.track.id);
            } else {
              await offlineFiles.removeManifest(manifest.track.id);
            }
          }
          index = restoreManifestTracks(index, validManifests);
          // Entries rebuilt from file names get their metadata back from the
          // sidecars; normal entries are left untouched.
          index = mergeRecoveredMetadata(index, validManifests);
          logger.warn('Offline hydrate audit', {
            tracks: Object.keys(index.tracks).length,
            recoveredLeft: Object.values(index.tracks).filter(isRecoveredEntry).length,
            collections: Object.keys(index.collections).length,
          });

          // Recover legacy audio without a manifest (or all audio when the
          // index and manifests are both empty). Files already represented by
          // the index or a manifest are skipped, so original ids are not
          // replaced by sanitised file stems.
          const knownUris = new Set([
            ...validManifests.map((manifest) => manifest.fileUri),
            ...Object.values(index.tracks).map((entry) => entry.fileUri),
          ]);
          const unrecovered = audioFiles.filter((file) => !knownUris.has(file.uri));
          if (unrecovered.length) index = recoverOfflineIndex(index, unrecovered);

          const coverFiles = await offlineFiles.listCovers();
          if (Object.keys(index.covers).length === 0) {
            index = recoverOfflineIndex(index, [], coverFiles);
          }
          const coverUris = new Set(coverFiles.map((file) => file.uri));

          // Drop index entries whose file disappeared (cache clear, OS cleanup).
          const missing: string[] = [];
          for (const [trackId, entry] of Object.entries(index.tracks)) {
            // The manifest/index URI is authoritative; recomputing the name
            // would fail for ids that safeName() had to sanitise.
            const size = await verifyFileSize(entry.fileUri);
            if (size === undefined || (entry.size > 0 && size !== entry.size)) {
              if (size !== undefined) {
                logger.warn('Removing truncated download', {
                  trackId,
                  expected: entry.size,
                  actual: size,
                });
                await offlineFiles.remove(trackId, entry.extension, entry.fileUri);
              }
              missing.push(trackId);
            }
          }
          const missingCovers: string[] = [];
          for (const coverArt of Object.keys(index.covers)) {
            const uri = index.covers[coverArt]?.fileUri;
            if (uri && coverUris.has(uri)) continue;
            if (uri && (await offlineFiles.existsAt(uri))) continue;
            if (!uri && (await offlineFiles.coverExists(coverArt))) continue;
            missingCovers.push(coverArt);
          }
          if (missing.length || missingCovers.length || index !== normalized) {
            set(() => {
              const covers = { ...(index.covers ?? {}) };
              for (const coverArt of missingCovers) delete covers[coverArt];
              const next = {
                ...removeDownloadedTracks(index, missing),
                covers,
              };
              return { index: next };
            });
          }
        },

        downloadAlbum: (album) => {
          enqueue(album.songs ?? [], {
            id: album.id,
            type: 'album',
            name: album.name,
            coverArt: album.coverArt,
          });
        },

        downloadPlaylist: (playlist) => {
          if (!playlist.songs?.length) return;
          if (get().index.collections[playlist.id]) {
            void get().reconcilePlaylist(playlist);
            return;
          }
          enqueue(playlist.songs, {
            id: playlist.id,
            type: 'playlist',
            name: playlist.name,
            coverArt: playlist.coverArt ?? playlist.songs?.[0]?.coverArt,
          });
        },

        reconcilePlaylist: async (playlist) => {
          const before = get().index;
          const existing = before.collections[playlist.id];
          if (!existing || existing.type !== 'playlist') return;
          // A non-empty playlist with no entries is a broken/partial response,
          // not a reason to wipe the downloaded copy.
          if (!Array.isArray(playlist.songs)) return;
          if ((playlist.songCount ?? 0) > 0 && playlist.songs.length === 0) return;
          const songs = playlist.songs;
          const plan = reconcileCollection(
            before,
            {
              id: playlist.id,
              type: 'playlist',
              name: playlist.name,
              coverArt: playlist.coverArt ?? songs[0]?.coverArt,
            },
            songs.map((track) => track.id),
          );
          if (!plan) return;

          for (const trackId of plan.removedTrackIds) {
            const task = tasks.get(trackId);
            if (task) {
              task.cancel();
              tasks.delete(trackId);
            }
            speedSamples.delete(trackId);
            useDownloadProgressStore.getState().clear(trackId);
          }

          set((state) => {
            const downloads = { ...state.downloads };
            for (const trackId of plan.removedTrackIds) delete downloads[trackId];
            return { index: plan.index, downloads };
          });

          const removedCovers = new Set<string>();
          for (const trackId of plan.deleteTrackIds) {
            const entry = before.tracks[trackId];
            if (!entry) continue;
            if (entry.track.coverArt) removedCovers.add(entry.track.coverArt);
            try {
              await offlineFiles.remove(trackId, entry.extension, entry.fileUri);
            } catch (error) {
              logger.warn('Could not remove orphaned playlist download', {
                trackId,
                error,
              });
            }
          }

          if (existing.coverArt && existing.coverArt !== plan.index.collections[playlist.id]?.coverArt) {
            removedCovers.add(existing.coverArt);
          }
          await pruneCovers(removedCovers);
          void ensureCover(plan.index.collections[playlist.id]?.coverArt);
          queueTracks(songs);
        },

        downloadTracks: (tracks, collection, options) => enqueue(tracks, collection, options?.append),

        pause: (trackId) => {
          const task = tasks.get(trackId);
          if (!task) return;
          void task.pause().then(() => setStatus(set, trackId, 'paused'));
        },

        resume: (trackId) => {
          const task = tasks.get(trackId);
          if (!task) {
            setStatus(set, trackId, 'queued', 0);
            pump();
            return;
          }
          setStatus(set, trackId, 'downloading');
          void task
            .resume()
            .then(async (file) => {
              if (!file) {
                setStatus(set, trackId, 'paused');
                return;
              }
              const entry = get().downloads[trackId];
              if (!entry) return;
              const quality = entry.quality ?? useSettingsStore.getState().downloadQuality;
              const extension = extensionFor(entry.track, quality);
              const integrity = downloadSizeError(
                entry.track.size,
                file.size,
                quality === 'original',
              );
              if (integrity) {
                await offlineFiles.remove(trackId, extension, file.uri);
                throw new Error(integrity);
              }
              speedSamples.delete(trackId);
              useDownloadProgressStore.getState().clear(trackId);
              const stored: OfflineTrack = {
                track: entry.track,
                fileUri: file.uri,
                size: file.size,
                extension,
                downloadedAt: Date.now(),
              };
              set((state) => ({
                downloads: {
                  ...state.downloads,
                  [trackId]: {
                    ...entry,
                    status: 'done',
                    progress: 1,
                    downloadSpeed: 0,
                    bytesWritten: file.size,
                  },
                },
              }));
              queueDownloadedTrack(stored);
              await rememberManifest(trackId, stored);
              void ensureCover(entry.track.coverArt);
            })
            .catch((error) => {
              setStatus(set, trackId, 'error', 0, error instanceof Error ? error.message : 'Download failed');
            });
        },

        cancel: (trackId) => {
          tasks.get(trackId)?.cancel();
          tasks.delete(trackId);
          speedSamples.delete(trackId);
          useDownloadProgressStore.getState().clear(trackId);
          set((state) => {
            const downloads = { ...state.downloads };
            delete downloads[trackId];
            return { downloads };
          });
        },

        removeTrack: async (trackId) => {
          dropPendingTracks(new Set([trackId]));
          const entry = get().index.tracks[trackId];
          if (entry) await offlineFiles.remove(trackId, entry.extension, entry.fileUri);
          useDownloadProgressStore.getState().clear(trackId);
          set((state) => {
            const downloads = { ...state.downloads };
            delete downloads[trackId];
            return { index: removeDownloadedTrack(state.index, trackId), downloads };
          });
          await pruneCover(entry?.track.coverArt);
        },

        removeCollection: async (collectionId) => {
          const collection = get().index.collections[collectionId];
          if (!collection) return;
          dropPendingTracks(new Set(collection.trackIds));
          const nextIndex = removeCollectionFromIndex(get().index, collectionId);
          for (const trackId of collection.trackIds) {
            if (!nextIndex.tracks[trackId]) {
              const entry = get().index.tracks[trackId];
              if (entry) await offlineFiles.remove(trackId, entry.extension, entry.fileUri);
              useDownloadProgressStore.getState().clear(trackId);
            }
          }
          set((state) => {
            const downloads = { ...state.downloads };
            for (const trackId of collection.trackIds) {
              if (!nextIndex.tracks[trackId]) delete downloads[trackId];
            }
            return { index: nextIndex, downloads };
          });
          await pruneCovers([
            collection.coverArt,
            ...collection.trackIds.map((trackId) => get().index.tracks[trackId]?.track.coverArt),
          ]);
        },

        removeCollectionTrack: async (collectionId, trackId) => {
          dropPendingTracks(new Set([trackId]));
          const entry = get().index.tracks[trackId];
          const nextIndex = removeCollectionTrack(get().index, collectionId, trackId);
          if (entry && !nextIndex.tracks[trackId]) {
            await offlineFiles.remove(trackId, entry.extension, entry.fileUri);
            useDownloadProgressStore.getState().clear(trackId);
          }
          set((state) => {
            const downloads = { ...state.downloads };
            if (!nextIndex.tracks[trackId]) delete downloads[trackId];
            return { index: nextIndex, downloads };
          });
          if (!nextIndex.tracks[trackId]) await pruneCover(entry?.track.coverArt);
        },

        freeUpSpace: async (keepTrackIds = new Set()) => {
          const limit = useSettingsStore.getState().offlineLimitBytes;
          if (!limit) return 0;
          const current = get().index;
          const plan = planEviction(current, limit, keepTrackIds);
          if (plan.trackIds.length === 0) return 0;

          for (const trackId of plan.trackIds) {
            const entry = current.tracks[trackId];
            if (!entry) continue;
            try {
              await offlineFiles.remove(trackId, entry.extension, entry.fileUri);
            } catch (error) {
              logger.warn('Could not remove download for space', { trackId, error });
            }
            useDownloadProgressStore.getState().clear(trackId);
          }
          set((state) => {
            const downloads = { ...state.downloads };
            for (const trackId of plan.trackIds) delete downloads[trackId];
            return { index: removeDownloadedTracks(state.index, plan.trackIds), downloads };
          });
          await pruneCovers(
            plan.trackIds.map((trackId) => current.tracks[trackId]?.track.coverArt),
          );
          return plan.freedBytes;
        },

        clearAll: async () => {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          pendingTracks = [];
          for (const [trackId, entry] of Object.entries(get().index.tracks)) {
            await offlineFiles.remove(trackId, entry.extension, entry.fileUri);
          }
          for (const coverArt of Object.keys(get().index.covers ?? {})) {
            await offlineFiles.removeCover(coverArt);
          }
          tasks.forEach((task) => task.cancel());
          tasks.clear();
          await offlineFiles.clearManifests();
          useDownloadProgressStore.getState().clearAll();
          set({ index: emptyOfflineIndex(), downloads: {}, active: 0 });
        },

        setOfflineMode: (offlineMode) => set({ offlineMode }),

        setNetworkOffline: (networkOffline) => set({ networkOffline }),

        localUri: (trackId) => localUriFromIndex(get().index, trackId),

        isDownloaded: (trackId) => isDownloaded(get().index, trackId),
      };
    },
    {
      name: 'laila.offline',
      storage,
      // Unversioned data (version 0) has the same index/offlineMode shape.
      version: 1,
      migrate: (persisted) => persisted as OfflineState,
      partialize: (state) => ({ index: state.index, offlineMode: state.offlineMode }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<OfflineState>;
        const savedIndex = saved.index;
        return {
          ...current,
          ...saved,
          index: {
            ...emptyOfflineIndex(),
            ...(savedIndex ?? {}),
            covers: savedIndex?.covers ?? {},
          },
        };
      },
    },
  ),
);

/** Manual offline mode or no OS network: both mean "downloads only". */
export function useEffectiveOffline(): boolean {
  return useOfflineStore((state) => state.offlineMode || state.networkOffline);
}

export function isOfflineNow(): boolean {
  const state = useOfflineStore.getState();
  return state.offlineMode || state.networkOffline;
}
