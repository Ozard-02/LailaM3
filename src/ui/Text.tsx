import { forwardRef, type ComponentRef } from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { typography } from '@/theme/tokens';

export type TextVariant = keyof typeof typography;
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'inverse';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  numberOfLines?: number;
}

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function Text(
  { variant = 'body', tone = 'primary', style, ...rest },
  ref,
) {
  const theme = useTheme();
  const color =
    tone === 'secondary'
      ? theme.colors.textSecondary
      : tone === 'tertiary'
        ? theme.colors.textTertiary
        : tone === 'accent'
          ? theme.colors.accent
          : tone === 'danger'
            ? theme.colors.danger
            : tone === 'inverse'
              ? '#FFFFFF'
              : theme.colors.text;

  const heading = variant === 'display' || variant === 'largeTitle' || variant === 'title';
  return (
    <RNText
      {...rest}
      ref={ref}
      accessibilityRole={rest.accessibilityRole ?? (heading ? 'header' : undefined)}
      style={[theme.typography[variant], { color }, style]}
    />
  );
});
