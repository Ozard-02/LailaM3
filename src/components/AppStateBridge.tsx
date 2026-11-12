import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { flushPersistedState } from '@/adapters/storage/coalesced';
import { useUIStore } from '@/stores/ui';

/**
 * Tracks foreground/background so animations and non-essential work can stop.
 * Audio, downloads and the Segue session intentionally keep running.
 *
 * Persisted state is coalesced (see `coalesced.ts`), so leaving the foreground
 * also flushes any pending write: a backgrounded app must not hold a queue or
 * download-index change in memory.
 */
export function AppStateBridge() {
  useEffect(() => {
    const setForeground = (value: boolean) => {
      useUIStore.getState().setForeground(value);
      if (!value) void flushPersistedState();
    };

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onVisibility = () => setForeground(document.visibilityState === 'visible');
      const onPageHide = () => void flushPersistedState();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      onVisibility();
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
      };
    }

    setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  return null;
}
