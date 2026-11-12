import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCoalescedJSONStorage } from '@/adapters/storage/coalesced';

interface MemoryStore {
  data: Map<string, string>;
  writes: number;
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

function memoryStore(): MemoryStore {
  const store: MemoryStore = {
    data: new Map(),
    writes: 0,
    getItem: (name) => store.data.get(name) ?? null,
    setItem: (name, value) => {
      store.writes += 1;
      store.data.set(name, value);
    },
    removeItem: (name) => {
      store.data.delete(name);
    },
  };
  return store;
}

interface Persisted {
  queue: object;
  volume: number;
}

const value = (queue: object, volume = 0.5) => ({ state: { queue, volume }, version: 1 });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('coalesced persist storage', () => {
  it('skips serialisation when the persisted subset is unchanged', async () => {
    const base = memoryStore();
    const stringify = vi.spyOn(JSON, 'stringify');
    const storage = createCoalescedJSONStorage<Persisted>(base, {
      changed: (next, previous) =>
        next.queue !== previous.queue || next.volume !== previous.volume,
    });
    const queue = { tracks: [] };

    storage.setItem('laila.player', value(queue));
    await storage.flush();
    const afterFirst = stringify.mock.calls.length;
    // Position ticks change the store but keep the same queue reference.
    storage.setItem('laila.player', value(queue));
    storage.setItem('laila.player', value(queue));
    await storage.flush();

    expect(stringify.mock.calls.length).toBe(afterFirst);
    expect(base.writes).toBe(1);
  });

  it('coalesces a burst into one write and keeps the last value', async () => {
    vi.useFakeTimers();
    const base = memoryStore();
    const storage = createCoalescedJSONStorage<Persisted>(base, { delayMs: 1_000 });
    const first = { n: 1 };
    const second = { n: 2 };
    const third = { n: 3 };

    storage.setItem('laila.offline', value(first));
    storage.setItem('laila.offline', value(second));
    storage.setItem('laila.offline', value(third));

    await vi.advanceTimersByTimeAsync(999);
    expect(base.writes).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(base.writes).toBe(1);
    expect(JSON.parse(base.data.get('laila.offline')!)).toEqual(value(third));
  });

  it('flush writes immediately and clears the timer', async () => {
    vi.useFakeTimers();
    const base = memoryStore();
    const storage = createCoalescedJSONStorage<Persisted>(base, { delayMs: 5_000 });
    const queue = { n: 1 };
    storage.setItem('laila.player', value(queue));

    await storage.flush();
    expect(base.writes).toBe(1);

    // The pending timer must not write the same value again.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(base.writes).toBe(1);
  });

  it('returns a pending value without hitting the disk', async () => {
    vi.useFakeTimers();
    const base = memoryStore();
    const storage = createCoalescedJSONStorage<Persisted>(base, { delayMs: 1_000 });
    const queue = { n: 1 };
    storage.setItem('laila.player', value(queue, 0.9));

    await expect(storage.getItem('laila.player')).resolves.toEqual(value(queue, 0.9));
    expect(base.writes).toBe(0);
  });

  it('does not rewrite a value that was just rehydrated', async () => {
    const base = memoryStore();
    const queue = { n: 1 };
    base.data.set('laila.player', JSON.stringify(value(queue)));
    const storage = createCoalescedJSONStorage<Persisted>(base, {
      changed: (next, previous) =>
        next.queue !== previous.queue || next.volume !== previous.volume,
    });

    const hydrated = await storage.getItem('laila.player');
    storage.setItem('laila.player', hydrated!);
    await storage.flush();

    expect(base.writes).toBe(0);
  });

  it('drops a pending write when the item is removed', async () => {
    vi.useFakeTimers();
    const base = memoryStore();
    const storage = createCoalescedJSONStorage<Persisted>(base, { delayMs: 1_000 });
    storage.setItem('laila.player', value({ n: 1 }));

    await storage.removeItem('laila.player');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(base.writes).toBe(0);
    expect(base.data.has('laila.player')).toBe(false);
  });

  it('ignores a truncated persisted file', async () => {
    const base = memoryStore();
    base.data.set('laila.player', '{"state":');
    const storage = createCoalescedJSONStorage<Persisted>(base);

    await expect(storage.getItem('laila.player')).resolves.toBeNull();
  });
});
