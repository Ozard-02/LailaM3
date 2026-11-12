import { useLocalSearchParams } from 'expo-router';
import { ListPlus, Pin, Play, Search as SearchIcon, Shuffle, X } from '@/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AddToPlaylistSheet } from '@/components/AddToPlaylistSheet';
import { isPlaylistExclusive, withExclusiveComment } from '@/core/exclusions';
import { filterSearch } from '@/core/search/text';
import { useSearchIndex } from '@/hooks/useSearchIndex';
import { updatePlaylist } from '@/core/subsonic/client';
import { invalidateExclusions } from '@/services/exclusions';
import { invalidatePlaylistQueries } from '@/services/query';
import { BackButton } from '@/components/BackButton';
import { DownloadButton } from '@/components/DownloadButton';
import { Screen } from '@/components/Screen';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import { usePlaylist } from '@/hooks/useLibrary';
import type { Track } from '@/core/models';
import { estimateDownloadBytes, offlinePlaylists } from '@/core/offline';
import { paletteCoverUrl } from '@/theme/palette';
import { useAuthStore } from '@/stores/auth';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePinsStore } from '@/stores/pins';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { ErrorState } from '@/ui/ErrorState';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Input';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { formatDurationLong, trackCount } from '@/utils/format';

/** Stable identity: a new `[]` on every render would rebuild the search index. */
const EMPTY_TRACKS: Track[] = [];
const trackValues = (track: Track) => [track.title, track.artist, track.album];

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const setArtworkFromUrl = theme.setArtworkFromUrl;
  const resetArtwork = theme.resetArtwork;
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const padding = width < 600 ? 16 : 28;
  const playlist = usePlaylist(id);
  const server = useAuthStore((state) => state.server);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const playShuffled = usePlayerStore((state) => state.playShuffled);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const downloadPlaylist = useOfflineStore((state) => state.downloadPlaylist);
  const reconcilePlaylist = useOfflineStore((state) => state.reconcilePlaylist);
  const downloadedCollection = useOfflineStore((state) =>
    Boolean(id && state.index.collections[id]),
  );
  const downloadQuality = useSettingsStore((state) => state.downloadQuality);
  const offline = useEffectiveOffline();
  const offlineIndex = useOfflineStore((state) => state.index);
  const pinned = usePinsStore((state) => state.playlists.some((item) => item.id === id));
  const togglePlaylistPin = usePinsStore((state) => state.togglePlaylist);
  const offlinePlaylist = useMemo(
    () => (offline ? offlinePlaylists(offlineIndex).find((item) => item.id === id) : undefined),
    [offline, offlineIndex, id],
  );
  const [filter, setFilter] = useState('');
  const [playlistTracks, setPlaylistTracks] = useState<Track[] | null>(null);
  const [exclusiveBusy, setExclusiveBusy] = useState(false);
  const [exclusiveError, setExclusiveError] = useState<string | null>(null);
  const [shuffleError, setShuffleError] = useState<string | null>(null);

  // Opening a downloaded playlist reconciles it with the server: new tracks
  // are queued and tracks removed upstream disappear, deleting the file only
  // when no other downloaded collection still uses it.
  useEffect(() => {
    if (offline || !downloadedCollection || !playlist.data) return;
    void reconcilePlaylist(playlist.data);
  }, [downloadedCollection, offline, playlist.data, reconcilePlaylist]);

  const activePlaylist = offline ? offlinePlaylist : playlist.data;
  useEffect(() => {
    if (activePlaylist?.coverArt && server) {
      setArtworkFromUrl(paletteCoverUrl(server, activePlaylist.coverArt));
    }
    return () => resetArtwork();
  }, [activePlaylist?.coverArt, server, setArtworkFromUrl, resetArtwork]);

  // Hooks stay above the early returns. The index is built once per playlist
  // and reused for every keystroke in the filter.
  const songs = activePlaylist?.songs ?? EMPTY_TRACKS;
  const songIndex = useSearchIndex(songs, trackValues);

  if (!offline && playlist.isLoading) {
    return (
      <Screen>
        <Skeleton style={{ width: 220, height: 220, borderRadius: 12 }} />
        <Skeleton style={{ width: 300, height: 34 }} />
      </Screen>
    );
  }

  if (!activePlaylist) {
    if (!offline && playlist.isError) {
      return (
        <Screen>
          <BackButton />
          <ErrorState
            title="Could not load this playlist"
            message={
              playlist.error instanceof Error
                ? playlist.error.message
                : 'The server did not return this playlist.'
            }
            onRetry={() => void playlist.refetch()}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <BackButton />
        <EmptyState
          title={offline ? 'Not downloaded' : 'Playlist unavailable'}
          message={
            offline
              ? 'Download this playlist while online to listen to it here.'
              : 'This playlist no longer exists on the server.'
          }
        />
      </Screen>
    );
  }

  const data = activePlaylist;
  const total = songs.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  const downloadEstimate = estimateDownloadBytes(songs, downloadQuality);
  const query = filter.trim();
  const visibleSongs = query ? filterSearch(songIndex, query) : songs;

  const username = server?.username;
  const exclusive = username ? isPlaylistExclusive(data, username) : false;
  const canEdit = Boolean(
    !offline && username && (!data.owner || data.owner === username),
  );

  const toggleExclusive = async () => {
    if (!server || !username || exclusiveBusy) return;
    setExclusiveBusy(true);
    setExclusiveError(null);
    try {
      const comment = withExclusiveComment(data.comment, username, !exclusive);
      await updatePlaylist(server, data.id, { comment });
      invalidateExclusions(server);
      invalidatePlaylistQueries();
    } catch {
      setExclusiveError('Could not update this playlist. Try again.');
    } finally {
      setExclusiveBusy(false);
    }
  };

  const header = (
    <View style={{ paddingHorizontal: padding, gap: 20 }}>
      <View style={styles.topBar}>
        <BackButton />
        <View style={styles.topActions}>
          {canEdit ? (
            <IconButton
              label={
                exclusive
                  ? 'Include playlist in shuffle'
                  : 'Exclude playlist from shuffle'
              }
              size={40}
              variant="soft"
              selected={exclusive}
              disabled={exclusiveBusy}
              onPress={() => void toggleExclusive()}
            >
              <Shuffle
                size={18}
                color={exclusive ? theme.colors.accent : theme.colors.text}
              />
            </IconButton>
          ) : null}
          <IconButton
            label={pinned ? 'Unpin playlist' : 'Pin playlist'}
            size={40}
            variant="soft"
            selected={pinned}
            onPress={() => togglePlaylistPin(data)}
          >
            <Pin
              size={18}
              color={pinned ? theme.colors.accent : theme.colors.text}
              fill={pinned ? theme.colors.accent : 'transparent'}
            />
          </IconButton>
        </View>
      </View>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <Artwork coverArt={data.coverArt} size={compact ? 180 : 230} radius={theme.radius.md} />
        <View style={styles.headerText}>
          <Text variant="label" tone="accent">
            Playlist
          </Text>
          <Text variant={compact ? 'largeTitle' : 'display'}>{data.name}</Text>
          <Text variant="body" tone="secondary">
            {trackCount(songs.length, 'track')}
            {total ? ` · ${formatDurationLong(total)}` : ''}
            {data.owner ? ` · ${data.owner}` : ''}
          </Text>
          {data.comment ? (
            <Text variant="caption" tone="tertiary">
              {data.comment}
            </Text>
          ) : null}
          {exclusiveError ? <ErrorNotice message={exclusiveError} /> : null}
          {shuffleError ? <ErrorNotice message={shuffleError} focus={false} /> : null}
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
                onDownload={() => downloadPlaylist(data)}
                estimatedBytes={downloadEstimate}
              />
            )}
          </View>
        </View>
      </View>
      {songs.length ? (
        <Input
          containerStyle={styles.search}
          placeholder="Search in this playlist"
          value={filter}
          onChangeText={setFilter}
          trailing={
            filter ? (
              <IconButton
                label="Clear playlist search"
                size={28}
                onPress={() => setFilter('')}
              >
                <X size={16} color={theme.colors.textTertiary} />
              </IconButton>
            ) : (
              <SearchIcon size={18} color={theme.colors.textTertiary} />
            )
          }
        />
      ) : null}
      {!songs.length ? (
        <EmptyState
          title={offline ? 'No downloaded tracks' : 'Empty playlist'}
          message={offline ? 'Only downloaded tracks appear offline.' : undefined}
        />
      ) : null}
      {songs.length > 0 && visibleSongs.length === 0 ? (
        <EmptyState title="No matches" message={`Nothing in this playlist matches “${filter.trim()}”.`} />
      ) : null}
    </View>
  );

  return (
    <>
    <VirtualTrackList
      tracks={visibleSongs}
      header={header}
      onPlay={(index) => {
        const track = visibleSongs[index];
        if (track) void playTracks(songs, songs.findIndex((item) => item.id === track.id));
      }}
      onAddToPlaylist={offline ? undefined : (track) => setPlaylistTracks([track])}
    />
    {playlistTracks ? (
      <AddToPlaylistSheet tracks={playlistTracks} onClose={() => setPlaylistTracks(null)} />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    width: '100%',
    alignSelf: 'stretch',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
});
