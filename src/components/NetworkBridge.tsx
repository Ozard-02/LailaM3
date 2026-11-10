import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { networkMonitor } from '@/services/network';
import { useAuthStore } from '@/stores/auth';
import { useOfflineStore } from '@/stores/offline';

/**
 * Switches between bound server instances (home Wi-Fi / cellular) automatically.
 * Browsers do not expose the SSID, so this is a native-only behaviour.
 */
export function NetworkBridge() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;
    const apply = (info: Awaited<ReturnType<typeof networkMonitor.get>>) => {
      if (cancelled) return;
      useOfflineStore.getState().setNetworkOffline(info.type === 'none');
      useAuthStore.getState().autoSwitch(info);
    };

    void networkMonitor.get().then(apply);
    const unsubscribe = networkMonitor.subscribe(apply);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void networkMonitor.get().then(apply);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      appState.remove();
    };
  }, []);

  return null;
}
