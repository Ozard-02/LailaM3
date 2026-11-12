import type {
  AudioEngine,
  AudioListener,
  AudioRemoteHandlers,
  AudioSource,
  AudioState,
  AudioStatus,
} from '@/ports/audio';
import {
  lailaPlayer,
  type LailaQueueItem,
  type LailaSnapshot,
} from '../../../modules/laila-player';

const POLL_MS = 500;

function toQueueItem(source: AudioSource): LailaQueueItem {
  return {
    id: source.id,
    url: source.url,
    headers: source.headers,
    title: source.title,
    artist: source.artist,
    album: source.album,
    artwork: source.artwork,
    artworkHeaders: source.artworkHeaders,
    duration: source.duration,
    mimeType: source.mimeType,
  };
}

function headersKey(headers: Record<string, string> | undefined): string {
  if (!headers) return '';
  return Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

function sourceKey(sources: AudioSource[]): string {
  return sources
    .map((source) => `${source.id}\u0000${source.url}\u0000${headersKey(source.headers)}`)
    .join('\u0001');
}

function mapStatus(snapshot: LailaSnapshot, error: string | undefined): AudioStatus {
  if (error || snapshot.error) return 'error';
  if (snapshot.state === 'buffering') return 'loading';
  if (snapshot.state === 'ended') return 'ended';
  if (snapshot.state === 'ready') return snapshot.playing ? 'playing' : 'paused';
  return 'idle';
}

export class NativeAudioEngine implements AudioEngine {
  private listeners = new Set<AudioListener>();
  private subscriptions: { remove: () => void }[] = [];
  private setupPromise: Promise<void> | null = null;
  private sources: AudioSource[] = [];
  private queueKey = '';
  private lastIndex = 0;
  private lastError: string | undefined;
  private pendingSeek: number | null = null;
  private remoteHandlers: AudioRemoteHandlers | null = null;
  private autoAdvanceHandler: ((mediaId?: string) => void | Promise<void>) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  private get nativePlayer() {
    if (!lailaPlayer) throw new Error('Media3 playback is not available in this build');
    return lailaPlayer;
  }

  private snapshot(): AudioState {
    if (!lailaPlayer) {
      return {
        status: this.lastError ? 'error' : 'idle',
        position: 0,
        duration: 0,
        buffered: 0,
        error: this.lastError,
      };
    }
    const raw = lailaPlayer.getSnapshot();
    const error = this.lastError ?? raw.error ?? undefined;
    return {
      status: mapStatus(raw, error),
      position: raw.position,
      duration: raw.duration,
      buffered: raw.buffered,
      error,
    };
  }

  private emit(): void {
    if (this.disposed) return;
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
  }

  private ensureListeners(): void {
    if (this.subscriptions.length > 0 || !lailaPlayer) return;
    this.subscriptions = [
      lailaPlayer.addListener('onState', () => {
        this.flushPendingSeek();
        this.emit();
      }),
      lailaPlayer.addListener('onAutoAdvance', ({ mediaId }) => {
        const index = mediaId
          ? this.sources.findIndex((source) => source.id === mediaId)
          : -1;
        if (index >= 0) this.lastIndex = index;
        this.emit();
        void this.autoAdvanceHandler?.(mediaId);
      }),
      lailaPlayer.addListener('onRemoteNext', () => {
        void this.remoteHandlers?.next?.();
      }),
      lailaPlayer.addListener('onRemotePrevious', () => {
        void this.remoteHandlers?.previous?.();
      }),
      lailaPlayer.addListener('onError', ({ message }) => {
        this.lastError = message;
        this.emit();
      }),
    ];
  }

  private isReady(): boolean {
    if (!lailaPlayer) return false;
    const state = lailaPlayer.getSnapshot().state;
    return state === 'ready' || state === 'ended';
  }

  private flushPendingSeek(): void {
    if (this.pendingSeek === null || !this.isReady()) return;
    const position = this.pendingSeek;
    this.pendingSeek = null;
    void this.nativePlayer.seekTo(position);
  }

  private async waitForReady(timeoutMs = 1200): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !this.isReady()) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async ensureSetup(): Promise<void> {
    if (!lailaPlayer) throw new Error('Media3 playback is not available in this build');
    this.ensureListeners();
    if (!this.setupPromise) {
      this.setupPromise = (async () => {
        await lailaPlayer.setup();
        await lailaPlayer.setPauseOnAutoAdvance(true);
        await lailaPlayer.setRemoteHandling(true);
      })();
    }
    await this.setupPromise;
  }

  async load(source: AudioSource): Promise<void> {
    await this.setQueue([source], 0);
  }

  async setQueue(sources: AudioSource[], startIndex: number): Promise<void> {
    await this.ensureSetup();
    if (sources.length === 0) return;
    const index = Math.max(0, Math.min(startIndex, sources.length - 1));
    const key = sourceKey(sources);
    if (key === this.queueKey && index === this.lastIndex) return;
    const sameTrack =
      this.queueKey !== '' &&
      key !== this.queueKey &&
      sources.length === this.sources.length &&
      sources[index]?.id === this.sources[index]?.id;
    this.sources = sources;
    this.queueKey = key;
    this.lastIndex = index;
    this.lastError = undefined;
    this.pendingSeek = null;
    await this.nativePlayer.setQueue(sources.map(toQueueItem), index);
    // A server/header switch rebuilds the same track. Wait until the new media
    // item is ready so the following seek is not overwritten by prepare().
    if (sameTrack) await this.waitForReady();
  }

  async removeQueueItem(index: number, mediaId: string): Promise<void> {
    await this.ensureSetup();
    this.ensureListeners();
    const current = this.sources[index];
    if (!current || current.id !== mediaId) return;
    await this.nativePlayer.removeQueueItem(index, mediaId);
    this.sources = this.sources.filter((_, position) => position !== index);
    if (this.lastIndex > index) this.lastIndex -= 1;
    this.emit();
  }

  async play(): Promise<void> {
    await this.ensureSetup();
    this.lastError = undefined;
    await this.nativePlayer.play();
  }

  async pause(): Promise<void> {
    await this.ensureSetup();
    await this.nativePlayer.pause();
  }

  async seek(position: number): Promise<void> {
    await this.ensureSetup();
    if (!this.isReady()) {
      this.pendingSeek = position;
      return;
    }
    this.pendingSeek = null;
    await this.nativePlayer.seekTo(position);
    this.emit();
  }

  async setVolume(volume: number): Promise<void> {
    await this.ensureSetup();
    await this.nativePlayer.setVolume(volume);
  }

  async getState(): Promise<AudioState> {
    return this.snapshot();
  }

  setAutoAdvanceHandler(handler: (mediaId?: string) => void | Promise<void>): () => void {
    this.autoAdvanceHandler = handler;
    return () => {
      if (this.autoAdvanceHandler === handler) this.autoAdvanceHandler = null;
    };
  }

  setRemoteHandlers(handlers: AudioRemoteHandlers): () => void {
    this.remoteHandlers = handlers;
    void this.ensureSetup().catch(() => undefined);
    return () => {
      if (this.remoteHandlers !== handlers) return;
      this.remoteHandlers = null;
    };
  }

  subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    this.ensureListeners();
    void this.ensureSetup().catch(() => undefined);
    if (!this.interval) {
      this.interval = setInterval(() => this.emit(), POLL_MS);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
    };
  }

  async destroy(): Promise<void> {
    this.disposed = true;
    this.listeners.clear();
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
    this.remoteHandlers = null;
    this.autoAdvanceHandler = null;
    this.pendingSeek = null;
    this.sources = [];
    this.queueKey = '';
    if (lailaPlayer) await this.nativePlayer.destroy().catch(() => undefined);
  }
}
