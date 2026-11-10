import { FileKVStore } from '@/adapters/storage/file.native';
import { NativeKVStore } from '@/adapters/storage/kv.native';
import type { KVStore } from '@/ports/storage';

export const appStore: KVStore = new FileKVStore(new NativeKVStore());
