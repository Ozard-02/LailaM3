import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';

/** Moves a queue row to the configured Trash playlist and offers Undo. */
export function useTrashAction() {
  const router = useRouter();
  const trashTrack = usePlayerStore((state) => state.trashTrack);
  const undoTrash = usePlayerStore((state) => state.undoTrash);
  const showToast = useUIStore((state) => state.showToast);

  return useCallback(
    async (index: number) => {
      let outcome;
      try {
        outcome = await trashTrack(index);
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
    [router, showToast, trashTrack, undoTrash],
  );
}
