import { Keyboard, X } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { BottomSheetModal } from '@/ui/BottomSheetModal';
import { IconButton } from '@/ui/IconButton';
import { Text } from '@/ui/Text';

interface Shortcut {
  keys: string[];
  label: string;
}

const PLAYBACK: Shortcut[] = [
  { keys: ['Space'], label: 'Play / pause' },
  { keys: ['←', '→'], label: 'Seek 5 seconds' },
  { keys: ['Shift', '←/→'], label: 'Seek 30 seconds' },
  { keys: ['N', 'P'], label: 'Next / previous track' },
  { keys: ['S'], label: 'Shuffle' },
  { keys: ['R'], label: 'Repeat mode' },
  { keys: ['F'], label: 'Maximise / minimise player' },
  { keys: ['Delete'], label: 'Move current track to Trash' },
];

const NAVIGATION: Shortcut[] = [
  { keys: ['/'], label: 'Search the library' },
  { keys: ['G', 'H'], label: 'Go home' },
  { keys: ['G', 'L'], label: 'Go to library' },
  { keys: ['G', 'D'], label: 'Go to downloads' },
  { keys: ['G', 'S'], label: 'Go to settings' },
  { keys: ['Q'], label: 'Open queue' },
  { keys: ['Esc'], label: 'Close player or overlay' },
  { keys: ['?'], label: 'This help' },
];

function Group({ title, shortcuts }: { title: string; shortcuts: Shortcut[] }) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text variant="label" tone="tertiary">
        {title}
      </Text>
      {shortcuts.map((shortcut) => (
        <View key={shortcut.label} style={styles.row}>
          <View style={styles.keys}>
            {shortcut.keys.map((key) => (
              <View
                key={key}
                style={[
                  styles.key,
                  {
                    backgroundColor: theme.colors.elevated2,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <Text variant="caption" tone="secondary">
                  {key}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="callout" style={styles.label}>
            {shortcut.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Web keyboard cheat sheet, opened with `?` or from Settings. */
export function ShortcutsSheet() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const open = useUIStore((state) => state.shortcutsOpen);
  const setOpen = useUIStore((state) => state.setShortcutsOpen);

  return (
    <BottomSheetModal
      visible={open}
      onClose={() => setOpen(false)}
      dismissLabel="Close keyboard shortcuts"
      style={[
        styles.sheet,
        {
          backgroundColor: theme.colors.elevated,
          borderColor: theme.colors.border,
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Keyboard size={20} color={theme.colors.accent} />
          <View>
            <Text variant="headline" accessibilityRole="header">
              Keyboard shortcuts
            </Text>
            <Text variant="caption" tone="secondary">
              Work without leaving the keyboard.
            </Text>
          </View>
        </View>
        <IconButton label="Close keyboard shortcuts" size={36} onPress={() => setOpen(false)}>
          <X size={18} color={theme.colors.textSecondary} />
        </IconButton>
      </View>

      <View style={styles.columns}>
        <Group title="Playback" shortcuts={PLAYBACK} />
        <Group title="Navigate" shortcuts={NAVIGATION} />
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  columns: {
    flexDirection: 'row',
    gap: 28,
    flexWrap: 'wrap',
  },
  group: {
    flexGrow: 1,
    flexBasis: 260,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 32,
  },
  keys: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 112,
  },
  key: {
    minWidth: 26,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
});
