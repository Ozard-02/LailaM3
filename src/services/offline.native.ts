import { NativeOfflineFiles } from '@/adapters/native/offline.native';
import type { OfflineFiles } from '@/ports/offline';

export const offlineFiles: OfflineFiles = new NativeOfflineFiles();
