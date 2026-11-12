import { FlashList } from '@shopify/flash-list';
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
  /** FlashList v2 recycles by type; stable ids keep rows from remounting. */
  getItemType?: (item: T, index: number) => string | number | undefined;
  showsVerticalScrollIndicator?: boolean;
  testID?: string;
}

/** Native list: FlashList recycles rows. Web uses the windowed FlatList variant. */
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
  getItemType,
  showsVerticalScrollIndicator = false,
  testID,
}: VirtualListProps<T>) {
  return (
    <FlashList
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
      getItemType={getItemType}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      testID={testID}
    />
  );
}
