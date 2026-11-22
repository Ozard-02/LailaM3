import type { ReactElement } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomChromeInset } from '@/hooks/useBottomChromeInset';
import type { Track } from '@/core/models';
import { TrackMoreSheet } from './TrackMoreSheet';
import { TrackRow } from './TrackRow';
import { VirtualList } from './VirtualList';

export interface VirtualTrackListProps {
  tracks: Track[];
  header: ReactElement;
  footer?: ReactElement | null;
  onPlay: (index: number) => void;
  /** Album the list belongs to, so "Open album" is not offered inside it. */
  parentAlbumId?: string;
}

/**
 * Virtualised track list for long playlists. Renders only the visible window;
 * the header is part of the same scroll container, so the screen does not nest
 * a ScrollView around a FlatList.
 */
export function VirtualTrackList({
  tracks,
  header,
  footer,
  onPlay,
  parentAlbumId,
}: VirtualTrackListProps) {
  const insets = useSafeAreaInsets();
  const chromeInset = useBottomChromeInset();
  const { width } = useWindowDimensions();
  const padding = width < 600 ? 16 : 28;
  const [moreTrack, setMoreTrack] = useState<Track | null>(null);

  // Opening the per-track menu only changes local state. Keep the list props
  // stable so it does not reconcile every mounted row for that.
  const keyExtractor = useCallback((item: Track, index: number) => `${item.id}-${index}`, []);
  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => (
      <View style={{ paddingHorizontal: padding }}>
        <TrackRow
          track={item}
          index={index}
          onPlay={() => onPlay(index)}
          onMore={() => setMoreTrack(item)}
        />
      </View>
    ),
    [onPlay, padding],
  );
  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: insets.top + 18,
      paddingBottom: chromeInset + 32,
    }),
    [chromeInset, insets.top],
  );

  return (
    <>
      <VirtualList
        data={tracks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      />
      {moreTrack ? (
        <TrackMoreSheet
          track={moreTrack}
          parentAlbumId={parentAlbumId}
          onClose={() => setMoreTrack(null)}
        />
      ) : null}
    </>
  );
}
