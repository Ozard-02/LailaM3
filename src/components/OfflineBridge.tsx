import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOfflineStore } from '@/stores/offline';

export function OfflineBridge() {
  useEffect(() => {
    const run = () => {
      void useOfflineStore.getState().hydrate();
    };
    // Hydrate only after zustand has merged the persisted index: the recovery
    // scan must not mistake the initial empty state for a lost index.
    if (useOfflineStore.persist.hasHydrated()) {
      run();
      return undefined;
    }
    return useOfflineStore.persist.onFinishHydration(run);
  }, []);

  useEffect(() => {
    // Pause server queries while offline (manual or no network); they resume
    // automatically when the mode is turned off or the connection returns.
    const apply = (state: ReturnType<typeof useOfflineStore.getState>) => {
      onlineManager.setOnline(!(state.offlineMode || state.networkOffline));
    };
    apply(useOfflineStore.getState());
    return useOfflineStore.subscribe(apply);
  }, []);

  return null;
}
