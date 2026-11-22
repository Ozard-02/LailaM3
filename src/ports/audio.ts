export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export type AudioRepeatMode = 'off' | 'all' | 'one';

/**
 * Whether the store accepts a transition the native player already made, or
 * takes over and drives playback itself.
 */
export type AutoAdvanceDecision = 'keep' | 'takeover';

export interface AutoAdvanceTransition {
  mediaId?: string;
  index?: number;
  reason?: 'auto' | 'repeat';
}

export interface AudioSource {
  id: string;
  url: string;
  /** Extra headers for native players (reverse proxies). Web audio cannot set these. */
  headers?: Record<string, string>;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  artworkHeaders?: Record<string, string>;
  duration?: number;
  /** Explicit MIME type; stream URLs have no file extension. */
  mimeType?: string;
}

export interface AudioState {
  status: AudioStatus;
  position: number;
  duration: number;
  buffered: number;
  error?: string;
}

export type AudioListener = (state: AudioState) => void;

/** Transport presses coming from the OS media session / notification. */
export interface AudioRemoteHandlers {
  next?: () => void | Promise<void>;
  previous?: () => void | Promise<void>;
}

export interface AudioEngine {
  load(source: AudioSource): Promise<void>;
  /** Optional: load several items so the OS sees next/previous availability. */
  setQueue?: (sources: AudioSource[], startIndex: number) => Promise<void>;
  /**
   * Optional: drop one item from the OS queue without reloading the current
   * track. `mediaId` guards against a stale native queue: the item is only
   * removed when that id still sits at the index.
   */
  removeQueueItem?: (index: number, mediaId: string) => Promise<void>;
  /**
   * Optional: align the OS-facing queue with the store's effective queue
   * (queue order with Up Next spliced after the current track) without
   * reloading the item that is currently playing.
   */
  syncQueue?: (sources: AudioSource[], activeIndex: number) => Promise<void>;
  /**
   * Optional: skip to an index in the native queue when that item still has
   * the expected media id. Returns false so the caller can fall back to a
   * full reload when the native queue is stale.
   */
  skipToIndex?: (index: number, mediaId: string) => Promise<boolean>;
  /** Optional: mirror Laila's repeat mode onto the native player. */
  setRepeatMode?: (mode: AudioRepeatMode) => Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(position: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getState(): Promise<AudioState>;
  subscribe(listener: AudioListener): () => void;
  /** Optional: engines that expose OS media controls can route them here. */
  setRemoteHandlers?: (handlers: AudioRemoteHandlers) => () => void;
  /**
   * Optional: called when the OS/native queue advances on its own. The store
   * remains the source of truth for repeat, shuffle and up-next. The handler
   * runs synchronously before the engine decides whether to pause, so a
   * `keep` answer lets the native player continue without a gap.
   */
  setAutoAdvanceHandler?: (
    handler: (transition: AutoAdvanceTransition) => AutoAdvanceDecision,
  ) => () => void;
  destroy(): Promise<void>;
}
