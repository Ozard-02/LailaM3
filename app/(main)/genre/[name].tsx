import { useLocalSearchParams } from 'expo-router';
import { Play } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { BackButton } from '@/components/BackButton';
import { Screen } from '@/components/Screen';
import { TrackRow } from '@/components/TrackRow';
import { useSongsByGenre } from '@/hooks/useLibrary';
import { offlineTracksByGenre } from '@/core/offline';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

export default function GenreScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const genre = name ? decodeURIComponent(name) : '';
  const songs = useSongsByGenre(genre);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const offline = useEffectiveOffline();
  const offlineIndex = useOfflineStore((state) => state.index);
  const data = offline ? offlineTracksByGenre(offlineIndex, genre) : (songs.data ?? []);

  return (
    <Screen>
      <BackButton />
      <Text variant="label" tone="accent">
        Genre
      </Text>
      <Text variant="display">{genre}</Text>
      {data.length ? (
        <Button
          label="Play genre"
          icon={<Play size={16} color="#fff" fill="#fff" />}
          onPress={() => void playTracks(data, 0)}
          style={styles.play}
        />
      ) : null}

      {!offline && songs.isError ? (
        <ErrorState
          title="Could not load this genre"
          message={
            songs.error instanceof Error
              ? songs.error.message
              : 'The server did not return songs for this genre.'
          }
          onRetry={() => void songs.refetch()}
        />
      ) : !offline && songs.isLoading ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} style={{ width: '100%', height: 58, borderRadius: 8 }} />
          ))}
        </View>
      ) : data.length ? (
        <View>
          {data.map((track, index) => (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              onPlay={() => void playTracks(data, index)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          title="No tracks"
          message={
            offline
              ? 'No downloaded tracks carry this genre.'
              : 'This genre has no songs on the server.'
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  play: {
    alignSelf: 'flex-start',
  },
  skeletons: {
    gap: 10,
  },
});
