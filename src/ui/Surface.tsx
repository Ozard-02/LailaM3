import { View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export interface SurfaceProps extends ViewProps {
  variant?: 'base' | 'raised' | 'elevated' | 'glass';
  radius?: number;
  bordered?: boolean;
}

export function Surface({
  variant = 'raised',
  radius,
  bordered = false,
  style,
  ...rest
}: SurfaceProps) {
  const theme = useTheme();
  const backgroundColor =
    variant === 'base'
      ? theme.colors.background
      : variant === 'elevated'
        ? theme.colors.elevated2
        : variant === 'glass'
          ? 'rgba(255,255,255,0.06)'
          : theme.colors.surface;

  const computed: ViewStyle = {
    backgroundColor,
    borderRadius: radius ?? theme.radius.md,
    borderWidth: bordered ? 1 : 0,
    borderColor: theme.colors.border,
  };

  return <View {...rest} style={[computed, style]} />;
}
