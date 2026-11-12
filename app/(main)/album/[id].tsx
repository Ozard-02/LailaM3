import { useLocalSearchParams, useRouter } from 'expo-router';
import { ListMusic, ListPlus, ListStart, MoreHorizontal, Pin, Play, Shuffle, User, X } from '@/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AddToPlaylistSheet } from '@/components/AddToPlaylistSheet';
import { BackButton } from '@/components/BackButton';
import { DownloadButton } from '@/components/DownloadButton';
import { Screen } from '@/components/Screen';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import { useAlbum } from '@/hooks/useLibrary';
import type { Track } from '@/core/models';
import { estimateDownloadBytes, offlineAlbums } from '@/core/offline';
import { paletteCoverUrl } from '@/theme/palette';
import { useAuthStore } from '@/stores/auth';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePinsStore } from '@/stores/pins';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { ActionSheet, type ActionSheetItem } from '@/ui/ActionSheet';
import { Artwork } from '@/ui/Artwork';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { ErrorState } from '@/ui/ErrorState';
import { IconButton } from '@/ui/IconButton';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { formatDurationLong, trackCount } from '@/utils/format';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const setArtworkFromUrl = theme.setArtworkFromUrl;
  const resetArtwork = theme.resetArtwork;
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const padding = width < 600 ? 16 : 28;
  const album = useAlbum(id);
  const server = useAuthStore((state) => state.server);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const playShuffled = usePlayerStore((state) => state.playShuffled);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const downloadAlbum = useOfflineStore((state) => state.downloadAlbum);
  const downloadQuality = useSettingsStore((state) => state.downloadQuality);
  const offline = useEffectiveOffline();
  const offlineIndex = useOfflineStore((state) => state.index);
  const pinned = usePinsStore((state) => state.albums.some((item) => item.id === id));
  const toggleAlbumPin = usePinsStore((state) => state.toggleAlbum);
  const offlineAlbum = useMemo(
    () => (offline ? offlineAlbums(offlineIndex).find((item) => item.id === id) : undefined),
    [offline, offlineIndex, id],
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [shuffleError, setShuffleError] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[] | null>(null);

  const activeAlbum = offline ? offlineAlbum : album.data;
  useEffect(() => {
    if (activeAlbum?.coverArt && server) {
      setArtworkFromUrl(paletteCoverUrl(server, activeAlbum.coverArt));
    }
    return () => resetArtwork();
  }, [activeAlbum?.coverArt, server, setArtworkFromUrl, resetArtwork]);

  if (!offline && album.isLoading) {
    return (
      <Screen>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <Skeleton style={{ width: 220, height: 220, borderRadius: 12 }} />
          <View style={styles.headerText}>
            <Skeleton style={{ width: 280, height: 34 }} />
            <Skeleton style={{ width: 180, height: 20 }} />
            <Skeleton style={{ width: 140, height: 44, borderRadius: 999 }} />
          </View>
        </View>
      </Screen>
    );
  }

  if (!activeAlbum) {
    if (!offline && album.isError) {
      return (
        <Screen>
          <BackButton />
          <ErrorState
            title="Could not load this album"
            message={
              album.error instanceof Error
                ? album.error.message
                : 'The server did not return this album.'
            }
            onRetry={() => void album.refetch()}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <BackButton />
        <EmptyState
          title={offline ? 'Not downloaded' : 'Album unavailable'}
          message={
            offline
              ? 'Download this album while online to listen to it here.'
              : 'This album no longer exists on the server.'
          }
        />
      </Screen>
    );
  }

  const data = activeAlbum;
  const songs = data.songs ?? [];
  const total = songs.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  const downloadEstimate = estimateDownloadBytes(songs, downloadQuality);
  const moreItems: ActionSheetItem[] = [
    {
      label: 'Add album to next',
      icon: <ListStart size={18} color={theme.colors.textSecondary} />,
      onPress: () => {
        addToQueue(songs, 'next');
        setMoreOpen(false);
      },
    },
    {
      label: 'Add album to queue',
      icon: <ListPlus size={18} color={theme.colors.textSecondary} />,
      onPress: () => {
        addToQueue(songs, 'end');
        setMoreOpen(false);
      },
    },
    {
      label: 'Add album to playlist',
      icon: <ListMusic size={18} color={theme.colors.textSecondary} />,
      onPress: () => {
        setMoreOpen(false);
        setPlaylistTracks(songs);
      },
    },
    {
      label: pinned ? 'Unpin album' : 'Pin album',
      icon: (
        <Pin
          size={18}
          color={pinned ? theme.colors.accent : theme.colors.textSecondary}
          fill={pinned ? theme.colors.accent : 'transparent'}
        />
      ),
      onPress: () => {
        setMoreOpen(false);
        toggleAlbumPin(data);
      },
    },
    ...(data.artistId
      ? [
          {
            label: 'Open artist',
            icon: <User size={18} color={theme.colors.textSecondary} />,
            onPress: () => {
              setMoreOpen(false);
              router.push(`/(main)/artist/${data.artistId}` as never);
            },
          },
        ]
      : []),
    {
      label: 'Close',
      icon: <X size={18} color={theme.colors.textSecondary} />,
      onPress: () => setMoreOpen(false),
    },
  ];

  const header = (
    <View style={{ paddingHorizontal: padding, gap: 20 }}>
      <View style={styles.topBar}>
        <BackButton />
        <IconButton
          label="More album options"
          size={40}
          variant="soft"
          onPress={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={20} color={theme.colors.text} />
        </IconButton>
      </View>
      <View style={[styles.header, compact && styles.headerCompact, !compact && styles.headerWide]}>
        <Artwork coverArt={data.coverArt} size={compact ? 180 : 230} radius={theme.radius.md} />
        <View style={styles.headerText}>
          <Text variant="label" tone="accent">
            Album
          </Text>
          <Text variant={compact ? 'largeTitle' : 'display'}>{data.name}</Text>
          <Text variant="body" tone="secondary">
            {data.artist ?? 'Unknown artist'}
            {data.year ? ` · ${data.year}` : ''}
            {songs.length ? ` · ${trackCount(songs.length, 'track')}` : ''}
            {total ? ` · ${formatDurationLong(total)}` : ''}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Play"
              icon={<Play size={16} color="#fff" fill="#fff" />}
              onPress={() => songs.length && void playTracks(songs, 0)}
            />
            <Button
              label="Shuffle"
              variant="secondary"
              icon={<Shuffle size={16} color={theme.colors.text} />}
              onPress={() => {
                if (!songs.length) return;
                void playShuffled(songs).then((ok) =>
                  setShuffleError(
                    ok ? null : 'Nothing to shuffle: every track here is excluded.',
                  ),
                );
              }}
            />
            <Button
              label="Queue"
              variant="ghost"
              icon={<ListPlus size={16} color={theme.colors.textSecondary} />}
              onPress={() => addToQueue(songs, 'end')}
            />
            {offline ? null : (
              <DownloadButton
                trackIds={songs.map((track) => track.id)}
                label="Download"
                onDownload={() => downloadAlbum(data)}
                estimatedBytes={downloadEstimate}
              />
            )}
          </View>
          {shuffleError ? <ErrorNotice message={shuffleError} focus={false} /> : null}
        </View>
      </View>
      {!songs.length ? (
        <EmptyState
          title={offline ? 'No downloaded tracks' : 'No tracks'}
          message={offline ? 'Only downloaded tracks appear offline.' : 'This album has no songs.'}
        />
      ) : null}
    </View>
  );

  return (
    <>
      <VirtualTrackList
        tracks={songs}
        header={header}
        onPlay={(index) => void playTracks(songs, index)}
        onAddToPlaylist={offline ? undefined : (track) => setPlaylistTracks([track])}
      />
      <ActionSheet
        visible={moreOpen}
        title={data.name}
        items={moreItems}
        onClose={() => setMoreOpen(false)}
      />
      {playlistTracks ? (
        <AddToPlaylistSheet tracks={playlistTracks} onClose={() => setPlaylistTracks(null)} />
      ) : null}
    </>
  );

}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-end',
  },
  headerCompact: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  /** Tablet/desktop: give the track list breathing room under the cover. */
  headerWide: {
    marginBottom: 24,
  },
  headerText: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  tracks: {
    marginTop: 6,
  },
});
