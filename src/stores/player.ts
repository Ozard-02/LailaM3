import { createCoalescedJSONStorage } from '@/adapters/storage/coalesced';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@/core/models';
import {
  applyTrackPatches,
  currentTrack as selectCurrentTrack,
  emptyQueue,
  queueReducer,
  shuffled,
  type QueueAction,
  type QueueState,
  type RepeatMode,
} from '@/core/queue/reducer';
import {
  getPlayback as getDlnaPlayback,
  pause as dlnaPause,
  play as dlnaPlay,
  playSource as dlnaPlaySource,
  seek as dlnaSeek,
  setVolume as dlnaSetVolume,
  stop as dlnaStop,
} from '@/core/dlna/control';
import type { DlnaRenderer } from '@/core/dlna/types';
import { safeSeekTime } from '@/core/audio/seek';
import { filterExcludedSongs } from '@/core/exclusions';
import { downloadedTracks, FAVOURITES_COLLECTION, nextDownloadedIndex } from '@/core/offline';
import { queryKeys, serverKey } from '@/core/queryKeys';
import { getPlaylist, getRandomSongs, getSong, star, updatePlaylist } from '@/core/subsonic/client';
import {
  createTrashUndo,
  removeTrackEverywhere,
  restoreTrackEverywhere,
  type TrashOutcome,
  type TrashUndo,
  type TrashUndoResult,
} from '@/core/trash';
import { logger } from '@/core/utils/logger';
import { audioEngine } from '@/services/audio';
import {
  ensureExcludedSongIds,
  getExcludedSongIds,
  loadShuffleExclusions,
  refreshExcludedSongIds,
} from '@/services/exclusions';
import { appStore } from '@/services/appStorage';
import { invalidatePlaylistQueries, queryClient } from '@/services/query';
import { isServerUsable, useAuthStore } from './auth';
import { markPlay, submitScrobble } from './player/session';
import { sourceFor } from './player/sources';
import { isOfflineNow, useOfflineStore } from './offline';
import { useSettingsStore } from './settings';

export interface PlayerState {
  queueState: QueueState;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
  position: number;
  duration: number;
  buffered: number;
  volume: number;
  error: string | null;
  /** Increments on explicit seeks/transfers so presence can report them. */
  seekRevision: number;
  /** True while the queue is an endless library sampler. */
  radioMode: boolean;
  /** Active DLNA renderer, or null when playing locally. */
  castTarget: DlnaRenderer | null;
  /** Actions */
  castTo: (renderer: DlnaRenderer) => Promise<void>;
  stopCast: () => Promise<void>;
  playTracks: (tracks: Track[], startIndex?: number) => Promise<void>;
  playShuffled: (tracks: Track[]) => Promise<boolean>;
  /** Rebuild stream URLs after a server/network switch, preserving transport. */
  refreshSources: () => Promise<void>;
  playRandom: () => Promise<boolean>;
  toggle: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  jump: (index: number) => Promise<void>;
  seek: (position: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  addToQueue: (tracks: Track[], mode?: 'end' | 'next') => void;
  moveToUpNext: (index: number) => void;
  removeAt: (index: number) => void;
  trashTrack: (index: number) => Promise<TrashOutcome>;
  undoTrash: (undo: TrashUndo) => Promise<TrashUndoResult>;
  move: (from: number, to: number) => void;
  reorder: (tracks: Track[]) => void;
  applyRemoteQueue: (
    transfer: {
      tracks: Track[];
      index: number;
      repeat: RepeatMode;
      shuffle: boolean;
      originalQueue: Track[] | null;
      positionMs: number;
    },
    play: boolean,
  ) => Promise<void>;
  clear: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  _apply: (action: QueueAction) => Promise<void>;
  _topUpRadio: () => Promise<boolean>;
  _syncFromEngine: (state: {
    status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
    position: number;
    duration: number;
    buffered: number;
    error?: string;
  }) => void;
  _handleAutoAdvance: (mediaId?: string) => void;
}

type PlayerPersisted = { queueState: QueueState; volume: number };

const storage = createCoalescedJSONStorage<PlayerPersisted>(
  {
    getItem: (name) => appStore.get(name),
    setItem: (name, value) => appStore.set(name, value),
    removeItem: (name) => appStore.remove(name),
  },
  {
    // Position, buffered and duration change 2–4×/s but are not persisted.
    // Comparing the queue reference keeps the whole queue out of the write
    // path: 11 ms of JSON per tick with a 10k-track queue.
    changed: (next, previous) =>
      next.queueState !== previous.queueState || next.volume !== previous.volume,
  },
);

const RADIO_BATCH = 40;
const RADIO_LOW_WATER = 8;
let radioPending: Promise<boolean> | null = null;
let castPoll: ReturnType<typeof setInterval> | null = null;
let castPolling = false;
let castAdvancing = false;
let castLastPosition = 0;
let castLastDuration = 0;
let sourceRefresh: Promise<void> | null = null;

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => {
      const stopCastPolling = () => {
        if (castPoll) clearInterval(castPoll);
        castPoll = null;
      };

      const pollCast = async (renderer: DlnaRenderer) => {
        if (castPolling) return;
        if (get().castTarget?.id !== renderer.id) {
          stopCastPolling();
          return;
        }
        castPolling = true;
        try {
          const playback = await getDlnaPlayback(renderer);
          const current = get();
          if (current.castTarget?.id !== renderer.id) {
            stopCastPolling();
            return;
          }
          if (playback.state === 'PLAYING') {
            castLastPosition = playback.position || castLastPosition;
            if (playback.duration > 0) castLastDuration = playback.duration;
            set({
              status: 'playing',
              position: playback.position,
              duration: playback.duration || current.duration,
              buffered: playback.position,
            });
          } else if (playback.state === 'PAUSED_PLAYBACK') {
            set({
              status: 'paused',
              position: playback.position || current.position,
              duration: playback.duration || current.duration,
            });
          } else if (playback.state === 'TRANSITIONING') {
            set({ status: 'loading' });
          } else if (playback.state === 'STOPPED' || playback.state === 'NO_MEDIA_PRESENT') {
            const ended = castLastDuration > 0 && castLastPosition >= castLastDuration - 3;
            if (ended && !castAdvancing) {
              castAdvancing = true;
              stopCastPolling();
              try {
                if (
                  get().radioMode ||
                  useSettingsStore.getState().continueWithRadio
                ) {
                  // Mirror the local queue end: keep sampling the library.
                  const oldLength = get().queueState.queue.length;
                  if (await topUpRadio()) {
                    await get().jump(oldLength);
                    return;
                  }
                }
                await get()._apply({ type: 'advance' });
              } finally {
                castAdvancing = false;
              }
            } else {
              set({
                status: 'paused',
                position: playback.position || current.position,
                duration: playback.duration || current.duration,
              });
            }
          }
        } catch {
          // Renderers often reject a poll while switching tracks; retry next tick.
        } finally {
          castPolling = false;
        }
      };

      const startCastPolling = (renderer: DlnaRenderer) => {
        stopCastPolling();
        castLastPosition = 0;
        castLastDuration = get().duration;
        castPoll = setInterval(() => {
          void pollCast(renderer);
        }, 1000);
      };

      const loadCurrent = async () => {
        let state = get().queueState;
        let track = selectCurrentTrack(state);
        if (!track) {
          await audioEngine.pause();
          return;
        }
        if (isOfflineNow() && !useOfflineStore.getState().localUri(track.id)) {
          const nextIndex = nextDownloadedIndex(
            useOfflineStore.getState().index,
            state.queue,
            state.index,
            state.repeat === 'all',
          );
          if (nextIndex < 0) {
            await audioEngine.pause();
            set({ status: 'ended', error: null });
            return;
          }
          state = { ...state, index: nextIndex };
          set({ queueState: state });
          track = state.queue[nextIndex];
          if (!track) return;
        }
        const cast = get().castTarget;
        if (cast) {
          try {
            set({ status: 'loading', error: null });
            const source = sourceFor(track, { remote: true });
            await dlnaPlaySource(cast, source);
            markPlay(track);
            set({
              status: 'playing',
              position: 0,
              duration: source.duration ?? 0,
              seekRevision: get().seekRevision + 1,
            });
            startCastPolling(cast);
          } catch {
            stopCastPolling();
            set({
              castTarget: null,
              status: 'paused',
              error: 'The speaker did not accept the stream.',
            });
          }
          return;
        }
        try {
          set({ status: 'loading', error: null });
          const queueState = get().queueState;
          if (audioEngine.setQueue) {
            await audioEngine.setQueue(queueState.queue.map((item) => sourceFor(item)), queueState.index);
          } else {
            await audioEngine.load(sourceFor(track));
          }
          markPlay(track);
          await audioEngine.play();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Playback failed';
          logger.error('Could not load track', { message });
          set({ status: 'error', error: message });
        }
      };

      /**
       * Upstream Segue hubs drop queue cover ids. The receiving device still
       * has the same server, so fetch the missing songs' metadata in the
       * background; the player and queue rows lose their grey placeholders.
       */
      const hydrateRemoteCovers = (tracks: Track[]) => {
        const server = useAuthStore.getState().server;
        if (!server) return;
        const missing = tracks.filter((track) => !track.coverArt).slice(0, 200);
        if (missing.length === 0) return;
        void (async () => {
          for (let index = 0; index < missing.length; index += 4) {
            const batch = missing.slice(index, index + 4);
            const patches = await Promise.all(
              batch.map(async (track) => {
                try {
                  const full = await getSong(server, track.id);
                  return {
                    id: track.id,
                    coverArt: full.coverArt,
                    artist: track.artist ?? full.artist,
                    album: track.album ?? full.album,
                    duration: track.duration ?? full.duration,
                  };
                } catch {
                  return null;
                }
              }),
            );
            const found = patches.filter(
              (patch): patch is NonNullable<typeof patch> => Boolean(patch),
            );
            if (found.length === 0) continue;
            set((state) => ({
              queueState: applyTrackPatches(state.queueState, found),
            }));
          }
        })();
      };

      const topUpRadio = async (): Promise<boolean> => {
        if (radioPending) return radioPending;
        if (isOfflineNow()) return false;
        const server = useAuthStore.getState().server;
        if (!server) return false;

        radioPending = (async () => {
          try {
            const excluded = await ensureExcludedSongIds(server);
            const known = new Set(get().queueState.queue.map((track) => track.id));
            const page = await getRandomSongs(server, { size: RADIO_BATCH });
            const allowed = filterExcludedSongs(page, excluded);
            const fresh = allowed.filter((track) => !known.has(track.id));
            if (fresh.length === 0) return false;
            set((state) => ({
              queueState: queueReducer(state.queueState, {
                type: 'enqueue',
                tracks: fresh,
              }),
            }));
            return true;
          } catch (error) {
            logger.warn('Radio top-up failed', { error });
            return false;
          } finally {
            radioPending = null;
          }
        })();

        return radioPending;
      };

      const apply = async (action: QueueAction) => {
        const before = selectCurrentTrack(get().queueState);
        const nextState = queueReducer(get().queueState, action);
        const after = selectCurrentTrack(nextState);
        set({ queueState: nextState });
        if (
          action.type === 'next' ||
          action.type === 'advance' ||
          action.type === 'previous' ||
          action.type === 'jump'
        ) {
          if (after) {
            await loadCurrent();
          } else {
            const cast = get().castTarget;
            if (cast) {
              stopCastPolling();
              set({ castTarget: null });
              void dlnaStop(cast).catch(() => undefined);
            }
            await audioEngine.pause();
            set({ status: 'ended' });
          }
          return;
        }
        if (before?.id !== after?.id) {
          await loadCurrent();
        }
      };

      return {
        queueState: emptyQueue,
        status: 'idle',
        position: 0,
        duration: 0,
        buffered: 0,
        volume: 1,
        error: null,
        seekRevision: 0,
        radioMode: false,
        castTarget: null,

        castTo: async (renderer) => {
          const track = selectCurrentTrack(get().queueState);
          if (!track) return;
          if (isOfflineNow()) {
            set({ error: 'Casting needs a network connection.' });
            return;
          }
          stopCastPolling();
          set({ castTarget: renderer, status: 'loading', error: null });
          try {
            await audioEngine.pause();
            const source = sourceFor(track, { remote: true });
            await dlnaPlaySource(renderer, source);
            markPlay(track);
            set({
              status: 'playing',
              position: 0,
              duration: source.duration ?? 0,
              seekRevision: get().seekRevision + 1,
            });
            startCastPolling(renderer);
          } catch {
            stopCastPolling();
            set({
              castTarget: null,
              status: 'paused',
              error: 'The speaker did not accept the stream.',
            });
          }
        },

        stopCast: async () => {
          const target = get().castTarget;
          const position = get().position;
          stopCastPolling();
          set({ castTarget: null, status: 'loading' });
          if (target) {
            try {
              await dlnaStop(target);
            } catch {
              // The renderer may already be offline.
            }
          }
          const track = selectCurrentTrack(get().queueState);
          if (!track) {
            set({ status: 'idle' });
            return;
          }
          try {
            // Reload locally so play/pause and the queue index agree again.
            await audioEngine.load(sourceFor(track));
            if (position > 0) await audioEngine.seek(position).catch(() => undefined);
            await audioEngine.pause();
            const audio = await audioEngine.getState();
            set({
              status: 'paused',
              position: audio.position || position,
              duration: audio.duration || track.duration || 0,
            });
          } catch {
            set({ status: 'paused', position });
          }
        },

        playTracks: async (tracks, startIndex = 0) => {
          if (tracks.length === 0) return;
          set({
            radioMode: false,
            queueState: queueReducer(get().queueState, {
              type: 'play',
              tracks,
              startIndex,
            }),
          });
          await loadCurrent();
        },

        refreshSources: async () => {
          if (sourceRefresh) return sourceRefresh;
          sourceRefresh = (async () => {
            const state = get();
            const track = selectCurrentTrack(state.queueState);
            if (!track || state.castTarget) return;
            if (state.status !== 'playing' && state.status !== 'paused') return;
            const server = useAuthStore.getState().server;
            if (!server || !isServerUsable(server)) return;

            const engineState = await audioEngine.getState().catch(() => null);
            const position =
              engineState && Number.isFinite(engineState.position)
                ? engineState.position
                : state.position;
            const shouldPlay = state.status === 'playing';
            try {
              if (audioEngine.setQueue) {
                await audioEngine.setQueue(
                  state.queueState.queue.map((item) => sourceFor(item)),
                  state.queueState.index,
                );
              } else {
                await audioEngine.load(sourceFor(track));
              }
              await audioEngine.seek(position);
              if (shouldPlay) await audioEngine.play();
              else await audioEngine.pause();
              set((current) => ({
                status: shouldPlay ? 'playing' : 'paused',
                position,
                seekRevision: current.seekRevision + 1,
              }));
            } catch (error) {
              logger.warn('Could not refresh audio sources after a server change', {
                error,
              });
              set({ status: 'error', error: 'Could not reconnect the audio stream.' });
            }
          })().finally(() => {
            sourceRefresh = null;
          });
          return sourceRefresh;
        },

        playShuffled: async (tracks) => {
          if (tracks.length === 0) return false;
          let allowed = tracks;
          const server = useAuthStore.getState().server;
          if (server) {
            try {
              const excluded = isOfflineNow()
                ? await getExcludedSongIds(server)
                : await loadShuffleExclusions(server);
              allowed = filterExcludedSongs(tracks, excluded);
            } catch (error) {
              logger.warn('Could not load shuffle exclusions', { error });
            }
          }
          if (allowed.length === 0) return false;
          await get().playTracks(shuffled(allowed), 0);
          return true;
        },

        playRandom: async () => {
          const server = useAuthStore.getState().server;
          if (!server) return false;
          if (isOfflineNow()) {
            const tracks = downloadedTracks(useOfflineStore.getState().index);
            if (!tracks.length) return false;
            set({
              radioMode: false,
              queueState: queueReducer(get().queueState, {
                type: 'play',
                tracks: shuffled(tracks),
                startIndex: 0,
              }),
            });
            await loadCurrent();
            return true;
          }
          try {
            const excluded = await loadShuffleExclusions(server);
            const page = await getRandomSongs(server, { size: 100 });
            const unique = new Map(page.map((track) => [track.id, track]));
            const songs = filterExcludedSongs([...unique.values()], excluded);
            if (songs.length === 0) return false;
            set({
              radioMode: true,
              queueState: queueReducer(get().queueState, {
                type: 'play',
                tracks: songs,
                startIndex: 0,
              }),
            });
            await loadCurrent();
            return true;
          } catch (error) {
            logger.warn('Shuffle-all failed', { error });
            return false;
          }
        },

        play: async () => {
          const cast = get().castTarget;
          if (cast) {
            try {
              if (
                get().status === 'idle' ||
                get().status === 'ended' ||
                get().status === 'error'
              ) {
                await loadCurrent();
                return;
              }
              await dlnaPlay(cast);
              set({ status: 'playing', error: null });
              startCastPolling(cast);
            } catch {
              set({ status: 'error', error: 'The speaker did not resume.' });
            }
            return;
          }
          try {
            if (get().status === 'idle' || get().status === 'ended' || get().status === 'error') {
              await loadCurrent();
              return;
            }
            await audioEngine.play();
            set({ status: 'playing', error: null });
          } catch (error) {
            set({ status: 'error', error: error instanceof Error ? error.message : 'Playback failed' });
          }
        },

        pause: async () => {
          const cast = get().castTarget;
          if (cast) {
            try {
              await dlnaPause(cast);
            } catch {
              // Ignore a renderer that disappeared; the UI is already paused.
            }
            set({ status: 'paused' });
            return;
          }
          await audioEngine.pause();
          set({ status: 'paused' });
        },

        stop: async () => {
          // Segue `stop` leaves the player idle, not paused mid-track.
          const cast = get().castTarget;
          if (cast) {
            stopCastPolling();
            set({ castTarget: null });
            try {
              await dlnaStop(cast);
            } catch {
              // The speaker may already be gone.
            }
          }
          try {
            await audioEngine.pause();
            await audioEngine.seek(0);
          } catch {
            // Keep the queue; the engine may be between tracks.
          }
          set({ status: 'idle', position: 0, error: null });
        },

        toggle: async () => {
          if (get().status === 'playing') await get().pause();
          else await get().play();
        },

        next: async () => {
          await apply({ type: 'next' });
        },

        previous: async () => {
          await apply({ type: 'previous' });
        },

        jump: async (index) => {
          await apply({ type: 'jump', index });
        },

        seek: async (position) => {
          const target = safeSeekTime(position, get().duration);
          const cast = get().castTarget;
          if (cast) {
            try {
              await dlnaSeek(cast, target);
              set((state) => ({ position: target, seekRevision: state.seekRevision + 1 }));
            } catch {
              set({ error: 'The speaker could not seek.' });
            }
            return;
          }
          await audioEngine.seek(target);
          set((state) => ({ position: target, seekRevision: state.seekRevision + 1 }));
        },

        setVolume: async (volume) => {
          const clamped = Math.max(0, Math.min(1, volume));
          const cast = get().castTarget;
          if (cast) {
            set({ volume: clamped });
            try {
              await dlnaSetVolume(cast, clamped);
            } catch {
              // Some renderers do not expose RenderingControl.
            }
            return;
          }
          await audioEngine.setVolume(clamped);
          set({ volume: clamped });
        },

        addToQueue: (tracks, mode = 'end') => {
          const playable = isOfflineNow()
            ? tracks.filter((track) => Boolean(useOfflineStore.getState().localUri(track.id)))
            : tracks;
          if (playable.length === 0) return;
          const action: QueueAction =
            mode === 'next' ? { type: 'playNext', tracks: playable } : { type: 'enqueue', tracks: playable };
          set({ queueState: queueReducer(get().queueState, action) });
        },

        moveToUpNext: (index) => {
          set({ queueState: queueReducer(get().queueState, { type: 'moveToUpNext', index }) });
        },

        removeAt: (index) => {
          set({ queueState: queueReducer(get().queueState, { type: 'remove', index }) });
        },

        trashTrack: async (index) => {
          const state = get().queueState;
          const track = state.queue[index];
          if (!track) return { ok: false, reason: 'not-found' };

          const server = useAuthStore.getState().server;
          if (!server) return { ok: false, reason: 'failed', message: 'Not signed in.' };
          if (isOfflineNow()) return { ok: false, reason: 'offline' };

          const playlistId =
            useSettingsStore.getState().trashPlaylistIds[serverKey(server)];
          if (!playlistId) return { ok: false, reason: 'no-playlist' };

          let addedToPlaylist = false;
          try {
            const playlist = await getPlaylist(server, playlistId);
            if (!(playlist.songs ?? []).some((item) => item.id === track.id)) {
              await updatePlaylist(server, playlistId, { songIdToAdd: track.id });
              addedToPlaylist = true;
            }
          } catch (error) {
            logger.warn('Could not add track to the trash playlist', { error });
            return {
              ok: false,
              reason: 'failed',
              message: 'Could not update the trash playlist.',
            };
          }

          const undo = createTrashUndo(
            state,
            track,
            server,
            playlistId,
            addedToPlaylist,
          );
          let warning: string | undefined;

          if (state.index === index) {
            try {
              await get().next();
            } catch (error) {
              logger.warn('Could not skip the trashed track', { error });
            }
          }

          // The native queue is only an OS-facing mirror. Remove the trashed
          // entries in place: reloading the whole queue here restarted the
          // current track and paused the one `next()` had just started.
          // Positions are read after the skip so an Up next insertion is
          // already reflected; highest first keeps the other indexes valid.
          const enginePositions = get().queueState.queue.reduce<number[]>(
            (positions, item, position) => {
              if (item.id === track.id) positions.push(position);
              return positions;
            },
            [],
          );
          set((current) => ({
            queueState: removeTrackEverywhere(current.queueState, track.id),
          }));
          if (audioEngine.removeQueueItem) {
            for (const position of enginePositions.reverse()) {
              try {
                await audioEngine.removeQueueItem(position, track.id);
              } catch (error) {
                logger.warn('Could not remove the trashed track from the native queue', {
                  error,
                });
              }
            }
          }
          if (get().queueState.queue.length === 0) {
            set({ status: 'idle', position: 0, duration: 0, buffered: 0 });
          }

          // Delete the local copy only after playback has moved off it.
          if (track.starred) {
            try {
              await star(server, track.id, { remove: true });
              await useOfflineStore
                .getState()
                .removeCollectionTrack(FAVOURITES_COLLECTION.id, track.id);
              await queryClient.invalidateQueries({ queryKey: queryKeys.starred(server) });
            } catch (error) {
              logger.warn('Could not remove the track from favourites', { error });
              warning = 'The favourite could not be removed.';
            }
          }

          try {
            const offline = useOfflineStore.getState();
            if (offline.isDownloaded(track.id)) await offline.removeTrack(track.id);
          } catch (error) {
            logger.warn('Could not delete the downloaded track', { error });
            warning = warning ?? 'The download could not be deleted.';
          }

          invalidatePlaylistQueries();
          return { ok: true, undo, warning };
        },

        undoTrash: async (undo) => {
          let warning: string | undefined;
          if (undo.addedToPlaylist) {
            try {
              const playlist = await getPlaylist(undo.server, undo.playlistId);
              const songIndex = (playlist.songs ?? [])
                .map((item) => item.id)
                .lastIndexOf(undo.track.id);
              if (songIndex >= 0) {
                await updatePlaylist(undo.server, undo.playlistId, {
                  songIndexToRemove: songIndex,
                });
              }
              invalidatePlaylistQueries();
              void refreshExcludedSongIds(undo.server).catch((error) =>
                logger.warn('Could not refresh shuffle exclusions after undo', { error }),
              );
            } catch (error) {
              logger.warn('Could not remove the track from the trash playlist', { error });
              warning = 'The trash playlist could not be updated.';
            }
          }

          set((current) => ({
            queueState: restoreTrackEverywhere(current.queueState, undo),
          }));
          return { ok: true, warning };
        },

        move: (from, to) => {
          set({ queueState: queueReducer(get().queueState, { type: 'move', from, to }) });
        },

        reorder: (tracks) => {
          set({ queueState: queueReducer(get().queueState, { type: 'reorder', queue: tracks }) });
        },

        applyRemoteQueue: async (transfer, play) => {
          if (transfer.tracks.length === 0) return;
          if (get().castTarget) await get().stopCast();
          const queueState: QueueState = {
            queue: transfer.tracks,
            index: Math.min(Math.max(0, transfer.index), transfer.tracks.length - 1),
            upNext: [],
            originalQueue: transfer.originalQueue,
            repeat: transfer.repeat,
            shuffle: transfer.shuffle,
          };
          set({ queueState });
          hydrateRemoteCovers(transfer.tracks);
          const current = selectCurrentTrack(queueState);
          if (!current) return;
          const seconds = Math.max(0, transfer.positionMs / 1000);
          try {
            if (audioEngine.setQueue) {
              await audioEngine.setQueue(queueState.queue.map((item) => sourceFor(item)), queueState.index);
            } else {
              await audioEngine.load(sourceFor(current));
            }
            markPlay(current);
            await audioEngine.seek(seconds);
            if (play) await audioEngine.play();
            else await audioEngine.pause();
            set((state) => ({
              position: seconds,
              seekRevision: state.seekRevision + 1,
              status: play ? 'playing' : 'paused',
              error: null,
            }));
          } catch (error) {
            set({
              status: 'error',
              error: error instanceof Error ? error.message : 'Could not load the transferred queue',
            });
          }
        },

        clear: () => {
          const cast = get().castTarget;
          if (cast) {
            stopCastPolling();
            set({ castTarget: null });
            void dlnaStop(cast).catch(() => undefined);
          }
          void audioEngine.pause();
          set({
            queueState: queueReducer(get().queueState, { type: 'clear' }),
            status: 'idle',
            radioMode: false,
          });
        },

        cycleRepeat: () => {
          const current = get().queueState.repeat;
          const order: RepeatMode[] = ['off', 'all', 'one'];
          const next = order[(order.indexOf(current) + 1) % order.length] ?? 'off';
          set({ queueState: queueReducer(get().queueState, { type: 'setRepeat', repeat: next }) });
        },

        toggleShuffle: () => {
          set({ queueState: queueReducer(get().queueState, { type: 'toggleShuffle' }) });
        },

        _apply: apply,

        _topUpRadio: topUpRadio,

        _handleAutoAdvance: (mediaId) => {
          const state = get().queueState;
          const nextState = queueReducer(state, { type: 'advance' });
          const nextTrack = selectCurrentTrack(nextState);
          if (
            mediaId &&
            nextTrack?.id === mediaId &&
            state.repeat !== 'one' &&
            state.upNext.length === 0 &&
            (!isOfflineNow() || Boolean(useOfflineStore.getState().localUri(nextTrack.id)))
          ) {
            // Native playback is already on the right track; just move the UI
            // and scrobble without reloading the source (keeps it gapless).
            set({ queueState: nextState });
            markPlay(nextTrack);
            void audioEngine.play();
            return;
          }
          void apply({ type: 'advance' });
        },

        _syncFromEngine: (state) => {
          // While casting, the local engine is deliberately paused and the
          // renderer poll owns status/progress.
          if (get().castTarget) return;
          // A Segue `stop` sets idle at position 0; the local pause/seek events
          // that follow must not turn it back into a paused track.
          if (get().status === 'idle' && state.status === 'paused' && state.position < 0.01) {
            return;
          }
          set({
            status: state.status,
            position: state.position,
            duration: state.duration,
            buffered: state.buffered,
            error: state.error ?? null,
          });
          if (state.status === 'ended') {
            if (isOfflineNow()) {
              void get()._apply({ type: 'advance' });
              return;
            }
            const repeat = get().queueState.repeat;
            if (repeat === 'one') {
              submitScrobble();
              const current = selectCurrentTrack(get().queueState);
              if (current) markPlay(current);
              void audioEngine.seek(0).then(() => audioEngine.play());
            } else {
              // Keep going with random library songs only when radio-on-end is
              // enabled, still respecting the #<user>-exclusive playlists.
              if (
                get().radioMode ||
                useSettingsStore.getState().continueWithRadio
              ) {
                const oldLength = get().queueState.queue.length;
                void topUpRadio().then((added) => {
                  if (added) void get().jump(oldLength);
                  else void get()._apply({ type: 'advance' });
                });
              } else {
                void get()._apply({ type: 'advance' });
              }
            }
            return;
          }

          if (
            state.status === 'playing' &&
            get().radioMode &&
            get().queueState.queue.length - get().queueState.index <= RADIO_LOW_WATER
          ) {
            void topUpRadio();
          }
        },
      };
    },
    {
      name: 'laila.player',
      storage,
      // Unversioned data (version 0) has the same queue/volume shape.
      version: 1,
      migrate: (persisted) => persisted as PlayerState,
      partialize: (state) => ({
        queueState: state.queueState,
        volume: state.volume,
      }),
      // Do not load the persisted queue into the audio engine on launch. On
      // Android the native player can still carry playWhenReady=true from the
      // previous process, which made a track start with no input. The queue is
      // restored in the UI; the first play loads and seeks it explicitly.
      // Also stop any orphaned native playback before the UI reports state.
      onRehydrateStorage: () => () => {
        void audioEngine
          .pause()
          .then(() => logger.debug('Paused the audio engine on player rehydrate'))
          .catch(() => undefined);
      },
    },
  ),
);

export function useCurrentTrack(): Track | undefined {
  return usePlayerStore((state) => selectCurrentTrack(state.queueState));
}
