import { useCallback, type PropsWithChildren } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { tapFeedback } from '@/utils/haptics';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Layout applied to the outer Pressable (flex, width, height). */
  containerStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
}

export function PressableScale({
  children,
  style,
  containerStyle,
  scaleTo,
  haptic = true,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PropsWithChildren<PressableScaleProps>) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const target = scaleTo ?? theme.motion.pressScale;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      scale.set(theme.reduceMotion ? 1 : withSpring(target, theme.motion.snappySpring));
      onPressIn?.(event);
    },
    [onPressIn, scale, target, theme.motion.snappySpring, theme.reduceMotion],
  );

  const handleOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (event) => {
      scale.set(theme.reduceMotion ? 1 : withSpring(1, theme.motion.snappySpring));
      onPressOut?.(event);
    },
    [onPressOut, scale, theme.motion.snappySpring, theme.reduceMotion],
  );

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      if (haptic) tapFeedback();
      onPress?.(event);
    },
    [haptic, onPress],
  );

  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={handlePress}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
