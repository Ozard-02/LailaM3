import { WebOfflineFiles } from '@/adapters/web/offline.web';
import type { OfflineFiles } from '@/ports/offline';

export const offlineFiles: OfflineFiles = new WebOfflineFiles();
