import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStore } from '@/services/appStorage';
import type { ChromeRadius } from '@/theme/tokens';

export type StreamQuality = 'raw' | 'opus' | 'mp3';
export type DownloadQuality = 'original' | 'opus' | 'mp3';
export type SwipeAction = 'playNext' | 'addToQueue' | 'download' | 'none';

interface SettingsState {
  quality: StreamQuality;
  maxBitRate: number | undefined;
  showCodecBadge: boolean;
  reduceBlur: boolean;
  hubUrl: string;
  swipeLeftAction: SwipeAction;
  swipeRightAction: SwipeAction;
  /** Keep playing random library songs when a queue ends. */
  continueWithRadio: boolean;
  /** Trash playlist id per `serverKey(server)`. */
  trashPlaylistIds: Record<string, string>;
  accentColor: string | null;
  parallelDownloads: number;
  downloadQuality: DownloadQuality;
  /** Local download budget in bytes; null means unlimited. */
  offlineLimitBytes: number | null;
  chromeRadius: ChromeRadius;
  setQuality: (quality: StreamQuality) => void;
  setMaxBitRate: (value: number | undefined) => void;
  toggleCodecBadge: () => void;
  toggleReduceBlur: () => void;
  setHubUrl: (url: string) => void;
  setSwipeAction: (side: 'left' | 'right', action: SwipeAction) => void;
  toggleContinueWithRadio: () => void;
  setTrashPlaylist: (serverKey: string, playlistId: string | null) => void;
  setAccentColor: (color: string | null) => void;
  setParallelDownloads: (count: number) => void;
  setDownloadQuality: (quality: DownloadQuality) => void;
  setOfflineLimit: (bytes: number | null) => void;
  setChromeRadius: (radius: ChromeRadius) => void;
}

const storage = createJSONStorage(() => ({
  getItem: (name) => appStore.get(name),
  setItem: (name, value) => appStore.set(name, value),
  removeItem: (name) => appStore.remove(name),
}));

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      quality: 'raw',
      maxBitRate: undefined,
      showCodecBadge: true,
      reduceBlur: false,
      hubUrl: '',
      swipeLeftAction: 'addToQueue',
      swipeRightAction: 'playNext',
      continueWithRadio: true,
      trashPlaylistIds: {},
      accentColor: null,
      parallelDownloads: 2,
      downloadQuality: 'original',
      offlineLimitBytes: null,
      chromeRadius: 'pill',
      setQuality: (quality) => set({ quality }),
      setMaxBitRate: (maxBitRate) => set({ maxBitRate }),
      toggleCodecBadge: () => set((state) => ({ showCodecBadge: !state.showCodecBadge })),
      toggleReduceBlur: () => set((state) => ({ reduceBlur: !state.reduceBlur })),
      setHubUrl: (hubUrl) => set({ hubUrl }),
      setSwipeAction: (side, action) =>
        set(side === 'left' ? { swipeLeftAction: action } : { swipeRightAction: action }),
      toggleContinueWithRadio: () =>
        set((state) => ({ continueWithRadio: !state.continueWithRadio })),
      setTrashPlaylist: (serverKey, playlistId) =>
        set((state) => {
          const next = { ...state.trashPlaylistIds };
          if (playlistId) next[serverKey] = playlistId;
          else delete next[serverKey];
          return { trashPlaylistIds: next };
        }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setParallelDownloads: (count) =>
        set({ parallelDownloads: Math.max(1, Math.min(6, Math.round(count))) }),
      setDownloadQuality: (downloadQuality) => set({ downloadQuality }),
      setOfflineLimit: (offlineLimitBytes) => set({ offlineLimitBytes }),
      setChromeRadius: (chromeRadius) => set({ chromeRadius }),
    }),
    { name: 'laila.settings', storage },
  ),
);
