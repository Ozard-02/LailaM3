import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebKVStore } from '@/adapters/storage/kv.web';

function fakeLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('WebKVStore', () => {
  let storage: ReturnType<typeof fakeLocalStorage>;

  beforeEach(() => {
    storage = fakeLocalStorage();
    vi.stubGlobal('window', { localStorage: storage });
  });

  it('skips writes when the persisted value did not change', async () => {
    const store = new WebKVStore();
    await store.set('laila.player', '{"queue":[]}');
    await store.set('laila.player', '{"queue":[]}');
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    await store.set('laila.player', '{"queue":[1]}');
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it('refreshes the cache when a value is read', async () => {
    storage.getItem.mockReturnValueOnce('{"queue":[2]}');
    const store = new WebKVStore();
    await expect(store.get('laila.player')).resolves.toBe('{"queue":[2]}');
    await store.set('laila.player', '{"queue":[2]}');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
