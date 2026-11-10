import { create } from 'zustand';
import type { DlnaRenderer } from '@/core/dlna/types';
import { logger } from '@/core/utils/logger';
import { dlnaDiscovery } from '@/services/dlna';

const SCAN_CACHE_MS = 20_000;

interface CastState {
  renderers: DlnaRenderer[];
  scanning: boolean;
  scanned: boolean;
  error: string | null;
  lastScanAt: number;
  scan: (options?: { force?: boolean; timeoutMs?: number }) => Promise<void>;
}

export const useCastStore = create<CastState>((set, get) => ({
  renderers: [],
  scanning: false,
  scanned: false,
  error: null,
  lastScanAt: 0,

  scan: async ({ force = false, timeoutMs = 3500 } = {}) => {
    if (get().scanning) return;
    if (!force && Date.now() - get().lastScanAt < SCAN_CACHE_MS) return;

    set({ scanning: true, error: null });
    try {
      const renderers = await dlnaDiscovery.discover(timeoutMs);
      set({ renderers, scanned: true, lastScanAt: Date.now() });
    } catch (error) {
      logger.warn('Speaker discovery failed', { error });
      set({
        scanned: true,
        error: 'Could not scan for speakers.',
        lastScanAt: Date.now(),
      });
    } finally {
      set({ scanning: false });
    }
  },
}));
