import type { PersistStorage, StorageValue } from 'zustand/middleware';

export interface CoalescedOptions<T> {
  /**
   * Delay before a changed value is written. `0` writes immediately. A delay
   * batches bursts (download completions) into one multi-MB JSON write.
   */
  delayMs?: number;
  /**
   * Cheap check on the partialised state. Returning `false` skips
   * serialisation entirely: this is what keeps playback position ticks, which
   * change the store but not the persisted subset, out of the write path.
   */
  changed?: (next: T, previous: T) => boolean;
}

export interface CoalescedStorage<T> extends PersistStorage<T> {
  /** Write everything pending now (app background, before unload). */
  flush: () => Promise<void>;
}

interface Pending<T> {
  value: StorageValue<T>;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Flusher {
  flush: () => Promise<void>;
}

const flushers = new Set<Flusher>();

/** Flush every coalesced store; used when the app leaves the foreground. */
export async function flushPersistedState(): Promise<void> {
  await Promise.all([...flushers].map((storage) => storage.flush()));
}

function parse<T>(text: string | null): StorageValue<T> | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as StorageValue<T>;
  } catch {
    // A truncated write must not poison rehydration; the store falls back to
    // its defaults and the next write replaces the file.
    return null;
  }
}

/**
 * JSON storage for `persist` that (a) skips serialising unchanged persisted
 * subsets and (b) coalesces bursts into one write. The default
 * `createJSONStorage` stringifies the whole partialised state on every store
 * update, including position ticks: 11 ms per tick with a 10k-track queue.
 */
export function createCoalescedJSONStorage<T>(
  base: {
    getItem: (name: string) => string | null | Promise<string | null>;
    setItem: (name: string, value: string) => void | Promise<void>;
    removeItem: (name: string) => void | Promise<void>;
  },
  options: CoalescedOptions<T> = {},
): CoalescedStorage<T> {
  const delayMs = options.delayMs ?? 0;
  const pending = new Map<string, Pending<T>>();
  const lastState = new Map<string, T>();
  const chains = new Map<string, Promise<void>>();

  const write = (name: string, value: StorageValue<T>): Promise<void> => {
    const previous = chains.get(name) ?? Promise.resolve();
    const job = previous
      .catch(() => undefined)
      .then(() => base.setItem(name, JSON.stringify(value)));
    chains.set(name, job);
    return job.finally(() => {
      if (chains.get(name) === job) chains.delete(name);
    });
  };

  const flushOne = async (name: string): Promise<void> => {
    const entry = pending.get(name);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    pending.delete(name);
    await write(name, entry.value);
  };

  const schedule = (name: string, value: StorageValue<T>) => {
    if (delayMs <= 0) {
      void write(name, value);
      return;
    }
    const existing = pending.get(name);
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      const current = pending.get(name);
      if (!current) return;
      current.timer = null;
      void flushOne(name);
    }, delayMs);
    pending.set(name, { value, timer });
  };

  const storage: CoalescedStorage<T> = {
    getItem: async (name) => {
      const queued = pending.get(name);
      if (queued) return queued.value;
      const parsed = parse<T>(await base.getItem(name));
      if (parsed) lastState.set(name, parsed.state);
      return parsed;
    },

    setItem: (name, value) => {
      const previous = lastState.get(name);
      if (previous !== undefined && options.changed && !options.changed(value.state, previous)) {
        return;
      }
      lastState.set(name, value.state);
      schedule(name, value);
    },

    removeItem: async (name) => {
      const queued = pending.get(name);
      if (queued?.timer) clearTimeout(queued.timer);
      pending.delete(name);
      lastState.delete(name);
      await chains.get(name)?.catch(() => undefined);
      await base.removeItem(name);
    },

    flush: async () => {
      await Promise.all([...pending.keys()].map((name) => flushOne(name)));
      await Promise.all([...chains.values()]);
    },
  };

  flushers.add(storage);
  return storage;
}
