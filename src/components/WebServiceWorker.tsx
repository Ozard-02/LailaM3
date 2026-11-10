import { useEffect } from 'react';
import { Platform } from 'react-native';
import { logger } from '@/core/utils/logger';

export function WebServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        logger.debug('Service worker registered', { scope: registration.scope });
      })
      .catch((error) => {
        logger.warn('Service worker registration failed', { error });
      });
  }, []);

  return null;
}
