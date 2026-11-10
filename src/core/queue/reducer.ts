import type { Track } from '../models';

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueState {
  queue: Track[];
  /** Index into queue. -1 when empty; queue.length means "ended". */
  index: number;
  upNext: Track[];
  originalQueue: Track[] | null;
  repeat: RepeatMode;
  shuffle: boolean;
}

export type QueueAction =
  | { type: 'play'; tracks: Track[]; startIndex?: number }
  | { type: 'replace'; state: QueueState }
  | { type: 'enqueue'; tracks: Track[] }
  | { type: 'playNext'; tracks: Track[] }
  | { type: 'moveToUpNext'; index: number }
  | { type: 'next' }
  | { type: 'advance' }
  | { type: 'previous' }
  | { type: 'jump'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'reorder'; queue: Track[] }
  | { type: 'clear' }
  | { type: 'setRepeat'; repeat: RepeatMode }
  | { type: 'toggleShuffle' }
  | { type: 'setVolume' };

export const emptyQueue: QueueState = {
  queue: [],
  index: -1,
  upNext: [],
  originalQueue: null,
  repeat: 'off',
  shuffle: false,
};

export function currentTrack(state: QueueState): Track | undefined {
  if (state.index < 0 || state.index >= state.queue.length) return undefined;
  return state.queue[state.index];
}

export type TrackPatch = Partial<Omit<Track, 'id'>> & { id: string };

/**
 * Applies freshly fetched metadata to every copy of a track in the queue.
 * `originalQueue` must be patched too: unshuffling restores it, and stale
 * entries without `coverArt` would lose their artwork.
 */
export function applyTrackPatches(state: QueueState, patches: TrackPatch[]): QueueState {
  if (patches.length === 0) return state;
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  let changed = false;

  const apply = (tracks: Track[]): Track[] => {
    let next: Track[] | null = null;
    tracks.forEach((track, index) => {
      const patch = byId.get(track.id);
      if (!patch) return;
      if (!next) next = [...tracks];
      next[index] = { ...track, ...patch };
      changed = true;
    });
    return next ?? tracks;
  };

  const queue = apply(state.queue);
  const upNext = apply(state.upNext);
  const originalQueue = state.originalQueue ? apply(state.originalQueue) : null;
  if (!changed) return state;
  return { ...state, queue, upNext, originalQueue };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return Math.max(0, Math.min(index, length - 1));
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a !== undefined && b !== undefined) {
      copy[i] = b;
      copy[j] = a;
    }
  }
  return copy;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  if (item === undefined) return items;
  copy.splice(to, 0, item);
  return copy;
}

function indexOfId(tracks: Track[], id: string | undefined): number {
  if (!id) return -1;
  return tracks.findIndex((track) => track.id === id);
}

function advanceQueue(state: QueueState): QueueState {
  if (state.queue.length === 0) return state;

  if (state.upNext.length > 0) {
    const [next, ...rest] = state.upNext;
    if (!next) return state;
    const insertAt = Math.min(state.index + 1, state.queue.length);
    const queue = [...state.queue];
    queue.splice(insertAt, 0, next);
    const originalQueue = state.originalQueue
      ? (() => {
          const copy = [...state.originalQueue];
          const currentId = currentTrack(state)?.id;
          const currentAt = indexOfId(copy, currentId);
          copy.splice(currentAt >= 0 ? currentAt + 1 : copy.length, 0, next);
          return copy;
        })()
      : null;
    return { ...state, queue, index: insertAt, upNext: rest, originalQueue };
  }

  if (state.index < state.queue.length - 1) {
    return { ...state, index: state.index + 1 };
  }

  if (state.repeat === 'all') {
    return { ...state, index: 0 };
  }

  return { ...state, index: state.queue.length };
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'play': {
      const queue = [...action.tracks];
      if (queue.length === 0) return { ...emptyQueue, repeat: state.repeat };
      const index = clampIndex(action.startIndex ?? 0, queue.length);
      return {
        queue,
        index,
        upNext: [],
        originalQueue: null,
        repeat: state.repeat,
        shuffle: false,
      };
    }

    case 'replace':
      return action.state;

    case 'enqueue': {
      if (action.tracks.length === 0) return state;
      const queue = [...state.queue, ...action.tracks];
      return {
        ...state,
        queue,
        index: state.index < 0 ? 0 : state.index,
        originalQueue: state.originalQueue
          ? [...state.originalQueue, ...action.tracks]
          : null,
      };
    }

    case 'playNext': {
      if (action.tracks.length === 0) return state;
      // Append: "Add to next" puts tracks at the bottom of Up Next, so a
      // track already waiting there still plays first.
      return { ...state, upNext: [...state.upNext, ...action.tracks] };
    }

    case 'moveToUpNext': {
      if (action.index < 0 || action.index >= state.queue.length) return state;
      // The current track is already playing; moving it out of the queue
      // would desynchronise the audio engine from the queue index.
      if (action.index === state.index) return state;

      const moved = state.queue[action.index];
      if (!moved) return state;
      const queue = state.queue.filter((_, i) => i !== action.index);
      const originalQueue = state.originalQueue
        ? state.originalQueue.filter((track) => track.id !== moved.id)
        : null;
      const index = action.index < state.index ? state.index - 1 : state.index;

      if (queue.length === 0) {
        return { ...emptyQueue, repeat: state.repeat, shuffle: state.shuffle, upNext: [...state.upNext, moved] };
      }

      return {
        ...state,
        queue,
        index,
        originalQueue,
        upNext: [...state.upNext, moved],
      };
    }

    case 'next':
      return advanceQueue(state);

    case 'advance':
      return state.repeat === 'one' ? state : advanceQueue(state);

    case 'previous': {
      if (state.queue.length === 0) return state;
      if (state.index > 0) return { ...state, index: state.index - 1 };
      if (state.repeat === 'all') return { ...state, index: state.queue.length - 1 };
      return { ...state, index: 0 };
    }

    case 'jump': {
      if (state.queue.length === 0) return state;
      return { ...state, index: clampIndex(action.index, state.queue.length) };
    }

    case 'remove': {
      if (action.index < 0 || action.index >= state.queue.length) return state;
      const removed = state.queue[action.index];
      const queue = state.queue.filter((_, i) => i !== action.index);
      const originalQueue = state.originalQueue && removed
        ? state.originalQueue.filter((track) => track.id !== removed.id)
        : state.originalQueue;

      if (queue.length === 0) {
        return { ...emptyQueue, repeat: state.repeat, shuffle: state.shuffle };
      }

      let index = state.index;
      if (action.index < state.index) index -= 1;
      if (action.index === state.index && index >= queue.length) index = queue.length - 1;

      return { ...state, queue, index, originalQueue };
    }

    case 'move': {
      if (action.from === action.to) return state;
      const moved = state.queue[action.from];
      if (!moved) return state;

      const queue = moveItem(state.queue, action.from, action.to);
      let originalQueue = state.originalQueue;
      if (originalQueue) {
        const from = indexOfId(originalQueue, moved.id);
        const target = state.queue[action.to];
        const to = target ? indexOfId(originalQueue, target.id) : -1;
        if (from >= 0 && to >= 0) originalQueue = moveItem(originalQueue, from, to);
      }

      const currentId = currentTrack(state)?.id;
      const index = indexOfId(queue, currentId);

      return {
        ...state,
        queue,
        originalQueue,
        index: index >= 0 ? index : state.index,
      };
    }

    case 'reorder': {
      if (action.queue.length === 0) {
        return { ...emptyQueue, repeat: state.repeat };
      }
      const currentId = currentTrack(state)?.id;
      const index = indexOfId(action.queue, currentId);
      return {
        ...state,
        queue: action.queue,
        index: index >= 0 ? index : clampIndex(state.index, action.queue.length),
        originalQueue: state.originalQueue ? action.queue : null,
      };
    }

    case 'clear':
      return { ...emptyQueue, repeat: state.repeat };

    case 'setRepeat':
      return { ...state, repeat: action.repeat };

    case 'toggleShuffle': {
      if (state.shuffle) {
        if (!state.originalQueue) return { ...state, shuffle: false };
        const currentId = currentTrack(state)?.id;
        const index = indexOfId(state.originalQueue, currentId);
        return {
          ...state,
          queue: state.originalQueue,
          originalQueue: null,
          shuffle: false,
          index: index >= 0 ? index : clampIndex(state.index, state.originalQueue.length),
        };
      }

      const current = currentTrack(state);
      const rest = state.queue.filter((track) => track.id !== current?.id);
      const queue = current ? [current, ...shuffled(rest)] : shuffled(state.queue);
      return {
        ...state,
        queue,
        originalQueue: state.queue,
        shuffle: true,
        index: queue.length > 0 ? 0 : -1,
      };
    }

    default:
      return state;
  }
}
