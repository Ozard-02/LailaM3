import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { Album } from '@/core/models';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

export function AlbumCard({ album, width }: { album: Album; width?: number }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <PressableScale
      testID={`album-card-${album.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${album.name} by ${album.artist ?? 'unknown artist'}`}
      onPress={() => router.push(`/(main)/album/${album.id}` as never)}
      style={[styles.base, width ? { width } : undefined]}
    >
      <Artwork coverArt={album.coverArt} size={width ?? 160} radius={theme.radius.artwork} style={styles.art} />
      <View style={styles.text}>
        <Text variant="callout" numberOfLines={1} style={styles.title}>
          {album.name}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {album.artist ?? 'Unknown artist'}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    gap: 10,
    flex: 1,
  },
  art: {
    width: '100%',
    aspectRatio: 1,
    height: undefined,
  },
  text: {
    gap: 2,
    paddingHorizontal: 2,
  },
  title: {
    fontWeight: '700',
  },
});
