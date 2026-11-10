import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { BottomSheetModal } from './BottomSheetModal';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ActionSheetItem {
  label: string;
  icon: ReactNode;
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}

/** Bottom action sheet shared by the player and library screens. */
export function ActionSheet({ visible, title, items, onClose }: ActionSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      dismissLabel="Close menu"
      style={[
        styles.sheet,
        {
          backgroundColor: theme.colors.elevated,
          borderColor: theme.colors.border,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {title ? (
        <Text variant="headline" style={styles.title}>
          {title}
        </Text>
      ) : null}
      {items.map((item) => (
        <PressableScale
          key={item.label}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={item.onPress}
          haptic={false}
          style={styles.action}
        >
          {item.icon}
          <Text variant="callout">{item.label}</Text>
        </PressableScale>
      ))}
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
    gap: 4,
  },
  title: {
    marginBottom: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
});
