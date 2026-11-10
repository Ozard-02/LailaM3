import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { Album } from '@/core/models';
import { AlbumCard } from './AlbumCard';

/**
 * Small nested grids (Home, search results, artist/favourites) do not need a
 * virtualised list. A flex-wrap view avoids mounting FlashList on web and is
 * cheaper for the handful of cards these sections render.
 */
export function AlbumGrid({ albums }: { albums: Album[] }) {
  const [width, setWidth] = useState(0);
  const minCard = 150;
  const gap = 18;
  const columns = Math.max(2, Math.floor((width + gap) / (minCard + gap)));
  const cardWidth = width > 0 ? (width - gap * (columns - 1)) / columns : minCard;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      {width > 0 ? (
        <View style={[styles.grid, { gap }]}>
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} width={cardWidth} />
          ))}
        </View>
      ) : null}
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
  },
});
