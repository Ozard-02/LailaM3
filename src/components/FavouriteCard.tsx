import { useRouter } from 'expo-router';
import { Heart } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

export function FavouriteCard({ width = 158 }: { width?: number }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Open favourites"
      onPress={() => router.push('/(main)/favourites' as never)}
      style={{ width }}
    >
      <View
        style={[
          styles.art,
          {
            width,
            height: width,
            backgroundColor: theme.colors.accentSoft,
            borderColor: theme.colors.accent,
            borderRadius: theme.radius.artwork,
          },
        ]}
      >
        <Heart size={Math.min(48, width * 0.3)} color={theme.colors.accent} fill={theme.colors.accent} />
      </View>
      <View style={styles.text}>
        <Text variant="callout" numberOfLines={1} style={styles.title}>
          Favourited
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          Starred tracks
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  art: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
