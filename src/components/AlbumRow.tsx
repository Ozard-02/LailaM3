import { ScrollView, StyleSheet } from 'react-native';
import type { Album } from '@/core/models';
import { AlbumCard } from './AlbumCard';

export function AlbumRow({ albums }: { albums: Album[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {albums.map((album) => (
        <AlbumCard key={album.id} album={album} width={158} />
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
