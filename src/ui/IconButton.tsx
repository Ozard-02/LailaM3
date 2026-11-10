import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/ThemeProvider';

export interface IconButtonProps {
  children: ReactNode;
  onPress?: () => void;
  label: string;
  size?: number;
  variant?: 'plain' | 'soft';
  disabled?: boolean;
  selected?: boolean;
}

export function IconButton({
  children,
  onPress,
  label,
  size = 40,
  variant = 'plain',
  disabled = false,
  selected = false,
}: IconButtonProps) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: selected
            ? theme.colors.accentSoft
            : variant === 'soft'
              ? 'rgba(255,255,255,0.08)'
              : 'transparent',
          borderWidth: selected ? 1 : 0,
          borderColor: selected ? theme.colors.accent : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
