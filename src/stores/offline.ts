import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Album, Playlist, Track } from '@/core/models';
import {
  addCollection,
  addCover,
  addDownloadedTrack,
  coverStillUsed,
  mergeCollectionTracks,
  downloadSizeError,
  emptyOfflineIndex,
  reconcileCollection,
  recoverOfflineIndex,
  restoreManifestTracks,
  isDownloaded,
  localUri as localUriFromIndex,
  removeCollection as removeCollectionFromIndex,
  removeCollectionTrack,
  removeDownloadedTrack,
  type DownloadEntry,
  type DownloadQuality,
  type DownloadStatus,
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
  clearAll: () => Promise<void>;
  setOfflineMode: (enabled: boolean) => void;
  setNetworkOffline: (offline: boolean) => void;
  localUri: (trackId: string) => string | undefined;
  isDownloaded: (trackId: string) => boolean;
}

const storage = createJSONStorage(() => ({
  getItem: (name) => appStore.get(name),
  setItem: (name, value) => appStore.set(name, value),
  removeItem: (name) => appStore.remove(name),
}));

const tasks = new Map<string, OfflineDownloadTask>();
const speedSamples = new Map<string, { bytes: number; at: number; speed: number }>();
const coverPending = new Set<string>();

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

      const rememberManifest = async (trackId: string) => {
        const stored = get().index.tracks[trackId];
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
            set((state) => ({
              index: addDownloadedTrack(state.index, track, file.uri, file.size, extension),
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
            await rememberManifest(track.id);
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

          // Sidecar manifests keep the original track id and metadata even when
          // the file name was sanitised or the index was lost.
          const manifests = await offlineFiles.listManifests();
          const validManifests: OfflineTrack[] = [];
          for (const manifest of manifests) {
            const exists = await offlineFiles.existsAt(manifest.fileUri);
            const size = exists ? await offlineFiles.sizeAt(manifest.fileUri) : 0;
            if (exists && (manifest.size <= 0 || size === manifest.size)) {
              validManifests.push(manifest);
            } else {
              if (exists) {
                logger.warn('Removing truncated download manifest', {
                  trackId: manifest.track.id,
                  expected: manifest.size,
                  actual: size,
                });
                await offlineFiles.remove(manifest.track.id, manifest.extension, manifest.fileUri);
              }
              await offlineFiles.removeManifest(manifest.track.id);
            }
          }
          index = restoreManifestTracks(index, validManifests);

          // Recover legacy audio without a manifest (or all audio when the
          // index and manifests are both empty). Files already represented by
          // the index or a manifest are skipped, so original ids are not
          // replaced by sanitised file stems.
          const knownUris = new Set([
            ...validManifests.map((manifest) => manifest.fileUri),
            ...Object.values(index.tracks).map((entry) => entry.fileUri),
          ]);
          const audioFiles = (await offlineFiles.listAudio()).filter(
            (file) => !knownUris.has(file.uri),
          );
          if (audioFiles.length) index = recoverOfflineIndex(index, audioFiles);

          if (Object.keys(index.covers).length === 0) {
            index = recoverOfflineIndex(index, [], await offlineFiles.listCovers());
          }

          // Drop index entries whose file disappeared (cache clear, OS cleanup).
          const missing: string[] = [];
          for (const [trackId, entry] of Object.entries(index.tracks)) {
            // The manifest/index URI is authoritative; recomputing the name
            // would fail for ids that safeName() had to sanitise.
            const exists = await offlineFiles.existsAt(entry.fileUri);
            const size = exists ? await offlineFiles.sizeAt(entry.fileUri) : 0;
            if (!exists || (entry.size > 0 && size !== entry.size)) {
              if (exists) {
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
            const exists = await offlineFiles.coverExists(coverArt);
            if (!exists) missingCovers.push(coverArt);
          }
          if (missing.length || missingCovers.length || index !== normalized) {
            set(() => {
              const covers = { ...(index.covers ?? {}) };
              for (const coverArt of missingCovers) delete covers[coverArt];
              let next = { ...index, covers };
              for (const trackId of missing) next = removeDownloadedTrack(next, trackId);
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
          for (const coverArt of removedCovers) await pruneCover(coverArt);
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
              set((state) => ({
                index: addDownloadedTrack(state.index, entry.track, file.uri, file.size, extension),
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
              await rememberManifest(trackId);
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
          await pruneCover(collection.coverArt);
          for (const trackId of collection.trackIds) {
            await pruneCover(get().index.tracks[trackId]?.track.coverArt);
          }
        },

        removeCollectionTrack: async (collectionId, trackId) => {
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

        clearAll: async () => {
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
