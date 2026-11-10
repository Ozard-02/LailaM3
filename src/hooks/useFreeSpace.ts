import { useCallback, useEffect, useState } from 'react';
import { offlineFiles } from '@/services/offline';
import { useOfflineStore } from '@/stores/offline';

/** Free bytes on the download volume; refreshes when the queue changes. */
export function useFreeSpace(): number | null {
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const active = useOfflineStore((state) => state.active);
  const queueLength = useOfflineStore((state) => Object.keys(state.downloads).length);

  const refresh = useCallback(() => {
    let cancelled = false;
    void offlineFiles.freeSpace().then((free) => {
      if (!cancelled) setFreeBytes(free);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [active, queueLength, refresh]);

  return freeBytes;
}
