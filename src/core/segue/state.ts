import type { Track } from '../models';
import type { QueueState, RepeatMode } from '../queue/reducer';
import type { SeguePlayerState, SegueQueueItem } from './types';

export interface TransferState {
  tracks: Track[];
  index: number;
  repeat: RepeatMode;
  shuffle: boolean;
  originalQueue: Track[] | null;
  positionMs: number;
  dropped: number;
}

function toItem(track: Track): SegueQueueItem {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.duration ? Math.round(track.duration * 1000) : undefined,
    coverArt: track.coverArt,
  };
}

export function toSegueState(
  queue: QueueState,
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error',
  positionSeconds: number,
  volume: number,
): SeguePlayerState {
  const playing = status === 'playing';
  const stopped = queue.queue.length === 0 || status === 'idle';
  const state: SeguePlayerState = {
    status: stopped ? 'stopped' : playing ? 'playing' : 'paused',
    positionMs: Math.max(0, Math.round(positionSeconds * 1000)),
    index: queue.index >= 0 ? queue.index : undefined,
    volume: Math.round(Math.max(0, Math.min(1, volume)) * 100),
    repeat: queue.repeat,
    shuffle: queue.shuffle,
    queue: queue.queue.map(toItem),
  };

  if (queue.shuffle && queue.originalQueue) {
    // O(n) instead of O(n²): index the original order once.
    const positions = new Map<string, number>();
    queue.originalQueue.forEach((item, at) => positions.set(item.id, at));
    const order = queue.queue.map((track) => positions.get(track.id) ?? -1);
    if (order.every((value) => value >= 0)) state.order = order;
  }

  return state;
}

export function fromSegueState(state: SeguePlayerState): TransferState {
  const items = state.queue ?? [];
  const tracks: Track[] = [];
  const keptIndexes: number[] = [];

  items.forEach((item, index) => {
    if (!item.id) return;
    tracks.push({
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.durationMs ? item.durationMs / 1000 : undefined,
      coverArt: item.coverArt,
    });
    keptIndexes.push(index);
  });

  const wanted = state.index ?? 0;
  const keptAt = keptIndexes.indexOf(wanted);
  const index = keptAt >= 0 ? keptAt : Math.min(tracks.length - 1, Math.max(0, wanted));

  let originalQueue: Track[] | null = null;
  if (state.shuffle && state.order && state.order.length === items.length) {
    const original: (Track | undefined)[] = new Array(tracks.length);
    keptIndexes.forEach((originalIndex, kept) => {
      const place = state.order?.[originalIndex];
      const track = tracks[kept];
      if (typeof place === 'number' && place >= 0 && track) original[place] = track;
    });
    const filled = original.filter((track): track is Track => Boolean(track));
    if (filled.length === tracks.length) originalQueue = filled;
  }

  return {
    tracks,
    index,
    repeat: state.repeat ?? 'off',
    shuffle: Boolean(state.shuffle),
    originalQueue,
    positionMs: Math.max(0, state.positionMs ?? 0),
    dropped: items.length - tracks.length,
  };
}
