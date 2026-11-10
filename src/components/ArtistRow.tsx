import { useRouter } from 'expo-router';
import { ChevronRight } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import type { Artist } from '@/core/models';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

export function ArtistRow({ artist }: { artist: Artist }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open artist ${artist.name}`}
      onPress={() => router.push(`/(main)/artist/${artist.id}` as never)}
      style={[styles.row, { borderBottomColor: theme.colors.border }]}
    >
      <Artwork coverArt={artist.coverArt} size={48} radius={24} />
      <View style={styles.text}>
        <Text variant="callout" style={styles.name} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text variant="caption" tone="secondary">
          {artist.albumCount ?? 0} albums
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
});
