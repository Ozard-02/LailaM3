import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { Track } from '@/core/models';
import type { TrashOutcome } from '@/core/trash';
import { usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';

/**
 * Shared Trash feedback: queue rows and library rows use the same failure and
 * success toasts, so both entry points behave the same way.
 */
function useTrashFeedback() {
  const router = useRouter();
  const undoTrash = usePlayerStore((state) => state.undoTrash);
  const showToast = useUIStore((state) => state.showToast);

  return useCallback(
    async (run: () => Promise<TrashOutcome>) => {
      let outcome: TrashOutcome;
      try {
        outcome = await run();
      } catch {
        showToast({ message: 'Could not move the track to Trash.', tone: 'error' });
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
            message: outcome.message ?? 'Could not move the track to Trash.',
            tone: 'error',
          });
        }
        return false;
      }

      const title = outcome.undo.track.title;
      showToast({
        message: outcome.warning
          ? `Moved “${title}” to Trash. ${outcome.warning}`
          : `Moved “${title}” to Trash.`,
        actionLabel: 'Undo',
        onAction: () => {
          void undoTrash(outcome.undo).then((result) => {
            if (result.warning) {
              showToast({ message: `Restored to queue. ${result.warning}`, tone: 'error' });
            }
          });
        },
      });
      return true;
    },
    [router, showToast, undoTrash],
  );
}

/** Moves a queue row to the configured Trash playlist and offers Undo. */
export function useTrashAction() {
  const trashTrack = usePlayerStore((state) => state.trashTrack);
  const feedback = useTrashFeedback();

  return useCallback(
    (index: number) => feedback(() => trashTrack(index)),
    [feedback, trashTrack],
  );
}

/** Moves a library track (album, playlist, favourites, search) to Trash. */
export function useTrashTrackAction() {
  const trashLibraryTrack = usePlayerStore((state) => state.trashLibraryTrack);
  const feedback = useTrashFeedback();

  return useCallback(
    (track: Track) => feedback(() => trashLibraryTrack(track)),
    [feedback, trashLibraryTrack],
  );
}
