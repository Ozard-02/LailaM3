import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useUIStore } from '@/stores/ui';

/**
 * Tracks foreground/background so animations and non-essential work can stop.
 * Audio, downloads and the Segue session intentionally keep running.
 */
export function AppStateBridge() {
  useEffect(() => {
    const setForeground = (value: boolean) => useUIStore.getState().setForeground(value);

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onVisibility = () => setForeground(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVisibility);
      onVisibility();
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }

    setForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  return null;
}
