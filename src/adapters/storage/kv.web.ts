import type { KVStore } from '@/ports/storage';

export class WebKVStore implements KVStore {
  private readonly lastValues = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) this.lastValues.set(key, value);
      return value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (this.lastValues.get(key) === value) return;
    try {
      window.localStorage.setItem(key, value);
      this.lastValues.set(key, value);
    } catch {
      // Storage can be full or blocked; callers treat persistence as best effort.
    }
  }

  async remove(key: string): Promise<void> {
    this.lastValues.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
