export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

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
   * remains the source of truth for repeat, shuffle and up-next.
   */
  setAutoAdvanceHandler?: (
    handler: (mediaId?: string) => void | Promise<void>,
  ) => () => void;
  destroy(): Promise<void>;
}
