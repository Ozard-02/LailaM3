import { ScrollView, StyleSheet } from 'react-native';
import type { Playlist } from '@/core/models';
import { FavouriteCard } from './FavouriteCard';
import { PlaylistCard } from './PlaylistCard';

export function PlaylistRow({
  playlists,
  showFavourites = false,
}: {
  playlists: Playlist[];
  showFavourites?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {showFavourites ? <FavouriteCard width={158} /> : null}
      {playlists.map((playlist) => (
        <PlaylistCard key={playlist.id} playlist={playlist} width={158} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingVertical: 2,
  },
});
