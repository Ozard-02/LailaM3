import { NativeKVStore } from '@/adapters/storage/kv.native';
import type { KVStore } from '@/ports/storage';

export const kvStore: KVStore = new NativeKVStore();
