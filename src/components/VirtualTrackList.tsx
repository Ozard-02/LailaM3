import type { ReactElement } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomChromeInset } from '@/hooks/useBottomChromeInset';
import type { Track } from '@/core/models';
import { TrackRow } from './TrackRow';
import { VirtualList } from './VirtualList';

export interface VirtualTrackListProps {
  tracks: Track[];
  header: ReactElement;
  onPlay: (index: number) => void;
  onAddToPlaylist?: (track: Track) => void;
}

/**
 * Virtualised track list for long playlists. Renders only the visible window;
 * the header is part of the same scroll container, so the screen does not nest
 * a ScrollView around a FlatList.
 */
export function VirtualTrackList({ tracks, header, onPlay, onAddToPlaylist }: VirtualTrackListProps) {
  const insets = useSafeAreaInsets();
  const chromeInset = useBottomChromeInset();
  const { width } = useWindowDimensions();
  const padding = width < 600 ? 16 : 28;

  return (
    <VirtualList
      data={tracks}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      renderItem={({ item, index }) => (
        <View style={{ paddingHorizontal: padding }}>
          <TrackRow
            track={item}
            index={index}
            onPlay={() => onPlay(index)}
            onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist(item) : undefined}
          />
        </View>
      )}
      ListHeaderComponent={header}
      contentContainerStyle={{
        paddingTop: insets.top + 18,
        paddingBottom: chromeInset + 32,
      }}
      showsVerticalScrollIndicator={false}
    />
  );
}
