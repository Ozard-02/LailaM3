import { requireOptionalNativeModule } from 'expo-modules-core';

export interface LailaQueueItem {
  id: string;
  url: string;
  headers?: Record<string, string>;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  artworkHeaders?: Record<string, string>;
  duration?: number;
  mimeType?: string;
}

export interface LailaSnapshot {
  state: 'idle' | 'buffering' | 'ready' | 'ended';
  playing: boolean;
  position: number;
  duration: number;
  buffered: number;
  error: string | null;
}

export interface LailaErrorEvent {
  code: string;
  message: string;
}

export interface LailaPlayerEvents {
  onState: (snapshot: LailaSnapshot) => void;
  onAutoAdvance: (event: { mediaId?: string }) => void;
  onRemoteNext: () => void;
  onRemotePrevious: () => void;
  onError: (event: LailaErrorEvent) => void;
}

type Subscription = { remove: () => void };

interface LailaPlayerModule {
  setup(): Promise<void>;
  setQueue(items: LailaQueueItem[], startIndex: number): Promise<void>;
  removeQueueItem(index: number, mediaId: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setPauseOnAutoAdvance(enabled: boolean): Promise<void>;
  setRemoteHandling(enabled: boolean): Promise<void>;
  getSnapshot(): LailaSnapshot;
  destroy(): Promise<void>;
  addListener<K extends keyof LailaPlayerEvents>(
    event: K,
    listener: LailaPlayerEvents[K],
  ): Subscription;
}

const nativeModule = requireOptionalNativeModule<LailaPlayerModule>('LailaPlayer');

/** Android-only native Media3 playback bridge. Null in Expo Go and on web. */
export const lailaPlayer = nativeModule;
