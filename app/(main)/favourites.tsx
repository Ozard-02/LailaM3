import { Pin } from '@/ui/icons';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AlbumGrid } from '@/components/AlbumGrid';
import { BackButton } from '@/components/BackButton';
import { DownloadButton } from '@/components/DownloadButton';
import { SectionHeader } from '@/components/SectionHeader';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import {
  downloadedTracks,
  estimateDownloadBytes,
  FAVOURITES_COLLECTION,
  offlineAlbums,
} from '@/core/offline';
import { useStarred } from '@/hooks/useLibrary';
import type { Album, Track } from '@/core/models';
import { usePinsStore } from '@/stores/pins';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { ErrorState } from '@/ui/ErrorState';
import { IconButton } from '@/ui/IconButton';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

const EMPTY_TRACKS: Track[] = [];
const EMPTY_ALBUMS: Album[] = [];

export default function FavouritesScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const padding = compact ? 16 : 28;
  const starred = useStarred();
  const pinned = usePinsStore((state) => state.favourites);
  const toggleFavourites = usePinsStore((state) => state.toggleFavourites);
  const offline = useEffectiveOffline();
  // Subscribe to the slices, not the whole index: cover-only writes must not
  // trigger the downloads scan. The scan itself only runs while offline.
  const indexTracks = useOfflineStore((state) => state.index.tracks);
  const indexCollections = useOfflineStore((state) => state.index.collections);
  const localIndex = useMemo(
    () => ({
      version: 1 as const,
      tracks: indexTracks,
      collections: indexCollections,
      covers: {},
    }),
    [indexCollections, indexTracks],
  );
  const playTracks = usePlayerStore((state) => state.playTracks);
  const downloadTracks = useOfflineStore((state) => state.downloadTracks);
  const downloadQuality = useSettingsStore((state) => state.downloadQuality);

  // Prefer the server answer once it exists, but show downloaded favourites
  // immediately on first open instead of waiting for getStarred2. Once the
  // server response is cached, skip the O(N) offline scan while online.
  const hasServerData = Boolean(starred.data);
  const useLocalFallback = offline || !hasServerData;

  const localSongs = useMemo(
    () =>
      useLocalFallback
        ? downloadedTracks(localIndex).filter((track) => track.starred)
        : EMPTY_TRACKS,
    [localIndex, useLocalFallback],
  );
  const localAlbums = useMemo(
    () =>
      useLocalFallback
        ? offlineAlbums(localIndex).filter((album) =>
            (album.songs ?? []).some((track) => track.starred),
          )
        : EMPTY_ALBUMS,
    [localIndex, useLocalFallback],
  );

  const songs = useLocalFallback ? localSongs : (starred.data?.songs ?? EMPTY_TRACKS);
  const albums = useLocalFallback ? localAlbums : (starred.data?.albums ?? EMPTY_ALBUMS);
  const loading = !offline && !hasServerData && (starred.isLoading || starred.isFetching);
  const showSkeleton = loading && songs.length === 0;
  const showEmpty = !loading && songs.length === 0 && albums.length === 0;

  const header = (
    <View style={{ paddingHorizontal: padding, gap: 16 }}>
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
      <View style={styles.titleBlock}>
        <Text variant={compact ? 'largeTitle' : 'display'}>Favourited</Text>
        <Text variant="body" tone="secondary">
          Starred tracks and albums.
        </Text>
      </View>
      {showSkeleton ? (
        <View style={styles.loadingRows}>
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} style={styles.loadingRow} />
          ))}
        </View>
      ) : songs.length ? (
        <SectionHeader title="Songs" />
      ) : null}
    </View>
  );

  const footer = (
    <View style={{ paddingHorizontal: padding, gap: 20 }}>
      {albums.length ? (
        <View style={styles.section}>
          <SectionHeader title="Albums" />
          <AlbumGrid albums={albums} />
        </View>
      ) : null}
      {!offline && starred.isError && songs.length ? (
        <ErrorNotice
          message="Could not refresh favourites. Showing cached music."
          focus={false}
        />
      ) : null}
      {showEmpty ? (
        offline ? (
          <EmptyState
            title="No downloaded favourites"
            message="Download starred music to see it here offline."
          />
        ) : starred.isError ? (
          <ErrorState
            title="Could not load favourites"
            message={
              starred.error instanceof Error
                ? starred.error.message
                : 'The server did not return starred music.'
            }
            onRetry={() => void starred.refetch()}
          />
        ) : (
          <EmptyState
            title="No favourites yet"
            message="Tap the heart in the player or use Add to playlist → Favourited."
          />
        )
      ) : null}
    </View>
  );

  return (
    <VirtualTrackList
      tracks={songs}
      header={header}
      footer={footer}
      onPlay={(index) => void playTracks(songs, index)}
    />
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
  titleBlock: {
    gap: 4,
  },
  loadingRows: {
    gap: 6,
  },
  loadingRow: {
    width: '100%',
    height: 56,
    borderRadius: 10,
  },
  section: {
    gap: 4,
  },
});
