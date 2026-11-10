import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDownloadProgressStore } from '@/stores/downloadProgress';

describe('download progress store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    useDownloadProgressStore.getState().clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throttles intermediate updates but always accepts completion', () => {
    const store = useDownloadProgressStore.getState();

    store.set('track', { progress: 0.1, bytesWritten: 10, totalBytes: 100, speed: 1 });
    expect(useDownloadProgressStore.getState().progress.track?.progress).toBe(0.1);

    store.set('track', { progress: 0.2, bytesWritten: 20, totalBytes: 100, speed: 2 });
    expect(useDownloadProgressStore.getState().progress.track?.progress).toBe(0.1);

    vi.advanceTimersByTime(250);
    store.set('track', { progress: 0.3, bytesWritten: 30, totalBytes: 100, speed: 3 });
    expect(useDownloadProgressStore.getState().progress.track?.progress).toBe(0.3);

    store.set('track', { progress: 1, bytesWritten: 100, totalBytes: 100, speed: 0 });
    expect(useDownloadProgressStore.getState().progress.track?.progress).toBe(1);
  });

  it('clears one entry without touching the others', () => {
    const store = useDownloadProgressStore.getState();
    store.set('a', { progress: 0.1, bytesWritten: 1, totalBytes: 10, speed: 1 });
    store.set('b', { progress: 0.2, bytesWritten: 2, totalBytes: 10, speed: 1 });

    store.clear('a');

    const progress = useDownloadProgressStore.getState().progress;
    expect(progress.a).toBeUndefined();
    expect(progress.b?.progress).toBe(0.2);
  });
});
