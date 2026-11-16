import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { Album, Track } from '@/core/models';
import type { TrashAlbumOutcome, TrashOutcome, TrashUndoResult } from '@/core/trash';
import { usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';

type AnyTrashOutcome = TrashOutcome | TrashAlbumOutcome;

/**
 * Shared Trash feedback: one set of failure and success toasts for queue rows,
 * library rows and albums, so every entry point behaves the same way.
 */
function useTrashFeedback() {
  const router = useRouter();
  const undoTrash = usePlayerStore((state) => state.undoTrash);
  const undoTrashAlbum = usePlayerStore((state) => state.undoTrashAlbum);
  const showToast = useUIStore((state) => state.showToast);

  return useCallback(
    async (run: () => Promise<AnyTrashOutcome>, noun: 'track' | 'album') => {
      let outcome: AnyTrashOutcome;
      try {
        outcome = await run();
      } catch {
        showToast({ message: `Could not move the ${noun} to Trash.`, tone: 'error' });
        return false;
      }
      if (!outcome.ok) {
        if (outcome.reason === 'no-playlist') {
          showToast({
            message: 'Set a Trash playlist in Settings.',
            actionLabel: 'Settings',
            onAction: () => router.push('/(main)/settings'),
          });
        } else if (outcome.reason === 'offline') {
          showToast({ message: 'Trash needs a connection.', tone: 'error' });
        } else {
          showToast({
            message: outcome.message ?? `Could not move the ${noun} to Trash.`,
            tone: 'error',
          });
        }
        return false;
      }

      const { undo, warning } = outcome;
      const title = 'track' in undo ? undo.track.title : undo.albumName;
      const restore = (): Promise<TrashUndoResult> =>
        'track' in undo ? undoTrash(undo) : undoTrashAlbum(undo);
      showToast({
        message: warning
          ? `Moved “${title}” to Trash. ${warning}`
          : `Moved “${title}” to Trash.`,
        actionLabel: 'Undo',
        onAction: () => {
          void restore().then((result) => {
            if (result.warning) {
              showToast({ message: `Restored to queue. ${result.warning}`, tone: 'error' });
            }
          });
        },
      });
      return true;
    },
    [router, showToast, undoTrash, undoTrashAlbum],
  );
}

/** Moves a queue row to the configured Trash playlist and offers Undo. */
export function useTrashAction() {
  const trashTrack = usePlayerStore((state) => state.trashTrack);
  const feedback = useTrashFeedback();

  return useCallback(
    (index: number) => feedback(() => trashTrack(index), 'track'),
    [feedback, trashTrack],
  );
}

/** Moves a library track (album, playlist, favourites, search) to Trash. */
export function useTrashTrackAction() {
  const trashLibraryTrack = usePlayerStore((state) => state.trashLibraryTrack);
  const feedback = useTrashFeedback();

  return useCallback(
    (track: Track) => feedback(() => trashLibraryTrack(track), 'track'),
    [feedback, trashLibraryTrack],
  );
}

/** Moves every track of an album to the configured Trash playlist. */
export function useTrashAlbumAction() {
  const trashAlbum = usePlayerStore((state) => state.trashAlbum);
  const feedback = useTrashFeedback();

  return useCallback(
    (album: Album) => feedback(() => trashAlbum(album), 'album'),
    [feedback, trashAlbum],
  );
}
