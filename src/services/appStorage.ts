// TypeScript fallback. Metro resolves appStorage.web.ts / appStorage.native.ts.
import { WebKVStore } from '@/adapters/storage/kv.web';
import type { KVStore } from '@/ports/storage';

export const appStore: KVStore = new WebKVStore();
