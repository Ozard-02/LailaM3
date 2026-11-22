import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Music2 } from '@/ui/icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { buildCoverUrl } from '@/core/subsonic/params';
import { coverUri } from '@/core/offline';
import { useAuthStore } from '@/stores/auth';
import { useOfflineStore } from '@/stores/offline';
import { useTheme } from '@/theme/ThemeProvider';
import { coverRequestSize } from './artwork-size';

export interface ArtworkProps {
  coverArt?: string;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  blurRadius?: number;
  priority?: 'low' | 'normal' | 'high';
}

export const Artwork = memo(function Artwork({
  coverArt,
  size = 56,
  radius,
  style,
  blurRadius = 0,
  priority = 'normal',
}: ArtworkProps) {
  const theme = useTheme();
  const server = useAuthStore((state) => state.server);
  const localCover = useOfflineStore((state) => coverUri(state.index, coverArt));
  const requestSize = coverRequestSize(size, theme.performanceMode);
  const uri =
    localCover ??
    (coverArt && server ? buildCoverUrl(server, coverArt, requestSize) : undefined);
  const borderRadius = radius ?? theme.radius.artwork;
  const headers = server?.headers;
  // expo-image keys its header-aware load on the source reference. A fresh
  // object every render made web re-fetch and re-blob every cover.
  const source = useMemo(
    () => (uri ? (localCover ? { uri: localCover } : { uri, headers }) : undefined),
    [headers, localCover, uri],
  );

  return (
    <View
      testID={coverArt ? `artwork-${coverArt}` : 'artwork-placeholder'}
      style={[
        styles.base,
        { width: size, height: size, borderRadius, backgroundColor: theme.colors.elevated2 },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={source}
          style={styles.image}
          contentFit="cover"
          transition={theme.reduceMotion ? 0 : 180}
          cachePolicy="memory-disk"
          recyclingKey={coverArt}
          priority={priority}
          blurRadius={blurRadius}
          // Native image dragging steals the pointer from swipe gestures.
          draggable={false}
        />
      ) : (
        <View style={[styles.placeholder, { borderRadius }]}>
          <Music2 size={Math.max(16, size * 0.32)} color={theme.colors.textTertiary} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
