import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface PillProps {
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Pill({ label, icon, selected = false, onPress, style }: PillProps) {
  const theme = useTheme();
  const content = (
    <View
      style={[
        styles.base,
        {
          backgroundColor: selected ? theme.colors.text : theme.colors.elevated2,
          borderColor: selected ? theme.colors.text : theme.colors.border,
        },
        style,
      ]}
    >
      {icon}
      <Text
        variant="caption"
        tone={selected ? 'primary' : 'secondary'}
        style={selected ? { color: theme.colors.background } : undefined}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
});
