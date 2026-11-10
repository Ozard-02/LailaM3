import type { Playlist, ServerConfig, Track } from '../models';
import { getPlaylist, getPlaylists } from '../subsonic/client';
import { logger } from '../utils/logger';

export function exclusiveTag(username: string): string {
  return `#${username}-exclusive`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isPlaylistExclusive(playlist: Playlist, username: string): boolean {
  const tag = exclusiveTag(username);
  return new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=\\s|$)`).test(playlist.comment ?? '');
}

/**
 * Adds or removes the exclusive tag in a playlist comment, preserving all other
 * text. The server comment stays the source of truth for shuffle exclusions.
 */
export function withExclusiveComment(
  comment: string | undefined,
  username: string,
  exclusive: boolean,
): string {
  const tag = exclusiveTag(username);
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=\\s|$)`, 'g');
  const cleaned = (comment ?? '').replace(pattern, ' ').replace(/\s+/g, ' ').trim();
  if (!exclusive) return cleaned;
  return cleaned ? `${cleaned} ${tag}` : tag;
}

/**
 * Fetches the song ids of every playlist tagged `#<user>-exclusive`.
 * In strict mode a server failure rejects instead of returning an empty set,
 * so a manual Shuffle can keep the last cache rather than play unfiltered.
 */
export async function fetchExcludedSongIds(
  config: ServerConfig,
  options?: { strict?: boolean },
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!config.username) return ids;

  try {
    const playlists = await getPlaylists(config);
    const exclusive = playlists.filter((playlist) => isPlaylistExclusive(playlist, config.username));
    await Promise.all(
      exclusive.map(async (playlist) => {
        try {
          const full = await getPlaylist(config, playlist.id);
          for (const track of full.songs ?? []) ids.add(track.id);
        } catch (error) {
          logger.warn('Could not read exclusive playlist', {
            playlistId: playlist.id,
            error,
          });
          if (options?.strict) throw error;
        }
      }),
    );
  } catch (error) {
    logger.warn('Could not load playlists for exclusions', { error });
    if (options?.strict) throw error;
  }

  return ids;
}

export function filterExcludedSongs(songs: Track[], excluded: Set<string>): Track[] {
  if (excluded.size === 0) return songs;
  return songs.filter((song) => !excluded.has(song.id));
}
