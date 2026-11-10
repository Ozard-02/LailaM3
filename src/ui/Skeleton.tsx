import { useEffect } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';

/** One pulse shared by every skeleton on screen instead of one loop per box. */
const pulse = makeMutable(0.45);
let pulseUsers = 0;

function startPulse() {
  if (pulseUsers === 0) {
    pulse.value = withRepeat(withTiming(0.9, { duration: 900 }), -1, true);
  }
  pulseUsers += 1;
}

function stopPulse() {
  pulseUsers = Math.max(0, pulseUsers - 1);
  if (pulseUsers === 0) {
    cancelAnimation(pulse);
    pulse.value = 0.45;
  }
}

export function Skeleton({ style }: { style?: ViewStyle }) {
  const theme = useTheme();
  const foreground = useUIStore((state) => state.foreground);
  const animate = foreground && !theme.reduceMotion;

  useEffect(() => {
    if (!animate) return undefined;
    startPulse();
    return stopPulse;
  }, [animate]);

  const animated = useAnimatedStyle(() => ({
    opacity: animate ? pulse.value : 0.6,
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        { backgroundColor: theme.colors.elevated2, borderRadius: theme.radius.sm },
        style,
        animated,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
