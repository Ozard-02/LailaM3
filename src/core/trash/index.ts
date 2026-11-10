import type { ServerConfig, Track } from '../models';
import { currentTrack, type QueueState } from '../queue/reducer';

/**
 * Everything needed to undo one trash action without touching playback.
 * Positions are captured before the track is removed so it can be restored
 * close to where it was in the queue.
 */
export interface TrashUndo {
  track: Track;
  server: ServerConfig;
  playlistId: string;
  queuePositions: number[];
  upNextPositions: number[];
  originalQueuePositions: number[];
  /** False when the track was already in the playlist before this action. */
  addedToPlaylist: boolean;
}

export type TrashFailure = 'no-playlist' | 'offline' | 'not-found' | 'failed';

export type TrashOutcome =
  | { ok: true; undo: TrashUndo; warning?: string }
  | { ok: false; reason: TrashFailure; message?: string };

export interface TrashUndoResult {
  ok: boolean;
  warning?: string;
}

function positionsOf(tracks: Track[], trackId: string): number[] {
  const positions: number[] = [];
  tracks.forEach((track, index) => {
    if (track.id === trackId) positions.push(index);
  });
  return positions;
}

export function createTrashUndo(
  state: QueueState,
  track: Track,
  server: ServerConfig,
  playlistId: string,
  addedToPlaylist = true,
): TrashUndo {
  return {
    track,
    server,
    playlistId,
    queuePositions: positionsOf(state.queue, track.id),
    upNextPositions: positionsOf(state.upNext, track.id),
    originalQueuePositions: state.originalQueue
      ? positionsOf(state.originalQueue, track.id)
      : [],
    addedToPlaylist,
  };
}

function insertAt(tracks: Track[], track: Track, positions: number[]): Track[] {
  const next = [...tracks];
  const unique = [...new Set(positions)].sort((a, b) => a - b);
  for (const position of unique) {
    next.splice(Math.max(0, Math.min(position, next.length)), 0, track);
  }
  return next;
}

/** Removes every occurrence of a track from queue, up next and original order. */
export function removeTrackEverywhere(state: QueueState, trackId: string): QueueState {
  const currentId = currentTrack(state)?.id;
  const queue = state.queue.filter((track) => track.id !== trackId);
  const upNext = state.upNext.filter((track) => track.id !== trackId);
  const originalQueue = state.originalQueue
    ? state.originalQueue.filter((track) => track.id !== trackId)
    : null;

  const at = currentId ? queue.findIndex((track) => track.id === currentId) : -1;
  const index = queue.length === 0 ? -1 : at >= 0 ? at : Math.min(state.index, queue.length);

  return { ...state, queue, upNext, originalQueue, index };
}

/** Puts the trashed track back without changing which track is playing. */
export function restoreTrackEverywhere(state: QueueState, undo: TrashUndo): QueueState {
  const currentId = currentTrack(state)?.id;
  const queue = insertAt(state.queue, undo.track, undo.queuePositions);
  const upNext = insertAt(state.upNext, undo.track, undo.upNextPositions);
  const originalQueue = state.originalQueue
    ? insertAt(state.originalQueue, undo.track, undo.originalQueuePositions)
    : null;

  let index: number;
  if (currentId) {
    const at = queue.findIndex((track) => track.id === currentId);
    index = at >= 0 ? at : Math.min(state.index, queue.length);
  } else if (state.index >= state.queue.length) {
    // Keep the "ended" marker after the restored queue.
    index = queue.length;
  } else {
    index = Math.min(state.index, queue.length);
  }

  return { ...state, queue, upNext, originalQueue, index };
}
