import { useEffect } from 'react';
import { Platform } from 'react-native';
import { buildCoverUrl } from '@/core/subsonic/params';
import { useAuthStore } from '@/stores/auth';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';

function getMediaSession(): MediaSession | null {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return null;
  }
  return navigator.mediaSession;
}

function MediaSessionMetadata() {
  const track = useCurrentTrack();
  const server = useAuthStore((state) => state.server);

  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession) return;

    if (track) {
      mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist ?? '',
        album: track.album ?? '',
        artwork:
          track.coverArt && server
            ? [
                {
                  src: buildCoverUrl(server, track.coverArt, 512),
                  sizes: '512x512',
                  type: 'image/jpeg',
                },
              ]
            : [],
      });
    } else {
      mediaSession.metadata = null;
    }
  }, [track, server]);

  return null;
}

function MediaSessionPlaybackState() {
  const status = usePlayerStore((state) => state.status);

  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession) return;
    mediaSession.playbackState =
      status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
  }, [status]);

  return null;
}

function MediaSessionProgress() {
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);

  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession || duration <= 0) return;
    try {
      mediaSession.setPositionState({
        duration,
        position: Math.min(position, duration),
        playbackRate: 1,
      });
    } catch {
      // Some browsers reject an out-of-range position during transitions.
    }
  }, [position, duration]);

  return null;
}

function MediaSessionHandlers() {
  useEffect(() => {
    const mediaSession = getMediaSession();
    if (!mediaSession) return;

    const player = usePlayerStore.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void player.play()],
      ['pause', () => void player.pause()],
      ['previoustrack', () => void player.previous()],
      ['nexttrack', () => void player.next()],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') void player.seek(details.seekTime);
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return null;
}

/**
 * Web Media Session bridge split by concern. Playback position updates at
 * ~2 Hz and must only update setPositionState; metadata, status and handlers
 * change far less often.
 */
export function WebMediaSession() {
  if (Platform.OS !== 'web') return null;
  return (
    <>
      <MediaSessionMetadata />
      <MediaSessionPlaybackState />
      <MediaSessionProgress />
      <MediaSessionHandlers />
    </>
  );
}
