import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { Playlist } from '@/core/models';
import { PlaylistCard } from './PlaylistCard';

export function PlaylistGrid({
  playlists,
  leading,
}: {
  playlists: Playlist[];
  leading?: (width: number) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const minCard = 150;
  const gap = 18;
  const columns = Math.max(2, Math.floor((width + gap) / (minCard + gap)));
  const cardWidth = width > 0 ? (width - gap * (columns - 1)) / columns : minCard;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  if (width === 0) return <View onLayout={onLayout} style={styles.wrap} />;

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      <View style={styles.grid}>
        {leading ? leading(cardWidth) : null}
        {playlists.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} width={cardWidth} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
});
