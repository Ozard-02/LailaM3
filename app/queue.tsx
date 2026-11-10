import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QueuePanel } from '@/components/QueuePanel';
import { useTheme } from '@/theme/ThemeProvider';

export default function QueueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <QueuePanel
        onClose={() => router.back()}
        topPadding={insets.top + 10}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
