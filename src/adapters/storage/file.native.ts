import { Directory, File, Paths } from 'expo-file-system';
import { md5 } from 'js-md5';
import { logger } from '@/core/utils/logger';
import type { KVStore } from '@/ports/storage';

const stateDirectory = new Directory(Paths.document, 'laila-state');

function safeKey(key: string): string {
  // Opaque, collision-free and avoids leaking server URLs in file names.
  return md5(key);
}

function ensureDirectory(): void {
  if (stateDirectory.exists) return;
  try {
    stateDirectory.create({ intermediates: true });
  } catch {
    // Another store may have created it between the check and the call.
  }
}

function pathFor(key: string, suffix: string): File {
  ensureDirectory();
  return new File(stateDirectory, `${safeKey(key)}.${suffix}`);
}

async function readJsonFile(file: File): Promise<string | null> {
  try {
    if (!file.exists) return null;
    const text = await file.text();
    // A truncated write must not poison rehydration.
    JSON.parse(text);
    return text;
  } catch {
    return null;
  }
}

/**
 * JSON state store on the documents directory. SecureStore is reserved for
 * credentials; it is slow and has a size limit that a growing download index
 * can exceed. Reads migrate values from the legacy store once, then the legacy
 * copy is removed.
 */
export class FileKVStore implements KVStore {
  private readonly lastValues = new Map<string, string>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly legacy?: KVStore) {}

  /** Serialise writes/removals per key so temp files cannot collide. */
  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const job = previous.catch(() => undefined).then(task);
    this.queues.set(key, job);
    return job.finally(() => {
      if (this.queues.get(key) === job) this.queues.delete(key);
    });
  }

  async get(key: string): Promise<string | null> {
    const current = await readJsonFile(pathFor(key, 'json'));
    if (current !== null) {
      this.lastValues.set(key, current);
      return current;
    }
    const backup = await readJsonFile(pathFor(key, 'bak'));
    if (backup !== null) {
      await this.set(key, backup);
      return backup;
    }
    const migrated = await this.legacy?.get(key);
    if (migrated !== null && migrated !== undefined) {
      // Keep the legacy copy until the file write succeeds.
      if (await this.enqueue(key, () => this.writeIfChanged(key, migrated))) {
        try {
          await this.legacy?.remove(key);
        } catch {
          // The file copy is authoritative from now on.
        }
      }
      return migrated;
    }
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.enqueue(key, () => this.writeIfChanged(key, value));
  }

  /**
   * Zustand persist serialises on every store update, including high-frequency
   * fields excluded by `partialize` (playback position, download progress).
   * Skip the disk write when the persisted subset did not change.
   */
  private async writeIfChanged(key: string, value: string): Promise<boolean> {
    if (this.lastValues.get(key) === value) return true;
    const written = await this.write(key, value);
    if (written) this.lastValues.set(key, value);
    return written;
  }

  private async write(key: string, value: string): Promise<boolean> {
    const target = pathFor(key, 'json');
    const temp = pathFor(key, 'tmp');
    let step = 'prepare';
    try {
      if (temp.exists) {
        step = 'delete-temp';
        temp.delete();
      }
      step = 'create-temp';
      temp.create({ intermediates: true, overwrite: true });
      step = 'write-temp';
      await temp.write(value);

      const backup = pathFor(key, 'bak');
      if (target.exists) {
        step = 'move-target-backup';
        if (backup.exists) backup.delete();
        await target.move(backup);
      }

      // `File.move` updates the receiver's uri, so use a fresh destination.
      step = 'move-temp-target';
      await temp.move(pathFor(key, 'json'));
      return true;
    } catch (error) {
      const detail = error as { code?: string; message?: string };
      logger.warn('App state write failed', {
        step,
        code: detail?.code,
        message: detail?.message ?? String(error),
      });
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await this.enqueue(key, async () => {
      this.lastValues.delete(key);
      for (const suffix of ['json', 'bak', 'tmp']) {
        try {
          const file = pathFor(key, suffix);
          if (file.exists) file.delete();
        } catch {
          // Best effort.
        }
      }
    });
  }
}
