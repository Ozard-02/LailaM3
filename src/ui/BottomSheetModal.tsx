import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Modal bottom sheet: the scrim fades and the sheet slides up on a spring,
 * then slides down before unmounting. Only opacity/transform are animated.
 * Replaces RN Modal's `animationType="fade"`, which faded the whole sheet.
 */
export function BottomSheetModal({
  visible,
  onClose,
  dismissLabel,
  style,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  dismissLabel: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(0);
  const progress = useSharedValue(0);
  const reduceMotion = theme.reduceMotion;

  // Mount synchronously when shown; unmount only after the exit animation.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      // Wait for the measured height so the slide starts exactly off-screen.
      if (!sheetHeight) return;
      progress.set(reduceMotion ? 1 : withSpring(1, theme.motion.sheetSpring));
      return;
    }
    progress.set(
      withTiming(0, { duration: reduceMotion ? 0 : 180 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      }),
    );
  }, [mounted, progress, reduceMotion, sheetHeight, theme.motion.sheetSpring, visible]);

  const distance = sheetHeight || height;
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * distance }],
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          style={[style, sheetStyle]}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
