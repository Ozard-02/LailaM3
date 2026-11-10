import { VirtualList } from '@/components/VirtualList';
import { useRouter } from 'expo-router';
import { Disc3, ListMusic, Mic2, Search as SearchIcon, Tags, X } from '@/ui/icons';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { matchesSearch } from '@/core/search/text';
import { usePinyinReady } from '@/hooks/usePinyinReady';
import {
  downloadedTracks,
  offlineAlbums,
  offlineArtists,
  offlineGenres,
  offlinePlaylists,
} from '@/core/offline';
import { AlbumCard } from '@/components/AlbumCard';
import { AlbumShelf } from '@/components/AlbumShelf';
import { ArtistRow } from '@/components/ArtistRow';
import { FavouriteCard } from '@/components/FavouriteCard';
import { OfflineNotice } from '@/components/OfflineNotice';
import { PlaylistCard } from '@/components/PlaylistCard';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import { useAlbumPages, useArtists, useGenres, usePlaylists, useSearch } from '@/hooks/useLibrary';
import { useBottomChromeInset } from '@/hooks/useBottomChromeInset';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Input';
import { Pill } from '@/ui/Pill';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

type Tab = 'albums' | 'artists' | 'playlists' | 'genres';

const TABS: { key: Tab; label: string; icon: typeof Disc3 }[] = [
  { key: 'albums', label: 'Albums', icon: Disc3 },
  { key: 'artists', label: 'Artists', icon: Mic2 },
  { key: 'playlists', label: 'Playlists', icon: ListMusic },
  { key: 'genres', label: 'Genres', icon: Tags },
];

const GAP = 18;
const MIN_CARD = 150;

function columnsFor(width: number): number {
  return Math.max(2, Math.floor((width + GAP) / (MIN_CARD + GAP)));
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()];
}

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [bodyWidth, setBodyWidth] = useState(0);
  const [tab, setTab] = useState<Tab>('albums');
  const [search, setSearch] = useState('');
  const [songQuery, setSongQuery] = useState('');
  const searchRef = useRef<ComponentRef<typeof TextInput>>(null);
  const searchFocusRequest = useUIStore((state) => state.searchFocusRequest);
  const albums = useAlbumPages('alphabeticalByName', 120);
  const artists = useArtists();
  const playlists = usePlaylists();
  const genres = useGenres();
  const offline = useEffectiveOffline();
  const offlineIndex = useOfflineStore((state) => state.index);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const chromeInset = useBottomChromeInset();

  const horizontalPadding = width < 600 ? 16 : 28;
  // `Screen` sits beside a sidebar/rail on wide layouts; the window width is
  // larger than the real content width and produced overlapping album cards.
  const available =
    bodyWidth > 0
      ? Math.max(0, bodyWidth - horizontalPadding * 2)
      : Math.max(0, Math.min(width, 1480) - horizontalPadding * 2);
  const albumColumns = columnsFor(available);
  const albumCardWidth = (available - GAP * (albumColumns - 1)) / albumColumns;
  const playlistColumns = albumColumns;
  const playlistCardWidth = (available - GAP * (playlistColumns - 1)) / playlistColumns;
  const genreColumns = Math.max(2, Math.floor((available + 8) / 168));
  const genreCardWidth = (available - 8 * (genreColumns - 1)) / genreColumns;

  const albumData = offline
    ? offlineAlbums(offlineIndex)
    : (albums.data?.pages.flat() ?? []);
  const artistData = offline ? offlineArtists(offlineIndex) : (artists.data ?? []);
  const playlistData = offline ? offlinePlaylists(offlineIndex) : (playlists.data ?? []);
  const genreData = offline ? offlineGenres(offlineIndex) : (genres.data ?? []);

  useEffect(() => {
    const timer = setTimeout(() => setSongQuery(search), 320);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (searchFocusRequest > 0) searchRef.current?.focus();
  }, [searchFocusRequest]);

  const songSearch = useSearch(offline ? '' : songQuery);
  usePinyinReady(); // re-filter once CJK romanisation has loaded
  const query = search.trim();
  const searching = query.length > 0;
  const matches = (...values: (string | undefined)[]) => matchesSearch(values, query);

  // `search3` covers the whole library; the local filter only sees the pages
  // already loaded (and downloaded albums offline). Merge both, server first.
  const filteredAlbums = searching
    ? uniqueById([
        ...(!offline ? (songSearch.data?.albums ?? []) : []),
        ...albumData.filter((album) => matches(album.name, album.artist)),
      ])
    : albumData;
  const filteredArtists = searching
    ? uniqueById([
        ...(!offline ? (songSearch.data?.artists ?? []) : []),
        ...artistData.filter((artist) => matches(artist.name)),
      ])
    : artistData;
  const filteredPlaylists = searching
    ? playlistData.filter((playlist) => matches(playlist.name, playlist.owner, playlist.comment))
    : playlistData;
  const filteredGenres = searching
    ? genreData.filter((genre) => matches(genre.name))
    : genreData;
  const filteredSongs = searching
    ? offline
      ? downloadedTracks(offlineIndex).filter((track) =>
          matches(track.title, track.artist, track.album),
        )
      : (songSearch.data?.songs ?? [])
    : [];
  const resultCount =
    filteredAlbums.length +
    filteredArtists.length +
    filteredPlaylists.length +
    filteredGenres.length +
    filteredSongs.length;
  const searchLoading =
    albums.isLoading ||
    artists.isLoading ||
    playlists.isLoading ||
    genres.isLoading ||
    songSearch.isLoading;
  const searchError =
    albums.isError || artists.isError || playlists.isError || genres.isError || songSearch.isError;

  const listEmpty = (message: string, title: string) => (
    <EmptyState title={title} message={message} />
  );

  const header = <OfflineNotice />;

  return (
    <Screen
      title="Library"
      subtitle={offline ? 'Downloaded music only, no server needed.' : 'Everything on your server, one quiet shelf.'}
      scroll={false}
      onBodyLayout={(event) => setBodyWidth(event.nativeEvent.layout.width)}
    >
      {header}
      <Input
        inputRef={searchRef}
        placeholder="Search albums, artists, playlists and genres"
        value={search}
        onChangeText={setSearch}
        trailing={
          search ? (
            <IconButton label="Clear library search" size={28} onPress={() => setSearch('')}>
              <X size={16} color={theme.colors.textTertiary} />
            </IconButton>
          ) : (
            <SearchIcon size={18} color={theme.colors.textTertiary} />
          )
        }
      />

      {searching ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ paddingBottom: chromeInset + 32, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredSongs.length ? (
            <View>
              <Text variant="title" style={styles.sectionTitle}>
                Songs
              </Text>
              {filteredSongs.slice(0, 25).map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  onPlay={() => void playTracks(filteredSongs, index)}
                />
              ))}
            </View>
          ) : null}

          {filteredAlbums.length ? (
            <View>
              <Text variant="title" style={styles.sectionTitle}>
                Albums
              </Text>
              <View style={styles.grid}>
                {filteredAlbums.map((album) => (
                  <AlbumCard key={album.id} album={album} width={albumCardWidth} />
                ))}
              </View>
            </View>
          ) : null}

          {filteredArtists.length ? (
            <View>
              <Text variant="title" style={styles.sectionTitle}>
                Artists
              </Text>
              {filteredArtists.map((artist) => (
                <ArtistRow key={artist.id} artist={artist} />
              ))}
            </View>
          ) : null}

          {filteredPlaylists.length ? (
            <View>
              <Text variant="title" style={styles.sectionTitle}>
                Playlists
              </Text>
              <View style={styles.grid}>
                {filteredPlaylists.map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    width={playlistCardWidth}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {filteredGenres.length ? (
            <View>
              <Text variant="title" style={styles.sectionTitle}>
                Genres
              </Text>
              <View style={styles.genreGrid}>
                {filteredGenres.map((genre) => (
                  <Pill
                    key={genre.name}
                    label={`${genre.name}${genre.songCount ? ` · ${genre.songCount}` : ''}`}
                    onPress={() =>
                      router.push(`/(main)/genre/${encodeURIComponent(genre.name)}` as never)
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          {songSearch.isError ? (
            <ErrorState
              title="Search failed"
              message={
                songSearch.error instanceof Error
                  ? songSearch.error.message
                  : 'The server could not answer this search.'
              }
              onRetry={() => void songSearch.refetch()}
            />
          ) : null}
          {searching && songSearch.isLoading ? (
            <View style={styles.listSkeletons}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} style={{ width: '100%', height: 58, borderRadius: 8 }} />
              ))}
            </View>
          ) : null}
          {resultCount === 0 && !searchLoading && !searchError ? (
            <EmptyState
              title="No matches"
              message={`Nothing in your library matches “${search.trim()}”.`}
            />
          ) : null}
          {resultCount > 0 ? (
            <Text variant="caption" tone="tertiary">
              {resultCount} {resultCount === 1 ? 'result' : 'results'}
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <>
          <View style={styles.filters}>
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <Pill
                  key={item.key}
                  label={item.label}
                  selected={tab === item.key}
                  onPress={() => setTab(item.key)}
                  icon={
                    <Icon
                      size={14}
                      color={
                        tab === item.key ? theme.colors.background : theme.colors.textSecondary
                      }
                    />
                  }
                />
              );
            })}
          </View>

          {tab === 'albums' ? (
            <AlbumShelf
              data={albumData}
              numColumns={albumColumns}
              cardWidth={albumCardWidth}
              gap={GAP}
              contentBottom={chromeInset + 32}
              onEndReached={() => {
                if (albums.hasNextPage && !albums.isFetchingNextPage) {
                  void albums.fetchNextPage();
                }
              }}
              ListEmptyComponent={
                !offline && albums.isError ? (
                  <ErrorState
                    title="Could not load albums"
                    message={
                      albums.error instanceof Error
                        ? albums.error.message
                        : 'The server did not return the album list.'
                    }
                    onRetry={() => void albums.refetch()}
                  />
                ) : !offline && albums.isLoading ? (
                  <View style={styles.grid}>
                    {Array.from({ length: 12 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        style={{ width: albumCardWidth, height: albumCardWidth + 50, borderRadius: 8 }}
                      />
                    ))}
                  </View>
                ) : (
                  listEmpty(
                    offline
                      ? 'Download an album from the server to see it here.'
                      : 'Check the server connection or scan your library.',
                    offline ? 'No downloaded albums' : 'No albums',
                  )
                )
              }
              ListFooterComponent={
                !offline && albums.hasNextPage ? (
                  <Button
                    label="Load more albums"
                    size="sm"
                    variant="secondary"
                    loading={albums.isFetchingNextPage}
                    onPress={() => void albums.fetchNextPage()}
                    style={styles.loadMore}
                  />
                ) : null
              }
            />
          ) : null}

          {tab === 'artists' ? (
            <VirtualList
              style={styles.fill}
              data={artistData}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ArtistRow artist={item} />}
              contentContainerStyle={{ paddingBottom: chromeInset + 32 }}
              ListEmptyComponent={
                !offline && artists.isError ? (
                  <ErrorState
                    title="Could not load artists"
                    message={
                      artists.error instanceof Error
                        ? artists.error.message
                        : 'The server did not return the artist list.'
                    }
                    onRetry={() => void artists.refetch()}
                  />
                ) : !offline && artists.isLoading ? (
                  <View style={styles.listSkeletons}>
                    {Array.from({ length: 10 }).map((_, index) => (
                      <Skeleton key={index} style={{ width: '100%', height: 68, borderRadius: 8 }} />
                    ))}
                  </View>
                ) : (
                  <EmptyState title={offline ? 'No downloaded artists' : 'No artists'} />
                )
              }
              showsVerticalScrollIndicator={false}
            />
          ) : null}

          {tab === 'playlists' ? (
            <VirtualList
              key={`playlists-${playlistColumns}`}
              style={styles.fill}
              data={[
                { kind: 'favourite' as const },
                ...playlistData.map((playlist) => ({ kind: 'playlist' as const, playlist })),
              ]}
              numColumns={playlistColumns}
              keyExtractor={(item) =>
                item.kind === 'favourite' ? 'favourite' : item.playlist.id
              }
              renderItem={({ item }) => (
                <View style={{ width: playlistCardWidth, marginBottom: GAP + 8 }}>
                  {item.kind === 'favourite' ? (
                    <FavouriteCard width={playlistCardWidth} />
                  ) : (
                    <PlaylistCard playlist={item.playlist} width={playlistCardWidth} />
                  )}
                </View>
              )}
              contentContainerStyle={{ paddingBottom: chromeInset + 32 }}
              ListEmptyComponent={
                !offline && playlists.isError ? (
                  <ErrorState
                    title="Could not load playlists"
                    message={
                      playlists.error instanceof Error
                        ? playlists.error.message
                        : 'The server did not return the playlist list.'
                    }
                    onRetry={() => void playlists.refetch()}
                  />
                ) : !offline && playlists.isLoading ? (
                  <View style={styles.grid}>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        style={{ width: playlistCardWidth, height: playlistCardWidth + 50, borderRadius: 8 }}
                      />
                    ))}
                  </View>
                ) : (
                  <EmptyState
                    title={offline ? 'No downloaded playlists' : 'No playlists'}
                    message={
                      offline
                        ? 'Download a playlist while online to see it here.'
                        : 'Create a playlist in Navidrome and it will appear here.'
                    }
                  />
                )
              }
              showsVerticalScrollIndicator={false}
            />
          ) : null}

          {tab === 'genres' ? (
            <VirtualList
              key={`genres-${genreColumns}`}
              style={styles.fill}
              data={genreData}
              numColumns={genreColumns}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <View style={{ width: genreCardWidth, marginBottom: 8 }}>
                  <Pill
                    label={`${item.name}${item.songCount ? ` · ${item.songCount}` : ''}`}
                    onPress={() =>
                      router.push(`/(main)/genre/${encodeURIComponent(item.name)}` as never)
                    }
                  />
                </View>
              )}
              contentContainerStyle={{ paddingBottom: chromeInset + 32 }}
              ListEmptyComponent={
                !offline && genres.isError ? (
                  <ErrorState
                    title="Could not load genres"
                    message={
                      genres.error instanceof Error
                        ? genres.error.message
                        : 'The server did not return the genre list.'
                    }
                    onRetry={() => void genres.refetch()}
                  />
                ) : !offline && genres.isLoading ? (
                  <View style={styles.listSkeletons}>
                    {Array.from({ length: 10 }).map((_, index) => (
                      <Skeleton key={index} style={{ width: '100%', height: 56, borderRadius: 8 }} />
                    ))}
                  </View>
                ) : (
                  <EmptyState
                    title={offline ? 'No downloaded genres' : 'No genres'}
                    message={
                      offline
                        ? 'Genres appear when downloaded tracks have tags.'
                        : 'Navidrome exposes genres when your files have tags.'
                    }
                  />
                )
              }
              showsVerticalScrollIndicator={false}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minHeight: 0,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  genreGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  listSkeletons: {
    gap: 10,
  },
  sectionTitle: {
    marginBottom: 10,
  },
  loadMore: {
    alignSelf: 'center',
    marginTop: 20,
  },
});
