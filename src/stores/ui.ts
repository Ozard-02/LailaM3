import { create } from 'zustand';

/** A transient message shown at the bottom of the app. */
export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'error';
}

interface UIState {
  foreground: boolean;
  miniPlayerHidden: boolean;
  playerOpen: boolean;
  /** Increments when a shortcut asks the player to close through its spring. */
  closePlayerRequest: number;
  /** Increments when `F` asks to open/close the player. */
  togglePlayerRequest: number;
  shortcutsOpen: boolean;
  /** Increments when the web `/` shortcut asks Library to focus its search. */
  searchFocusRequest: number;
  /** Any tap/keypress outside the handoff pill asks it to leave. */
  handoffDismissRequest: number;
  toast: ToastState | null;
  setForeground: (foreground: boolean) => void;
  setMiniPlayerHidden: (hidden: boolean) => void;
  setPlayerOpen: (open: boolean) => void;
  requestClosePlayer: () => void;
  requestTogglePlayer: () => void;
  setShortcutsOpen: (open: boolean) => void;
  focusSearch: () => void;
  requestHandoffDismiss: () => void;
  showToast: (toast: Omit<ToastState, 'id'>) => void;
  hideToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  foreground: true,
  miniPlayerHidden: false,
  playerOpen: false,
  closePlayerRequest: 0,
  togglePlayerRequest: 0,
  shortcutsOpen: false,
  searchFocusRequest: 0,
  handoffDismissRequest: 0,
  toast: null,
  setForeground: (foreground) => set({ foreground }),
  setMiniPlayerHidden: (miniPlayerHidden) => set({ miniPlayerHidden }),
  setPlayerOpen: (playerOpen) => set({ playerOpen }),
  requestClosePlayer: () =>
    set((state) => ({ closePlayerRequest: state.closePlayerRequest + 1 })),
  requestTogglePlayer: () =>
    set((state) => ({ togglePlayerRequest: state.togglePlayerRequest + 1 })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  focusSearch: () => set((state) => ({ searchFocusRequest: state.searchFocusRequest + 1 })),
  requestHandoffDismiss: () =>
    set((state) => ({ handoffDismissRequest: state.handoffDismissRequest + 1 })),
  showToast: (toast) =>
    set((state) => ({
      toast: { ...toast, id: Date.now() + Math.random() },
    })),
  hideToast: () => set({ toast: null }),
}));
