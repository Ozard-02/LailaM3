import { safeSeekTime } from '@/core/audio/seek';
import type {
  AudioEngine,
  AudioListener,
  AudioSource,
  AudioState,
  AudioStatus,
} from '@/ports/audio';

export class WebAudioEngine implements AudioEngine {
  private readonly element: HTMLAudioElement;
  private listeners = new Set<AudioListener>();
  private lastError: string | undefined;
  private disposed = false;

  constructor() {
    this.element = new Audio();
    this.element.preload = 'auto';
    // Let the browser decide; we never need to read samples.
    this.element.crossOrigin = 'anonymous';
    this.bindEvents();
  }

  private bindEvents() {
    const emit = () => this.emit();
    this.element.addEventListener('loadedmetadata', emit);
    this.element.addEventListener('durationchange', emit);
    this.element.addEventListener('timeupdate', emit);
    this.element.addEventListener('progress', emit);
    this.element.addEventListener('play', emit);
    this.element.addEventListener('playing', emit);
    this.element.addEventListener('pause', emit);
    this.element.addEventListener('waiting', emit);
    this.element.addEventListener('canplay', emit);
    this.element.addEventListener('ended', emit);
    this.element.addEventListener('error', () => {
      this.lastError = this.element.error?.message ?? 'Audio playback failed';
      this.emit();
    });
  }

  private status(): AudioStatus {
    if (this.lastError) return 'error';
    if (!this.element.src) return 'idle';
    if (this.element.ended) return 'ended';
    if (this.element.paused) {
      return this.element.readyState < 2 ? 'loading' : 'paused';
    }
    return this.element.readyState < 2 ? 'loading' : 'playing';
  }

  private snapshot(): AudioState {
    const duration = Number.isFinite(this.element.duration) ? this.element.duration : 0;
    const rawBuffered = this.element.buffered.length
      ? this.element.buffered.end(this.element.buffered.length - 1)
      : 0;
    const buffered = Number.isFinite(rawBuffered) ? rawBuffered : 0;
    const position = Number.isFinite(this.element.currentTime) ? this.element.currentTime : 0;
    return {
      status: this.status(),
      position,
      duration,
      buffered,
      error: this.lastError,
    };
  }

  private emit() {
    if (this.disposed) return;
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
  }

  async load(source: AudioSource): Promise<void> {
    this.lastError = undefined;
    this.element.src = source.url;
    this.element.load();
    this.emit();
  }

  async play(): Promise<void> {
    this.lastError = undefined;
    try {
      await this.element.play();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Playback was blocked';
      this.emit();
      throw error;
    }
  }

  async pause(): Promise<void> {
    this.element.pause();
  }

  async seek(position: number): Promise<void> {
    // A non-finite value must never reach currentTime: the setter throws and
    // the play/seek path aborts.
    if (!Number.isFinite(position)) return;
    const target = safeSeekTime(position, this.element.duration);
    try {
      this.element.currentTime = target;
    } catch {
      return;
    }
    this.emit();
  }

  async setVolume(volume: number): Promise<void> {
    if (!Number.isFinite(volume)) return;
    this.element.volume = Math.max(0, Math.min(1, volume));
  }

  async getState(): Promise<AudioState> {
    return this.snapshot();
  }

  subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async destroy(): Promise<void> {
    this.disposed = true;
    this.listeners.clear();
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
  }
}
