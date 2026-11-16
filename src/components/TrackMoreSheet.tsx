import { Disc3, Download, ListMusic, ListPlus, ListStart, Trash2, User } from '@/ui/icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { Track } from '@/core/models';
import { useTrashTrackAction } from '@/hooks/useTrashAction';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';
import { ActionSheet, type ActionSheetItem } from '@/ui/ActionSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';

/**
 * Per-track actions for the album, playlist and favourites lists. Opened by
 * long-pressing a row or by its ••• button, so touch, mouse and keyboard all
 * reach the same menu.
 */
export function TrackMoreSheet({
  track,
  parentAlbumId,
  onClose,
}: {
  track: Track;
  /** Hides "Open album" when the list already is that album. */
  parentAlbumId?: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const downloadTracks = useOfflineStore((state) => state.downloadTracks);
  const offline = useEffectiveOffline();
  const trashTrack = useTrashTrackAction();
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // The action sheet unmounts itself before the playlist picker takes over, so
  // the two bottom sheets never fight for the same animation.
  const items: ActionSheetItem[] = [
    {
      label: 'Add to next',
      icon: <ListStart size={18} color={theme.colors.textSecondary} />,
      onPress: () => {
        addToQueue([track], 'next');
        onClose();
      },
    },
    {
      label: 'Add to queue',
      icon: <ListPlus size={18} color={theme.colors.textSecondary} />,
      onPress: () => {
        addToQueue([track], 'end');
        onClose();
      },
    },
    ...(offline
      ? []
      : [
          {
            label: 'Add to playlist',
            icon: <ListMusic size={18} color={theme.colors.textSecondary} />,
            onPress: () => setPlaylistOpen(true),
          },
        ]),
    ...(offline
      ? []
      : [
          {
            label: 'Download',
            icon: <Download size={18} color={theme.colors.textSecondary} />,
            onPress: () => {
              downloadTracks([track]);
              onClose();
            },
          },
        ]),
    ...(track.albumId && track.albumId !== parentAlbumId
      ? [
          {
            label: 'Open album',
            icon: <Disc3 size={18} color={theme.colors.textSecondary} />,
            onPress: () => {
              onClose();
              router.push(`/(main)/album/${track.albumId}` as never);
            },
          },
        ]
      : []),
    ...(track.artistId
      ? [
          {
            label: 'Open artist',
            icon: <User size={18} color={theme.colors.textSecondary} />,
            onPress: () => {
              onClose();
              router.push(`/(main)/artist/${track.artistId}` as never);
            },
          },
        ]
      : []),
    ...(offline
      ? []
      : [
          {
            label: 'Move to Trash',
            icon: <Trash2 size={18} color={theme.colors.danger} />,
            onPress: () => {
              onClose();
              void trashTrack(track);
            },
          },
        ]),
  ];

  return (
    <>
      <ActionSheet visible={!playlistOpen} title={track.title} items={items} onClose={onClose} />
      {playlistOpen ? (
        <AddToPlaylistSheet tracks={[track]} onClose={onClose} />
      ) : null}
    </>
  );
}
