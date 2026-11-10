import type {
  Album,
  AlbumListType,
  Artist,
  Genre,
  NowPlayingEntry,
  Playlist,
  SearchResult,
  ServerConfig,
  Track,
} from '../models';
import { isSynced, parseLrc, type Lyrics, type LyricsLine } from '../lyrics/lrc';
import { safeParse } from 'valibot';
import { logger } from '../utils/logger';
import { SubsonicError } from './errors';
import { buildCommonParams, buildUrl, normalizeBaseUrl } from './params';
import { retryDelayMs, shouldRetryStatus } from './retry';
import {
  AlbumSchema,
  ArtistSchema,
  GenreSchema,
  PlaylistSchema,
  SubsonicEnvelopeSchema,
  TrackSchema,
} from './schemas';

type Json = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {};
}

function asArray(value: unknown): Json[] {
  if (Array.isArray(value)) return value.map(asRecord);
  if (value && typeof value === 'object') return [asRecord(value)];
  return [];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mapTrack(raw: Json): Track {
  validate(TrackSchema, raw, 'track');
  return {
    id: str(raw.id) ?? '',
    title: str(raw.title) ?? str(raw.name) ?? 'Unknown track',
    artist: str(raw.artist),
    artistId: str(raw.artistId),
    album: str(raw.album),
    albumId: str(raw.albumId),
    coverArt: str(raw.coverArt),
    duration: num(raw.duration),
    track: num(raw.track),
    discNumber: num(raw.discNumber),
    year: num(raw.year),
    genre: str(raw.genre),
    bitRate: num(raw.bitRate),
    suffix: str(raw.suffix),
    contentType: str(raw.contentType),
    size: num(raw.size),
    starred: str(raw.starred),
  };
}

export function mapAlbum(raw: Json): Album {
  validate(AlbumSchema, raw, 'album');
  const songs = asArray(raw.song).map(mapTrack);
  return {
    id: str(raw.id) ?? '',
    name: str(raw.name) ?? str(raw.title) ?? 'Unknown album',
    artist: str(raw.artist),
    artistId: str(raw.artistId),
    coverArt: str(raw.coverArt),
    songCount: num(raw.songCount) ?? songs.length,
    duration: num(raw.duration),
    year: num(raw.year),
    genre: str(raw.genre),
    starred: str(raw.starred),
    songs: songs.length > 0 ? songs : undefined,
  };
}

export function mapArtist(raw: Json): Artist {
  validate(ArtistSchema, raw, 'artist');
  return {
    id: str(raw.id) ?? '',
    name: str(raw.name) ?? 'Unknown artist',
    coverArt: str(raw.coverArt),
    albumCount: num(raw.albumCount),
    starred: str(raw.starred),
    albums: asArray(raw.album).map(mapAlbum),
  };
}

export function mapPlaylist(raw: Json): Playlist {
  validate(PlaylistSchema, raw, 'playlist');
  const songs = asArray(raw.entry).map(mapTrack);
  return {
    id: str(raw.id) ?? '',
    name: str(raw.name) ?? 'Untitled playlist',
    comment: str(raw.comment),
    owner: str(raw.owner),
    songCount: num(raw.songCount) ?? songs.length,
    duration: num(raw.duration),
    coverArt: str(raw.coverArt),
    songs: songs.length > 0 ? songs : undefined,
  };
}

function mapGenre(raw: Json): Genre {
  validate(GenreSchema, raw, 'genre');
  return {
    name: str(raw.value) ?? str(raw.name) ?? '',
    songCount: num(raw.songCount),
    albumCount: num(raw.albumCount),
  };
}

function mapNowPlaying(raw: Json): NowPlayingEntry {
  return {
    track: mapTrack(raw),
    username: str(raw.username),
    playerName: str(raw.playerName),
    playerId: num(raw.playerId),
    minutesAgo: num(raw.minutesAgo),
  };
}

function validate(schema: Parameters<typeof safeParse>[0], raw: unknown, label: string): void {
  const result = safeParse(schema, raw);
  if (!result.success) {
    logger.debug('Malformed Subsonic record', {
      label,
      issues: result.issues.length,
    });
  }
}

function extractEnvelope(data: unknown, endpoint: string): Json {
  const root = asRecord(data);
  const envelope = asRecord(
    root['subsonic-response'] ?? root.subsonicResponse ?? root,
  );
  const parsed = safeParse(SubsonicEnvelopeSchema, envelope);
  if (!parsed.success) {
    logger.warn('Malformed Subsonic envelope', {
      endpoint,
      issues: parsed.issues.length,
    });
    throw new SubsonicError(0, `Malformed response: ${endpoint}`, { endpoint });
  }
  if (parsed.output.status === 'failed') {
    const error = parsed.output.error;
    const code = typeof error?.code === 'number' ? error.code : Number(error?.code) || 0;
    throw new SubsonicError(code, error?.message ?? `Subsonic request failed: ${endpoint}`, {
      helpUrl: error?.helpUrl,
      endpoint,
    });
  }
  return envelope;
}

async function request(
  config: ServerConfig,
  endpoint: string,
  params: Record<string, string | number | boolean | string[] | undefined> = {},
  signal?: AbortSignal,
): Promise<Json> {
  const url = buildUrl(config, endpoint, params);
  const nonIdempotent = new Set([
    'scrobble',
    'star',
    'unstar',
    'updatePlaylist',
    'savePlayQueue',
  ]);
  const maxAttempts = nonIdempotent.has(endpoint) ? 1 : 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: config.headers,
      });
      if (!response.ok) {
        throw new SubsonicError(
          response.status,
          `HTTP ${response.status} from ${new URL(url).host}`,
          { endpoint },
        );
      }
      const data = (await response.json()) as unknown;
      return extractEnvelope(data, endpoint);
    } catch (error) {
      if (signal?.aborted) throw error;
      const status = error instanceof SubsonicError ? error.code : 0;
      const canRetry = attempt < maxAttempts - 1 && shouldRetryStatus(status, attempt);
      if (canRetry) {
        logger.debug('Retrying Subsonic request', { endpoint, attempt: attempt + 1, status });
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
        continue;
      }
      if (error instanceof SubsonicError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SubsonicError(0, `Request timed out: ${endpoint}`, { endpoint });
      }
      logger.error('Subsonic request failed', { endpoint, error });
      throw new SubsonicError(0, `Network error: ${endpoint}`, { endpoint });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  throw new SubsonicError(0, `Network error: ${endpoint}`, { endpoint });
}

export async function ping(config: ServerConfig, signal?: AbortSignal): Promise<void> {
  await request(config, 'ping', {}, signal);
  logger.info('Subsonic ping ok', { host: new URL(normalizeBaseUrl(config.url)).host });
}

export async function getOpenSubsonicExtensions(
  config: ServerConfig,
  signal?: AbortSignal,
): Promise<string[]> {
  const envelope = await request(config, 'getOpenSubsonicExtensions', {}, signal);
  return asArray(envelope.openSubsonicExtensions)
    .map((entry) => str(entry.name))
    .filter((name): name is string => Boolean(name));
}

export async function getAlbumList2(
  config: ServerConfig,
  type: AlbumListType = 'newest',
  options?: { size?: number; offset?: number; fromYear?: number; toYear?: number; genre?: string },
  signal?: AbortSignal,
): Promise<Album[]> {
  const envelope = await request(
    config,
    'getAlbumList2',
    {
      type,
      size: options?.size ?? 30,
      offset: options?.offset,
      fromYear: options?.fromYear,
      toYear: options?.toYear,
      genre: options?.genre,
    },
    signal,
  );
  return asArray(asRecord(envelope.albumList2).album).map(mapAlbum);
}

export async function getSong(
  config: ServerConfig,
  id: string,
  signal?: AbortSignal,
): Promise<Track> {
  const envelope = await request(config, 'getSong', { id }, signal);
  return mapTrack(asRecord(envelope.song));
}

export async function getAlbum(
  config: ServerConfig,
  id: string,
  signal?: AbortSignal,
): Promise<Album> {
  const envelope = await request(config, 'getAlbum', { id }, signal);
  return mapAlbum(asRecord(envelope.album));
}

export async function getArtists(
  config: ServerConfig,
  signal?: AbortSignal,
): Promise<Artist[]> {
  const envelope = await request(config, 'getArtists', {}, signal);
  const indexes = asArray(asRecord(envelope.artists).index);
  return indexes.flatMap((index) => asArray(index.artist).map(mapArtist));
}

export async function getArtist(
  config: ServerConfig,
  id: string,
  signal?: AbortSignal,
): Promise<Artist> {
  const envelope = await request(config, 'getArtist', { id }, signal);
  return mapArtist(asRecord(envelope.artist));
}

export async function getStarred2(
  config: ServerConfig,
  signal?: AbortSignal,
): Promise<{ songs: Track[]; albums: Album[]; artists: Artist[] }> {
  const envelope = await request(config, 'getStarred2', {}, signal);
  const result = asRecord(envelope.starred2);
  return {
    songs: asArray(result.song).map(mapTrack),
    albums: asArray(result.album).map(mapAlbum),
    artists: asArray(result.artist).map(mapArtist),
  };
}

export async function getPlaylists(
  config: ServerConfig,
  signal?: AbortSignal,
): Promise<Playlist[]> {
  const envelope = await request(config, 'getPlaylists', {}, signal);
  return asArray(asRecord(envelope.playlists).playlist).map(mapPlaylist);
}

export async function getPlaylist(
  config: ServerConfig,
  id: string,
  signal?: AbortSignal,
): Promise<Playlist> {
  const envelope = await request(config, 'getPlaylist', { id }, signal);
  return mapPlaylist(asRecord(envelope.playlist));
}

export async function updatePlaylist(
  config: ServerConfig,
  id: string,
  options: { songIdToAdd?: string; songIndexToRemove?: number; comment?: string },
  signal?: AbortSignal,
): Promise<void> {
  await request(
    config,
    'updatePlaylist',
    {
      playlistId: id,
      songIdToAdd: options.songIdToAdd,
      songIndexToRemove: options.songIndexToRemove,
      comment: options.comment,
    },
    signal,
  );
}

export async function getGenres(
  config: ServerConfig,
  signal?: AbortSignal,
): Promise<Genre[]> {
  const envelope = await request(config, 'getGenres', {}, signal);
  return asArray(asRecord(envelope.genres).genre).map(mapGenre);
}

export async function getSongsByGenre(
  config: ServerConfig,
  genre: string,
  options?: { count?: number; offset?: number },
  signal?: AbortSignal,
): Promise<Track[]> {
  const envelope = await request(
    config,
    'getSongsByGenre',
    { genre, count: options?.count ?? 50, offset: options?.offset },
    signal,
  );
  return asArray(asRecord(envelope.songsByGenre).song).map(mapTrack);
}

export async function search3(
  config: ServerConfig,
  query: string,
  options?: { artistCount?: number; albumCount?: number; songCount?: number },
  signal?: AbortSignal,
): Promise<SearchResult> {
  const envelope = await request(
    config,
    'search3',
    {
      query,
      artistCount: options?.artistCount ?? 10,
      albumCount: options?.albumCount ?? 20,
      songCount: options?.songCount ?? 30,
    },
    signal,
  );
  const result = asRecord(envelope.searchResult3);
  return {
    artists: asArray(result.artist).map(mapArtist),
    albums: asArray(result.album).map(mapAlbum),
    songs: asArray(result.song).map(mapTrack),
  };
}

export async function getRandomSongs(
  config: ServerConfig,
  options?: {
    size?: number;
    genre?: string;
    fromYear?: number;
    toYear?: number;
    musicFolderId?: string;
  },
  signal?: AbortSignal,
): Promise<Track[]> {
  const envelope = await request(
    config,
    'getRandomSongs',
    {
      size: options?.size ?? 100,
      genre: options?.genre,
      fromYear: options?.fromYear,
      toYear: options?.toYear,
      musicFolderId: options?.musicFolderId,
    },
    signal,
  );
  return asArray(asRecord(envelope.randomSongs).song).map(mapTrack);
}

export async function getNowPlaying(
  config: ServerConfig,
  signal?: AbortSignal,
): Promise<NowPlayingEntry[]> {
  const envelope = await request(config, 'getNowPlaying', {}, signal);
  return asArray(asRecord(envelope.nowPlaying).entry).map(mapNowPlaying);
}

export async function getLyricsBySongId(
  config: ServerConfig,
  id: string,
  signal?: AbortSignal,
): Promise<Lyrics | null> {
  const envelope = await request(config, 'getLyricsBySongId', { id }, signal);
  const list = asRecord(envelope.lyricsList);
  const structured = asArray(list.structuredLyrics);
  for (const entry of structured) {
    const lines: LyricsLine[] = asArray(entry.line)
      .map((line) => ({
        start: num(line.start) !== undefined ? (num(line.start) as number) / 1000 : undefined,
        value: str(line.value) ?? '',
      }))
      .filter((line) => line.value.length > 0);
    if (lines.length > 0) {
      return {
        lines,
        synced: Boolean(entry.synced) || isSynced(lines),
        source: 'structured',
        artist: str(entry.displayArtist),
        title: str(entry.displayTitle),
      };
    }
  }
  return null;
}

export async function getLyrics(
  config: ServerConfig,
  artist: string,
  title: string,
  signal?: AbortSignal,
): Promise<Lyrics | null> {
  const envelope = await request(config, 'getLyrics', { artist, title }, signal);
  const raw = str(asRecord(envelope.lyrics).value);
  if (!raw) return null;
  const lines = parseLrc(raw);
  if (!lines.length) return null;
  return {
    lines,
    synced: isSynced(lines),
    source: 'legacy',
    artist: str(asRecord(envelope.lyrics).artist),
    title: str(asRecord(envelope.lyrics).title),
  };
}

export async function scrobble(
  config: ServerConfig,
  id: string,
  options?: { submission?: boolean; time?: number },
  signal?: AbortSignal,
): Promise<void> {
  await request(
    config,
    'scrobble',
    { id, submission: options?.submission ?? true, time: options?.time },
    signal,
  );
}

export async function star(
  config: ServerConfig,
  id: string,
  options?: { albumId?: string; artistId?: string; remove?: boolean },
  signal?: AbortSignal,
): Promise<void> {
  await request(
    config,
    options?.remove ? 'unstar' : 'star',
    { id, albumId: options?.albumId, artistId: options?.artistId },
    signal,
  );
}

export async function getPlayQueue(
  config: ServerConfig,
  signal?: AbortSignal,
): Promise<{ entries: Track[]; current?: string; position?: number }> {
  const envelope = await request(config, 'getPlayQueue', {}, signal);
  const playQueue = asRecord(envelope.playQueue);
  return {
    entries: asArray(playQueue.entry).map(mapTrack),
    current: str(playQueue.current),
    position: num(playQueue.position),
  };
}

export async function savePlayQueue(
  config: ServerConfig,
  ids: string[],
  options?: { current?: string; position?: number },
  signal?: AbortSignal,
): Promise<void> {
  await request(
    config,
    'savePlayQueue',
    { id: ids, current: options?.current, position: options?.position },
    signal,
  );
}

export const subsonic = {
  ping,
  getOpenSubsonicExtensions,
  getAlbumList2,
  getAlbum,
  getArtists,
  getArtist,
  getStarred2,
  getPlaylists,
  getPlaylist,
  getGenres,
  getSongsByGenre,
  search3,
  getNowPlaying,
  getLyricsBySongId,
  getLyrics,
  scrobble,
  star,
  getPlayQueue,
  savePlayQueue,
};

export { buildCommonParams, buildUrl, normalizeBaseUrl };
