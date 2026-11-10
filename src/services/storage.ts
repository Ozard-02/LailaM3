// TypeScript fallback. Metro resolves storage.web.ts / storage.native.ts at runtime.
import { WebKVStore } from '@/adapters/storage/kv.web';
import type { KVStore } from '@/ports/storage';

export const kvStore: KVStore = new WebKVStore();
