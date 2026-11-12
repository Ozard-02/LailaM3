import { Image } from 'expo-image';
import { Music2 } from '@/ui/icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { buildCoverUrl } from '@/core/subsonic/params';
import { coverUri } from '@/core/offline';
import { useAuthStore } from '@/stores/auth';
import { useOfflineStore } from '@/stores/offline';
import { useTheme } from '@/theme/ThemeProvider';

export interface ArtworkProps {
  coverArt?: string;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  blurRadius?: number;
  priority?: 'low' | 'normal' | 'high';
}

export function Artwork({
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
  const uri =
    localCover ??
    (coverArt && server ? buildCoverUrl(server, coverArt, Math.round(size * 2)) : undefined);
  const borderRadius = radius ?? theme.radius.artwork;

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
          source={
            localCover
              ? { uri: localCover }
              : { uri: uri as string, headers: server?.headers }
          }
          style={styles.image}
          contentFit="cover"
          transition={180}
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
}

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
