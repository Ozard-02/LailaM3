import { Search as SearchIcon, X } from '@/ui/icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AlbumGrid } from '@/components/AlbumGrid';
import { ArtistRow } from '@/components/ArtistRow';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { useAlbumPages, useArtists, useSearch } from '@/hooks/useLibrary';
import { matchesSearch } from '@/core/search/text';
import { usePinyinReady } from '@/hooks/usePinyinReady';
import { usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Input';
import { Skeleton } from '@/ui/Skeleton';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

export default function SearchScreen() {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [deep, setDeep] = useState(false);
  const search = useSearch(query);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const deepAlbums = useAlbumPages('alphabeticalByName', 500, { enabled: deep });
  const deepArtists = useArtists({ enabled: deep });

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), 320);
    return () => clearTimeout(timer);
  }, [input]);

  // Pinyin cannot be answered by search3; when the user asks for a deep scan,
  // walk the album pages once, then let React Query cache the result.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = deepAlbums;
  useEffect(() => {
    if (!deep || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [deep, fetchNextPage, hasNextPage, isFetchingNextPage]);

  usePinyinReady(); // re-filter once CJK romanisation has loaded
  const result = search.data;
  const allDeepAlbumMatches = deep
    ? (deepAlbums.data?.pages.flat() ?? []).filter((album) =>
        matchesSearch([album.name, album.artist], query),
      )
    : [];
  const allDeepArtistMatches = deep
    ? (deepArtists.data ?? []).filter((artist) => matchesSearch([artist.name], query))
    : [];
  // Keep a broad pinyin query from mounting hundreds of cards inside the
  // Search screen's ScrollView; the user can refine instead.
  const deepAlbumMatches = allDeepAlbumMatches.slice(0, 100);
  const deepArtistMatches = allDeepArtistMatches.slice(0, 100);
  const deepTruncated = allDeepAlbumMatches.length > 100 || allDeepArtistMatches.length > 100;
  const deepLoading =
    deep && (deepAlbums.isLoading || deepAlbums.isFetchingNextPage || deepArtists.isLoading);
  const hasResults = Boolean(
    result &&
      (result.albums.length || result.artists.length || result.songs.length),
  );
  const hasDeepResults = deepAlbumMatches.length > 0 || deepArtistMatches.length > 0;
  const totalResults =
    (result?.songs.length ?? 0) +
    (result?.albums.length ?? 0) +
    (result?.artists.length ?? 0) +
    deepAlbumMatches.length +
    deepArtistMatches.length;

  const resetDeep = () => setDeep(false);

  return (
    <Screen title="Search" subtitle="Find a record, a song, a name.">
      <Input
        placeholder="Search your library"
        value={input}
        onChangeText={(value) => {
          setInput(value);
          resetDeep();
        }}
        autoFocus={false}
        trailing={
          input ? (
            <IconButton label="Clear search" size={28} onPress={() => setInput('')}>
              <X size={16} color={theme.colors.textTertiary} />
            </IconButton>
          ) : (
            <SearchIcon size={18} color={theme.colors.textTertiary} />
          )
        }
      />

      {!query ? (
        <EmptyState
          title="Search your library"
          message="Albums, artists and songs. Results update as you type."
          icon={<SearchIcon size={30} color={theme.colors.textTertiary} />}
        />
      ) : null}

      {query && hasResults && !deep ? (
        <View style={styles.scanRow}>
          <Text variant="caption" tone="tertiary" style={styles.scanHint}>
            Server results only match metadata. Scan the album list for accents,
            pinyin and initials.
          </Text>
          <Button
            label="Scan all albums locally"
            size="sm"
            variant="ghost"
            onPress={() => setDeep(true)}
          />
        </View>
      ) : null}

      {search.isError ? (
        <ErrorState
          title="Search failed"
          message={
            search.error instanceof Error
              ? search.error.message
              : 'The server could not answer this search.'
          }
          onRetry={() => void search.refetch()}
        />
      ) : null}

      {search.isLoading ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} style={{ width: '100%', height: 58, borderRadius: 8 }} />
          ))}
        </View>
      ) : null}

      {query &&
      result &&
      !search.isError &&
      !search.isLoading &&
      !hasResults &&
      !hasDeepResults ? (
        <EmptyState
          title={deepLoading ? 'Searching all albums…' : 'No matches'}
          message={
            deepLoading
              ? 'Pinyin and transliterated titles need a local scan of the library.'
              : deep
                ? `Nothing found for “${query}”, including pinyin and initials.`
                : `Nothing found for “${query}”. The server cannot search pinyin, transliterated titles or lyrics.`
          }
          action={
            !deep && !deepLoading ? (
              <Button
                label="Search all albums by pinyin"
                size="sm"
                variant="secondary"
                onPress={() => setDeep(true)}
              />
            ) : null
          }
        />
      ) : null}

      {deepLoading ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: '100%', height: 58, borderRadius: 8 }} />
          ))}
        </View>
      ) : null}

      {deep && (deepAlbums.isError || deepArtists.isError) ? (
        <ErrorState
          title="Could not scan the library"
          message="The album pages could not be loaded. Check the server and try again."
          onRetry={() => {
            void deepAlbums.refetch();
            void deepArtists.refetch();
          }}
        />
      ) : null}

      {deepTruncated ? (
        <Text variant="caption" tone="tertiary">
          Showing the first 100 local matches. Refine the query to narrow the scan.
        </Text>
      ) : null}

      {deepAlbumMatches.length ? (
        <View>
          <SectionHeader title="Albums (local pinyin scan)" />
          <AlbumGrid albums={deepAlbumMatches} />
        </View>
      ) : null}

      {deepArtistMatches.length ? (
        <View>
          <SectionHeader title="Artists (local pinyin scan)" />
          {deepArtistMatches.map((artist) => (
            <ArtistRow key={artist.id} artist={artist} />
          ))}
        </View>
      ) : null}

      {result?.songs.length ? (
        <View>
          <SectionHeader title="Songs" />
          <View>
            {result.songs.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                onPlay={() => void playTracks(result.songs, index)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {result?.albums.length ? (
        <View>
          <SectionHeader title="Albums" />
          <AlbumGrid albums={result.albums} />
        </View>
      ) : null}

      {result?.artists.length ? (
        <View>
          <SectionHeader title="Artists" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.artistRow}>
              {result.artists.map((artist) => (
                <View key={artist.id} style={{ width: 280 }}>
                  <ArtistRow artist={artist} />
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {totalResults > 0 ? (
        <Text variant="caption" tone="tertiary">
          {totalResults} results
          {hasDeepResults ? ' · local pinyin scan' : ''}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeletons: {
    gap: 10,
  },
  artistRow: {
    flexDirection: 'row',
    gap: 16,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  scanHint: {
    flex: 1,
    minWidth: 220,
  },
});
