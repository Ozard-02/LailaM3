import { md5 } from 'js-md5';
import type { ServerConfig } from '../models';

export const SUBSONIC_VERSION = '1.16.1';
export const CLIENT_NAME = 'laila';

let cachedSalt: string | null = null;

export function newSalt(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * One stable salt per session. Reusing it keeps image/audio URLs cacheable,
 * which matters for expo-image and the browser HTTP cache.
 */
export function sessionSalt(): string {
  if (!cachedSalt) cachedSalt = newSalt();
  return cachedSalt;
}

export function resetSessionSalt(): void {
  cachedSalt = null;
}

export function buildAuthParams(
  config: ServerConfig,
  salt: string = sessionSalt(),
): Record<string, string> {
  if (config.authMode === 'apiKey') {
    if (!config.apiKey) throw new Error('Missing API key');
    return { apiKey: config.apiKey };
  }

  if (!config.username) throw new Error('Missing username');

  // A remembered token session avoids keeping the password at all.
  if (config.token && config.salt) {
    return { u: config.username, s: config.salt, t: config.token };
  }

  if (!config.password) throw new Error('Missing password');

  return {
    u: config.username,
    s: salt,
    t: md5(`${config.password}${salt}`),
  };
}

export function buildCommonParams(config: ServerConfig): Record<string, string> {
  return {
    ...buildAuthParams(config),
    v: SUBSONIC_VERSION,
    c: CLIENT_NAME,
    f: 'json',
  };
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function buildUrl(
  config: ServerConfig,
  endpoint: string,
  params: Record<string, string | number | boolean | string[] | undefined> = {},
): string {
  const base = normalizeBaseUrl(config.url);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(buildCommonParams(config))) {
    search.set(key, value);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    // Empty values normally mean "omit", but updating a playlist uses an empty
    // comment to clear the tag on the server.
    if (value === '' && key !== 'comment') continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, String(value));
    }
  }
  return `${base}/rest/${endpoint}.view?${search.toString()}`;
}

export function buildCoverUrl(
  config: ServerConfig,
  coverArtId: string,
  size?: number,
): string {
  return buildUrl(config, 'getCoverArt', { id: coverArtId, size });
}

export function buildStreamUrl(
  config: ServerConfig,
  trackId: string,
  options?: { format?: string; maxBitRate?: number },
): string {
  return buildUrl(config, 'stream', {
    id: trackId,
    format: options?.format ?? 'raw',
    maxBitRate: options?.maxBitRate,
  });
}

export function buildDownloadUrl(
  config: ServerConfig,
  trackId: string,
  options?: { format?: 'opus' | 'mp3' | 'raw'; maxBitRate?: number },
): string {
  // `download` returns the original file. Transcoding is a stream endpoint
  // feature, so a lower-quality download uses `stream` with an exact format.
  if (options?.format && options.format !== 'raw') {
    return buildUrl(config, 'stream', {
      id: trackId,
      format: options.format,
      maxBitRate: options.maxBitRate,
    });
  }
  return buildUrl(config, 'download', { id: trackId });
}
