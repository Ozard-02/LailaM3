import type { ServerConfig } from '@/core/models';
import { fetchExcludedSongIds } from '@/core/exclusions';
import { logger } from '@/core/utils/logger';
import { appStore } from './appStorage';

interface CachedExclusions {
  ids: Set<string>;
  /** Epoch ms of the last successful server read; 0 for legacy/missing. */
  at: number;
}

const memory = new Map<string, CachedExclusions>();
const DEFAULT_TTL_MS = 5 * 60_000;

function keyFor(config: ServerConfig): string {
  return `laila.exclusions:${config.url}|${config.username}`;
}

async function readStored(config: ServerConfig): Promise<CachedExclusions | null> {
  try {
    const raw = await appStore.get(keyFor(config));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      // Legacy shape: a bare id array. Force a refresh on the next ensure.
      return { ids: new Set(parsed.filter((id): id is string => typeof id === 'string')), at: 0 };
    }
    if (parsed && typeof parsed === 'object') {
      const value = parsed as { ids?: unknown; at?: unknown };
      if (Array.isArray(value.ids)) {
        return {
          ids: new Set(value.ids.filter((id): id is string => typeof id === 'string')),
          at: typeof value.at === 'number' ? value.at : 0,
        };
      }
    }
  } catch (error) {
    logger.warn('Could not read exclusion cache', { error });
  }
  return null;
}

export async function getExcludedSongIds(config: ServerConfig): Promise<Set<string>> {
  const key = keyFor(config);
  const cached = memory.get(key);
  if (cached) return cached.ids;

  const stored = await readStored(config);
  if (stored) {
    memory.set(key, stored);
    return stored.ids;
  }
  const empty: CachedExclusions = { ids: new Set(), at: 0 };
  memory.set(key, empty);
  return empty.ids;
}

/**
 * Returns the cached exclusion set when it is younger than `maxAgeMs`, and
 * refreshes it otherwise. Playlist toggles invalidate the cache explicitly.
 */
export async function ensureExcludedSongIds(
  config: ServerConfig,
  maxAgeMs = DEFAULT_TTL_MS,
): Promise<Set<string>> {
  const key = keyFor(config);
  const cached = memory.get(key) ?? (await readStored(config));
  if (cached && cached.at > 0 && Date.now() - cached.at <= maxAgeMs) {
    memory.set(key, cached);
    return cached.ids;
  }
  return refreshExcludedSongIds(config);
}

/**
 * Manual Shuffle is a user action, so read the server's current tags instead of
 * accepting a five-minute-old cache. If the refresh fails, fall back to the
 * last cached set rather than unfiltered music.
 */
export async function loadShuffleExclusions(config: ServerConfig): Promise<Set<string>> {
  try {
    return await refreshExcludedSongIds(config, true);
  } catch {
    return getExcludedSongIds(config);
  }
}

export async function refreshExcludedSongIds(
  config: ServerConfig,
  strict = false,
): Promise<Set<string>> {
  const key = keyFor(config);
  const ids = await fetchExcludedSongIds(config, { strict });
  const entry: CachedExclusions = { ids, at: Date.now() };
  memory.set(key, entry);
  try {
    await appStore.set(key, JSON.stringify({ ids: [...ids], at: entry.at }));
  } catch (error) {
    logger.warn('Could not write exclusion cache', { error });
  }
  return ids;
}

export function invalidateExclusions(config: ServerConfig): void {
  const key = keyFor(config);
  // Force the next ensure to refresh even if the disk removal is still in
  // flight; an empty entry with at=0 is never treated as fresh.
  memory.set(key, { ids: new Set(), at: 0 });
  void appStore.remove(key).catch((error) => {
    logger.warn('Could not clear exclusion cache', { error });
  });
}
