import { create } from 'zustand';

export interface DownloadProgressSnapshot {
  progress: number;
  bytesWritten: number;
  totalBytes: number;
  speed: number;
}

interface DownloadProgressState {
  progress: Record<string, DownloadProgressSnapshot>;
  set: (trackId: string, snapshot: DownloadProgressSnapshot) => void;
  clear: (trackId: string) => void;
  clearAll: () => void;
}

/** Coalesce high-frequency download callbacks into UI-sized updates. */
const THROTTLE_MS = 250;
const lastUpdate = new Map<string, number>();

export const useDownloadProgressStore = create<DownloadProgressState>((set) => ({
  progress: {},

  set: (trackId, snapshot) => {
    const now = Date.now();
    const previous = lastUpdate.get(trackId) ?? 0;
    const final = snapshot.progress >= 1;
    if (!final && now - previous < THROTTLE_MS) return;
    lastUpdate.set(trackId, now);
    set((state) => ({
      progress: { ...state.progress, [trackId]: snapshot },
    }));
  },

  clear: (trackId) => {
    lastUpdate.delete(trackId);
    set((state) => {
      if (!state.progress[trackId]) return state;
      const progress = { ...state.progress };
      delete progress[trackId];
      return { progress };
    });
  },

  clearAll: () => {
    lastUpdate.clear();
    set({ progress: {} });
  },
}));

export function useDownloadProgress(trackId: string): DownloadProgressSnapshot | undefined {
  return useDownloadProgressStore((state) => state.progress[trackId]);
}

/** Sum of live progress for tracks that are not yet in the offline index. */
export function useLiveProgressSum(trackIds: string[]): number {
  return useDownloadProgressStore((state) => {
    let sum = 0;
    for (const trackId of trackIds) {
      sum += state.progress[trackId]?.progress ?? 0;
    }
    return sum;
  });
}
