import type { ReactElement } from 'react';
import { FlatList, View } from 'react-native';
import type { Album } from '@/core/models';
import { AlbumCard } from './AlbumCard';

export interface AlbumShelfProps {
  data: Album[];
  numColumns: number;
  cardWidth: number;
  gap: number;
  contentBottom: number;
  onEndReached?: () => void;
  ListEmptyComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
}

/**
 * FlashList keeps every cell in the DOM on web (see docs/performance.md).
 * VirtualizedList/FlatList windows rows, so the 1200-album profile stays
 * bounded and 5k no longer means 5k mounted cards.
 */
export function AlbumShelf({
  data,
  numColumns,
  cardWidth,
  gap,
  contentBottom,
  onEndReached,
  ListEmptyComponent,
  ListFooterComponent,
}: AlbumShelfProps) {
  return (
    <FlatList
      key={`albums-${numColumns}`}
      testID="album-shelf"
      style={{ flex: 1, minHeight: 0 }}
      data={data}
      numColumns={numColumns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={{ width: cardWidth, marginBottom: gap + 8 }}>
          <AlbumCard album={item} width={cardWidth} />
        </View>
      )}
      contentContainerStyle={{ paddingBottom: contentBottom }}
      columnWrapperStyle={{ gap }}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={Math.max(numColumns * 4, 12)}
      maxToRenderPerBatch={Math.max(numColumns * 3, 9)}
      windowSize={7}
      removeClippedSubviews
      ListEmptyComponent={ListEmptyComponent ?? undefined}
      ListFooterComponent={ListFooterComponent ?? undefined}
    />
  );
}
