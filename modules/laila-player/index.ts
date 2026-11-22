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

export type LailaAutoAdvanceReason = 'auto' | 'repeat';

export interface LailaPlayerEvents {
  onState: (snapshot: LailaSnapshot) => void;
  onAutoAdvance: (event: {
    mediaId?: string;
    index?: number;
    reason?: LailaAutoAdvanceReason;
  }) => void;
  onRemoteNext: () => void;
  onRemotePrevious: () => void;
  onError: (event: LailaErrorEvent) => void;
}

type Subscription = { remove: () => void };

interface LailaPlayerModule {
  setup(): Promise<void>;
  setQueue(items: LailaQueueItem[], startIndex: number): Promise<void>;
  removeQueueItem(index: number, mediaId: string): Promise<void>;
  /** Align the native queue without reloading the active item. */
  syncQueue(items: LailaQueueItem[], activeIndex: number): Promise<void>;
  /** Skip to an item when that id still sits at the index. */
  skipToIndex(index: number, mediaId: string): Promise<boolean>;
  setRepeatMode(mode: 'off' | 'all' | 'one'): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
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
