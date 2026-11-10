import { Pin } from '@/ui/icons';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlbumGrid } from '@/components/AlbumGrid';
import { BackButton } from '@/components/BackButton';
import { DownloadButton } from '@/components/DownloadButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { TrackRow } from '@/components/TrackRow';
import {
  downloadedTracks,
  estimateDownloadBytes,
  FAVOURITES_COLLECTION,
  offlineAlbums,
} from '@/core/offline';
import { useStarred } from '@/hooks/useLibrary';
import { usePinsStore } from '@/stores/pins';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { IconButton } from '@/ui/IconButton';

export default function FavouritesScreen() {
  const theme = useTheme();
  const starred = useStarred();
  const pinned = usePinsStore((state) => state.favourites);
  const toggleFavourites = usePinsStore((state) => state.toggleFavourites);
  const offline = useEffectiveOffline();
  const index = useOfflineStore((state) => state.index);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const downloadTracks = useOfflineStore((state) => state.downloadTracks);
  const downloadQuality = useSettingsStore((state) => state.downloadQuality);

  const songs = useMemo(() => {
    if (offline) return downloadedTracks(index).filter((track) => track.starred);
    return starred.data?.songs ?? [];
  }, [index, offline, starred.data?.songs]);

  const albums = useMemo(() => {
    if (offline) {
      return offlineAlbums(index).filter((album) =>
        (album.songs ?? []).some((track) => track.starred),
      );
    }
    return starred.data?.albums ?? [];
  }, [index, offline, starred.data?.albums]);

  return (
    <Screen title="Favourited" subtitle="Starred tracks and albums.">
      <View style={styles.topBar}>
        <BackButton />
        <View style={styles.actions}>
          {!offline && songs.length ? (
            <DownloadButton
              trackIds={songs.map((track) => track.id)}
              label="Download"
              onDownload={() => downloadTracks(songs, FAVOURITES_COLLECTION)}
              estimatedBytes={estimateDownloadBytes(songs, downloadQuality)}
            />
          ) : null}
          <IconButton
            label={pinned ? 'Unpin favourites' : 'Pin favourites'}
            size={40}
            variant="soft"
            selected={pinned}
            onPress={toggleFavourites}
          >
            <Pin
              size={18}
              color={pinned ? theme.colors.accent : theme.colors.text}
              fill={pinned ? theme.colors.accent : 'transparent'}
            />
          </IconButton>
        </View>
      </View>
      {songs.length ? (
        <View style={styles.section}>
          <SectionHeader title="Songs" />
          {songs.map((track, songIndex) => (
            <TrackRow
              key={track.id}
              track={track}
              index={songIndex}
              onPlay={() => void playTracks(songs, songIndex)}
            />
          ))}
        </View>
      ) : null}

      {albums.length ? (
        <View style={styles.section}>
          <SectionHeader title="Albums" />
          <AlbumGrid albums={albums} />
        </View>
      ) : null}

      {!offline && starred.isError ? (
        <ErrorState
          title="Could not load favourites"
          message={
            starred.error instanceof Error
              ? starred.error.message
              : 'The server did not return starred music.'
          }
          onRetry={() => void starred.refetch()}
        />
      ) : !songs.length && !albums.length ? (
        <EmptyState
          title="No favourites yet"
          message="Tap the heart in the player or use Add to playlist → Favourited."
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: {
    gap: 4,
  },
});
