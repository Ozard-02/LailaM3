import { FlashList } from '@shopify/flash-list';
import type { ReactElement } from 'react';
import { View } from 'react-native';
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

/** Native grid: FlashList recycles rows and keeps a 5k library bounded. */
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
    <FlashList
      key={`albums-${numColumns}`}
      testID="album-shelf"
      style={{ flex: 1, minHeight: 0 }}
      data={data}
      numColumns={numColumns}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <View
          style={{
            width: cardWidth,
            marginRight: (index + 1) % numColumns === 0 ? 0 : gap,
            marginBottom: gap + 8,
          }}
        >
          <AlbumCard album={item} width={cardWidth} />
        </View>
      )}
      contentContainerStyle={{ paddingBottom: contentBottom }}
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
    />
  );
}
