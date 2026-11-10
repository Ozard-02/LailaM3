import { FlatList } from 'react-native';
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface VirtualListProps<T> {
  data: T[];
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  keyExtractor?: (item: T, index: number) => string;
  numColumns?: number;
  ListHeaderComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  showsVerticalScrollIndicator?: boolean;
  testID?: string;
}

/** Web list: FlatList windows rows instead of mounting every cell. */
export function VirtualList<T>({
  data,
  renderItem,
  keyExtractor,
  numColumns = 1,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  contentContainerStyle,
  style,
  onEndReached,
  onEndReachedThreshold,
  showsVerticalScrollIndicator = false,
  testID,
}: VirtualListProps<T>) {
  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={numColumns}
      ListHeaderComponent={ListHeaderComponent ?? undefined}
      ListEmptyComponent={ListEmptyComponent ?? undefined}
      ListFooterComponent={ListFooterComponent ?? undefined}
      contentContainerStyle={contentContainerStyle}
      style={style}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      testID={testID}
      initialNumToRender={Math.max(numColumns * 4, 12)}
      maxToRenderPerBatch={Math.max(numColumns * 3, 9)}
      windowSize={7}
      removeClippedSubviews
    />
  );
}
