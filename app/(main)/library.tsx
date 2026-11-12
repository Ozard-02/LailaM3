import { VirtualList } from '@/components/VirtualList';
import { useRouter } from 'expo-router';
import { Disc3, ListMusic, Mic2, Search as SearchIcon, Tags, X } from '@/ui/icons';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import type { Album, Artist, Genre, Playlist, Track } from '@/core/models';
import { filterSearch } from '@/core/search/text';
import { useSearchIndex } from '@/hooks/useSearchIndex';
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
import { buildSearchItems, searchItemKey, type SearchItem } from '@/utils/searchItems';

type Tab = 'albums' | 'artists' | 'playlists' | 'genres';

// Module scope keeps the identity stable, so the search index is rebuilt only
// when the data (or pinyin) changes, not on every render.
const albumValues = (album: Album) => [album.name, album.artist];
const artistValues = (artist: Artist) => [artist.name];
const playlistValues = (playlist: Playlist) => [playlist.name, playlist.owner, playlist.comment];
const genreValues = (genre: Genre) => [genre.name];
const trackValues = (track: Track) => [track.title, track.artist, track.album];

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

  const albumData = useMemo(
    () => (offline ? offlineAlbums(offlineIndex) : (albums.data?.pages.flat() ?? [])),
    [offline, offlineIndex, albums.data],
  );
  const artistData = useMemo(
    () => (offline ? offlineArtists(offlineIndex) : (artists.data ?? [])),
    [offline, offlineIndex, artists.data],
  );
  const playlistData = useMemo(
    () => (offline ? offlinePlaylists(offlineIndex) : (playlists.data ?? [])),
    [offline, offlineIndex, playlists.data],
  );
  const genreData = useMemo(
    () => (offline ? offlineGenres(offlineIndex) : (genres.data ?? [])),
    [offline, offlineIndex, genres.data],
  );
  const offlineSongs = useMemo(
    () => (offline ? downloadedTracks(offlineIndex) : []),
    [offline, offlineIndex],
  );

  useEffect(() => {
    const timer = setTimeout(() => setSongQuery(search), 320);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (searchFocusRequest > 0) searchRef.current?.focus();
  }, [searchFocusRequest]);

  const songSearch = useSearch(offline ? '' : songQuery);
  const query = search.trim();
  const searching = query.length > 0;

  // Haystacks are folded once per data change; filtering per keystroke is a
  // plain `includes` scan instead of re-normalising the whole library.
  const albumIndex = useSearchIndex(albumData, albumValues);
  const artistIndex = useSearchIndex(artistData, artistValues);
  const playlistIndex = useSearchIndex(playlistData, playlistValues);
  const genreIndex = useSearchIndex(genreData, genreValues);
  const songIndex = useSearchIndex(offlineSongs, trackValues);

  // `search3` covers the whole library; the local filter only sees the pages
  // already loaded (and downloaded albums offline). Merge both, server first.
  const filtered = useMemo(() => {
    const albums = searching
      ? uniqueById([
          ...(!offline ? (songSearch.data?.albums ?? []) : []),
          ...filterSearch(albumIndex, query),
        ])
      : albumData;
    const artists = searching
      ? uniqueById([
          ...(!offline ? (songSearch.data?.artists ?? []) : []),
          ...filterSearch(artistIndex, query),
        ])
      : artistData;
    const playlists = searching ? filterSearch(playlistIndex, query) : playlistData;
    const genres = searching ? filterSearch(genreIndex, query) : genreData;
    const songs = searching
      ? offline
        ? filterSearch(songIndex, query)
        : (songSearch.data?.songs ?? [])
      : [];
    return { albums, artists, playlists, genres, songs };
  }, [
    searching,
    offline,
    songSearch.data,
    albumIndex,
    artistIndex,
    playlistIndex,
    genreIndex,
    songIndex,
    query,
    albumData,
    artistData,
    playlistData,
    genreData,
  ]);
  const {
    albums: filteredAlbums,
    artists: filteredArtists,
    playlists: filteredPlaylists,
    genres: filteredGenres,
    songs: filteredSongs,
  } = filtered;
  const resultCount =
    filteredAlbums.length +
    filteredArtists.length +
    filteredPlaylists.length +
    filteredGenres.length +
    filteredSongs.length;
  const playlistItems = useMemo(
    () => [
      { kind: 'favourite' as const },
      ...playlistData.map((playlist) => ({ kind: 'playlist' as const, playlist })),
    ],
    [playlistData],
  );
  const searchLoading =
    albums.isLoading ||
    artists.isLoading ||
    playlists.isLoading ||
    genres.isLoading ||
    songSearch.isLoading;
  const searchError =
    albums.isError || artists.isError || playlists.isError || genres.isError || songSearch.isError;
  const searchItems = useMemo<SearchItem[]>(() => {
    if (!searching) return [];
    const items = buildSearchItems({
      songs: filteredSongs,
      albums: filteredAlbums,
      artists: filteredArtists,
      playlists: filteredPlaylists,
      genres: filteredGenres,
      albumColumns,
      playlistColumns,
    });
    if (searchError) items.push({ kind: 'error' });
    else if (searchLoading) items.push({ kind: 'loading' });
    else if (resultCount === 0) items.push({ kind: 'empty' });
    if (resultCount > 0) items.push({ kind: 'count', count: resultCount });
    return items;
  }, [
    searching,
    filteredSongs,
    filteredAlbums,
    filteredArtists,
    filteredPlaylists,
    filteredGenres,
    albumColumns,
    playlistColumns,
    searchError,
    searchLoading,
    resultCount,
  ]);

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
        <VirtualList
          style={styles.fill}
          data={searchItems}
          keyExtractor={searchItemKey}
          getItemType={(item) => item.kind}
          contentContainerStyle={{ paddingBottom: chromeInset + 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            switch (item.kind) {
              case 'section':
                return (
                  <Text variant="title" style={styles.sectionTitle}>
                    {item.title}
                  </Text>
                );
              case 'song':
                return (
                  <TrackRow
                    track={item.track}
                    index={item.index}
                    onPlay={() => void playTracks(filteredSongs, item.index)}
                  />
                );
              case 'albumRow':
                return (
                  <View style={[styles.grid, styles.searchRow]}>
                    {item.albums.map((album) => (
                      <AlbumCard key={album.id} album={album} width={albumCardWidth} />
                    ))}
                  </View>
                );
              case 'artist':
                return <ArtistRow artist={item.artist} />;
              case 'playlistRow':
                return (
                  <View style={[styles.grid, styles.searchRow]}>
                    {item.playlists.map((playlist) => (
                      <PlaylistCard
                        key={playlist.id}
                        playlist={playlist}
                        width={playlistCardWidth}
                      />
                    ))}
                  </View>
                );
              case 'genres':
                return (
                  <View style={[styles.genreGrid, styles.searchRow]}>
                    {item.genres.map((genre) => (
                      <Pill
                        key={genre.name}
                        label={`${genre.name}${genre.songCount ? ` · ${genre.songCount}` : ''}`}
                        onPress={() =>
                          router.push(`/(main)/genre/${encodeURIComponent(genre.name)}` as never)
                        }
                      />
                    ))}
                  </View>
                );
              case 'notice':
                return (
                  <Text variant="caption" tone="tertiary">
                    {item.text}
                  </Text>
                );
              case 'loading':
                return (
                  <View style={styles.listSkeletons}>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        style={{ width: '100%', height: 58, borderRadius: 8 }}
                      />
                    ))}
                  </View>
                );
              case 'error':
                return (
                  <ErrorState
                    title="Search failed"
                    message={
                      songSearch.error instanceof Error
                        ? songSearch.error.message
                        : 'The server could not answer this search.'
                    }
                    onRetry={() => void songSearch.refetch()}
                  />
                );
              case 'empty':
                return (
                  <EmptyState
                    title="No matches"
                    message={`Nothing in your library matches “${search.trim()}”.`}
                  />
                );
              case 'count':
                return (
                  <Text variant="caption" tone="tertiary">
                    {item.count} {item.count === 1 ? 'result' : 'results'}
                  </Text>
                );
              default:
                return null;
            }
          }}
        />
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
              data={playlistItems}
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
  searchRow: {
    marginBottom: 16,
  },
  loadMore: {
    alignSelf: 'center',
    marginTop: 20,
  },
});
