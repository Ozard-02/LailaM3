import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Play, Search as SearchIcon, Shuffle, Sparkles } from '@/ui/icons';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { getAlbum } from '@/core/subsonic/client';
import type { Album, Playlist } from '@/core/models';
import { downloadedTracks, offlineAlbums, offlinePlaylists } from '@/core/offline';
import { shuffled } from '@/core/queue/reducer';
import { AlbumGrid } from '@/components/AlbumGrid';
import { AlbumRow } from '@/components/AlbumRow';
import { FavouriteCard } from '@/components/FavouriteCard';
import { OfflineNotice } from '@/components/OfflineNotice';
import { PlaylistGrid } from '@/components/PlaylistGrid';
import { PlaylistRow } from '@/components/PlaylistRow';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { useAlbums, usePlaylists, useServer } from '@/hooks/useLibrary';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePinsStore } from '@/stores/pins';
import { usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { ErrorState } from '@/ui/ErrorState';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Late night listening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function LoadingRows() {
  return (
    <View style={styles.loading}>
      <Skeleton style={{ width: 220, height: 220, borderRadius: 12 }} />
      <View style={styles.loadingText}>
        <Skeleton style={{ width: 260, height: 28 }} />
        <Skeleton style={{ width: 180, height: 18 }} />
        <Skeleton style={{ width: 140, height: 40, borderRadius: 999 }} />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const server = useServer();
  const recent = useAlbums('recent', 12, { refetchOnMount: 'always' });
  const newest = useAlbums('newest', 12);
  const playlists = usePlaylists();
  const playTracks = usePlayerStore((state) => state.playTracks);
  const playRandom = usePlayerStore((state) => state.playRandom);
  const [starting, setStarting] = useState(false);
  const [shuffleError, setShuffleError] = useState<string | null>(null);
  const offline = useEffectiveOffline();
  const offlineIndex = useOfflineStore((state) => state.index);
  const offlineAlbumList = useMemo(() => offlineAlbums(offlineIndex), [offlineIndex]);
  const offlinePlaylistList = useMemo(() => offlinePlaylists(offlineIndex), [offlineIndex]);
  const albumsData = offline ? offlineAlbumList : (recent.data ?? []);
  const newestData = offline ? offlineAlbumList : (newest.data ?? []);
  const playlistData = offline ? offlinePlaylistList : (playlists.data ?? []);
  const loading = !offline && recent.isLoading;
  const pinnedAlbums = usePinsStore((state) => state.albums);
  const pinnedPlaylists = usePinsStore((state) => state.playlists);
  const favouritesPinned = usePinsStore((state) => state.favourites);
  const offlineAlbumById = useMemo(
    () => new Map(offlineAlbumList.map((album) => [album.id, album])),
    [offlineAlbumList],
  );
  const offlinePlaylistById = useMemo(
    () => new Map(offlinePlaylistList.map((playlist) => [playlist.id, playlist])),
    [offlinePlaylistList],
  );
  const pinnedAlbumData = offline
    ? pinnedAlbums
        .map((album) => offlineAlbumById.get(album.id))
        .filter((album): album is Album => Boolean(album))
    : pinnedAlbums;
  const pinnedPlaylistData = offline
    ? pinnedPlaylists
        .map((playlist) => offlinePlaylistById.get(playlist.id))
        .filter((playlist): playlist is Playlist => Boolean(playlist))
    : pinnedPlaylists;

  const featured: Album | undefined = albumsData[0] ?? newestData[0];

  const playAlbum = useCallback(
    async (album: Album) => {
      setStarting(true);
      try {
        const full = album.songs ? album : await getAlbum(server, album.id);
        if (full.songs?.length) await playTracks(full.songs);
      } finally {
        setStarting(false);
      }
    },
    [playTracks, server],
  );

  const shuffleLibrary = useCallback(async () => {
    setStarting(true);
    setShuffleError(null);
    try {
      if (offline) {
        const tracks = downloadedTracks(offlineIndex);
        if (!tracks.length) {
          setShuffleError('No downloaded songs to shuffle.');
          return;
        }
        await playTracks(shuffled(tracks), 0);
        return;
      }
      const started = await playRandom();
      if (!started) {
        setShuffleError('No songs to shuffle. Check the server library or the exclusive playlists.');
      }
    } finally {
      setStarting(false);
    }
  }, [offline, offlineIndex, playRandom, playTracks]);

  const recentPlaylists: Playlist[] = playlistData.slice(0, 8);
  const loadError = !offline && (recent.isError || newest.isError || playlists.isError);
  const retryAll = () => {
    void recent.refetch();
    void newest.refetch();
    void playlists.refetch();
  };

  return (
    <Screen
      title={greeting()}
      subtitle={offline ? 'Downloaded music, no network needed.' : 'A quiet place for your own music.'}
      right={
        <View style={styles.headerActions}>
          <IconButton
            label="Search"
            size={34}
            onPress={() => router.push('/(main)/search')}
          >
            <SearchIcon size={16} color={theme.colors.textSecondary} />
          </IconButton>
          <Button
            label="Shuffle"
            size="sm"
            variant="secondary"
            icon={<Shuffle size={15} color={theme.colors.text} />}
            onPress={() => void shuffleLibrary()}
            loading={starting}
          />
        </View>
      }
    >
      <OfflineNotice />

      {loadError && !albumsData.length ? (
        <ErrorState
          title="Could not reach your library"
          message="Check the server address and connection, then try again."
          onRetry={retryAll}
        />
      ) : null}
      {loadError && albumsData.length ? (
        <View style={styles.inlineError}>
          <ErrorNotice
            message="Some sections could not be refreshed. Cached music is still available."
            focus={false}
          />
          <Button label="Retry" size="sm" variant="ghost" onPress={retryAll} />
        </View>
      ) : null}
      {shuffleError ? <ErrorNotice message={shuffleError} /> : null}

      {loading ? <LoadingRows /> : null}

      {featured && !loading ? (
        <View
          style={[
            styles.hero,
            compact && styles.heroCompact,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <Artwork
            coverArt={featured.coverArt}
            size={compact ? 150 : 230}
            radius={theme.radius.md}
          />
          <View style={styles.heroText}>
            <View style={styles.eyebrow}>
              <Sparkles size={14} color={theme.colors.accent} />
              <Text variant="label" tone="accent">
                {offline ? 'Downloaded' : 'Recently played'}
              </Text>
            </View>
            <Text variant={compact ? 'title' : 'display'} numberOfLines={2}>
              {featured.name}
            </Text>
            <Text variant="body" tone="secondary" numberOfLines={1}>
              {featured.artist ?? 'Unknown artist'}
            </Text>
            <View style={styles.heroActions}>
              <Button
                label="Play album"
                icon={<Play size={16} color="#fff" fill="#fff" />}
                onPress={() => void playAlbum(featured)}
                loading={starting}
              />
              <Button
                label="Open"
                variant="secondary"
                onPress={() => router.push(`/(main)/album/${featured.id}` as never)}
              />
            </View>
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={[theme.colors.accentSoft, 'transparent']}
            style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.lg }]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.2, y: 1 }}
          />
        </View>
      ) : null}

      {pinnedAlbumData.length || pinnedPlaylistData.length || favouritesPinned ? (
        <View style={styles.pinned}>
          <SectionHeader title="Pinned" />
          {pinnedAlbumData.length ? <AlbumRow albums={pinnedAlbumData} /> : null}
          {pinnedPlaylistData.length || favouritesPinned ? (
            <PlaylistRow playlists={pinnedPlaylistData} showFavourites={favouritesPinned} />
          ) : null}
        </View>
      ) : null}

      {albumsData.length ? (
        <View>
          <SectionHeader title={offline ? 'Downloaded albums' : 'Recently played'} />
          <AlbumRow albums={albumsData} />
        </View>
      ) : null}

      <View>
        <SectionHeader title={offline ? 'Downloaded playlists' : 'Your playlists'} />
        {!offline && playlists.isLoading ? (
          <View style={styles.cardSkeletons}>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} style={{ width: 158, height: 158, borderRadius: 8 }} />
            ))}
          </View>
        ) : (
          <PlaylistGrid
            playlists={recentPlaylists}
            leading={(width) => <FavouriteCard width={width} />}
          />
        )}
      </View>

      <View>
        <SectionHeader
          title={offline ? 'All downloads' : 'Recently added'}
          right={
            <Button label="Library" size="sm" variant="ghost" onPress={() => router.push('/(main)/library')} />
          }
        />
        {!offline && newest.isLoading ? (
          <View style={styles.cardSkeletons}>
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} style={{ width: 158, height: 158, borderRadius: 8 }} />
            ))}
          </View>
        ) : newestData.length ? (
          <AlbumGrid albums={newestData} />
        ) : offline ? (
          <EmptyState
            title="No downloads yet"
            message="Download an album or playlist from the server to listen offline."
          />
        ) : (
          <EmptyState title="No albums yet" message="Your Navidrome library appears here." />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-end',
  },
  loadingText: {
    gap: 12,
    flex: 1,
  },
  hero: {
    flexDirection: 'row',
    gap: 22,
    padding: 18,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  heroText: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  pinned: {
    gap: 16,
  },
  cardSkeletons: {
    flexDirection: 'row',
    gap: 18,
    flexWrap: 'wrap',
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
