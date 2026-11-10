import { useRouter } from 'expo-router';
import { WifiOff } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { useEffectiveOffline } from '@/stores/offline';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

/** Banner shown when the app is in offline mode (manual or no network). */
export function OfflineNotice() {
  const theme = useTheme();
  const router = useRouter();
  const offline = useEffectiveOffline();
  if (!offline) return null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Offline mode: showing downloaded music. Open downloads"
      onPress={() => router.push('/(main)/downloads')}
      haptic={false}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.accentSoft,
          borderColor: theme.colors.accent,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.accent }]}>
        <WifiOff size={16} color={theme.colors.background} />
      </View>
      <View style={styles.text}>
        <Text variant="callout">Offline · downloads only</Text>
        <Text variant="caption" tone="secondary">
          Home and Library are showing downloaded music.
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 12,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
