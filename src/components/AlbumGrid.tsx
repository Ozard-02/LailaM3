import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { Album } from '@/core/models';
import { AlbumCard } from './AlbumCard';

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
        <FlashList
          data={albums}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <View
              style={{
                width: cardWidth,
                marginRight: (index + 1) % columns === 0 ? 0 : gap,
                marginBottom: gap + 8,
              }}
            >
              <AlbumCard album={item} width={cardWidth} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
