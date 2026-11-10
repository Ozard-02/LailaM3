import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { Playlist } from '@/core/models';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';
import { trackCount } from '@/utils/format';

export function PlaylistCard({ playlist, width = 158 }: { playlist: Playlist; width?: number }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open playlist ${playlist.name}`}
      onPress={() => router.push(`/(main)/playlist/${playlist.id}` as never)}
      style={{ width }}
    >
      <Artwork coverArt={playlist.coverArt} size={width} radius={theme.radius.artwork} style={styles.art} />
      <View style={styles.text}>
        <Text variant="callout" numberOfLines={1} style={styles.title}>
          {playlist.name}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {trackCount(playlist.songCount, 'track')}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  art: {
    width: '100%',
    aspectRatio: 1,
    height: undefined,
  },
  text: {
    gap: 2,
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  title: {
    fontWeight: '700',
  },
});
