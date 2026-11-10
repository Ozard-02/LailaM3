import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AlbumGrid } from '@/components/AlbumGrid';
import { BackButton } from '@/components/BackButton';
import { Screen } from '@/components/Screen';
import { useArtist } from '@/hooks/useLibrary';
import { offlineArtists } from '@/core/offline';
import { useTheme } from '@/theme/ThemeProvider';
import { paletteCoverUrl } from '@/theme/palette';
import { useAuthStore } from '@/stores/auth';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { Artwork } from '@/ui/Artwork';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const setArtworkFromUrl = theme.setArtworkFromUrl;
  const resetArtwork = theme.resetArtwork;
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const artist = useArtist(id);
  const server = useAuthStore((state) => state.server);
  const offline = useEffectiveOffline();
  const offlineIndex = useOfflineStore((state) => state.index);
  const offlineArtist = offline
    ? offlineArtists(offlineIndex).find((item) => item.id === id)
    : undefined;
  const activeArtist = offline ? offlineArtist : artist.data;

  useEffect(() => {
    if (activeArtist?.coverArt && server) {
      setArtworkFromUrl(paletteCoverUrl(server, activeArtist.coverArt));
    }
    return () => resetArtwork();
  }, [activeArtist?.coverArt, server, setArtworkFromUrl, resetArtwork]);

  if (!offline && artist.isLoading) {
    return (
      <Screen>
        <Skeleton style={{ width: 180, height: 180, borderRadius: 90 }} />
        <Skeleton style={{ width: 260, height: 34 }} />
      </Screen>
    );
  }

  if (!activeArtist) {
    if (!offline && artist.isError) {
      return (
        <Screen>
          <BackButton />
          <ErrorState
            title="Could not load this artist"
            message={
              artist.error instanceof Error
                ? artist.error.message
                : 'The server did not return this artist.'
            }
            onRetry={() => void artist.refetch()}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <BackButton />
        <EmptyState
          title={offline ? 'Not downloaded' : 'Artist unavailable'}
          message={
            offline
              ? 'Download an album by this artist to see it here.'
              : 'This artist no longer exists on the server.'
          }
        />
      </Screen>
    );
  }

  const data = activeArtist;
  const albums = data.albums ?? [];

  return (
    <Screen>
      <BackButton />
      <View style={[styles.header, compact && styles.headerCompact]}>
        <Artwork coverArt={data.coverArt} size={compact ? 150 : 190} radius={compact ? 75 : 95} />
        <View style={styles.headerText}>
          <Text variant="label" tone="accent">
            Artist
          </Text>
          <Text variant={compact ? 'largeTitle' : 'display'}>{data.name}</Text>
          <Text variant="body" tone="secondary">
            {data.albumCount ?? albums.length} albums
          </Text>
        </View>
      </View>

      {albums.length ? <AlbumGrid albums={albums} /> : <EmptyState title="No albums" />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 24,
  },
  headerCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
});
