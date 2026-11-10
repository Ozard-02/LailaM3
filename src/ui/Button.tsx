import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();
  const height = size === 'sm' ? 34 : size === 'lg' ? 52 : 44;
  const padding = size === 'sm' ? 12 : size === 'lg' ? 22 : 18;
  const background =
    variant === 'primary'
      ? theme.colors.accentSolid
      : variant === 'danger'
        ? theme.colors.danger
        : variant === 'secondary'
          ? theme.colors.elevated2
          : 'transparent';
  const textTone =
    variant === 'primary' || variant === 'danger'
      ? 'inverse'
      : variant === 'ghost'
        ? 'secondary'
        : 'primary';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.base,
        {
          height,
          paddingHorizontal: padding,
          backgroundColor: background,
          borderRadius: theme.radius.pill,
          opacity: disabled ? 0.45 : 1,
          borderWidth: variant === 'ghost' || variant === 'secondary' ? 1 : 0,
          borderColor: theme.colors.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={textTone === 'inverse' ? '#fff' : theme.colors.text} />
        ) : (
          icon
        )}
        <Text variant={size === 'sm' ? 'caption' : 'callout'} tone={textTone} style={styles.label}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontWeight: '700',
  },
});
