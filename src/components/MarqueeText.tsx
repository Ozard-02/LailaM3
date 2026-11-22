import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { Text, type TextProps, type TextVariant } from '@/ui/Text';

export interface MarqueeTextProps {
  children: string;
  variant?: TextVariant;
  tone?: TextProps['tone'];
  style?: TextStyle;
  paused?: boolean;
  /** Centre short text in the container; overflowing text still scrolls. */
  align?: 'left' | 'center';
}

const GAP = 32;

/**
 * Single-line text that scrolls only when it overflows. Two copies are laid out
 * side by side and the row loops by exactly one copy + gap, so the restart is
 * seamless instead of jumping back to the start.
 */
export function MarqueeText({
  children,
  variant = 'body',
  tone,
  style,
  paused = false,
  align = 'left',
}: MarqueeTextProps) {
  const theme = useTheme();
  const foreground = useUIStore((state) => state.foreground);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measurement, setMeasurement] = useState({ text: '', width: 0 });
  const offset = useSharedValue(0);
  const textWidth = measurement.text === children ? measurement.width : 0;
  const overflow = Math.max(0, textWidth - containerWidth);
  const scrolling = overflow > 0 && textWidth > 0;
  const center = align === 'center' && !scrolling;
  const distance = textWidth + GAP;
  const scrollDuration = Math.min(18_000, Math.max(9_000, distance * 24));
  const initialPause = 4_500;
  const betweenPause = 6_000;

  useEffect(() => {
    cancelAnimation(offset);
    if (paused || overflow <= 0 || theme.reduceMotion || !foreground) {
      offset.set(0);
      return;
    }
    // Scroll once, hold the end position (the second copy is aligned there),
    // reset invisibly, then hold again before the next pass.
    offset.set(
      withDelay(
        initialPause,
        withRepeat(
          withSequence(
            withTiming(-distance, { duration: scrollDuration }),
            withDelay(betweenPause, withTiming(0, { duration: 0 })),
          ),
          -1,
          false,
        ),
      ),
    );
  }, [distance, foreground, offset, overflow, paused, scrollDuration, theme.reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  // Static single line: no ScrollView measurement, no duplicated text and no
  // animation loop while performance mode (or the system) asks for less motion.
  if (theme.reduceMotion) {
    return (
      <View style={styles.container}>
        <Text
          variant={variant}
          tone={tone}
          style={[style, center && styles.textCenter]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {children}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.content,
          center && styles.contentCenter,
          overflow > 0 && textWidth > 0 ? { width: distance + textWidth } : undefined,
          animatedStyle,
        ]}
      >
        <Text
          variant={variant}
          tone={tone}
          style={[style, align === 'center' && styles.textCenter, styles.text, textWidth > 0 && overflow > 0 ? { width: textWidth } : undefined]}
          numberOfLines={1}
        >
          {children}
        </Text>
        {overflow > 0 && textWidth > 0 ? (
          <Text
            variant={variant}
            tone={tone}
            style={[style, styles.text, { width: textWidth, marginLeft: GAP }]}
            numberOfLines={1}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            {children}
          </Text>
        ) : null}
      </Animated.View>
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.measure}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          // Remount when the title changes: two titles can have exactly the
          // same width, in which case no layout event would fire and the new
          // title would never be measured as overflowing.
          key={children}
          variant={variant}
          tone={tone}
          style={[style, styles.text]}
          numberOfLines={1}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width > 0 && (measurement.text !== children || measurement.width !== width)) {
              setMeasurement({ text: children, width });
            }
          }}
        >
          {children}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  contentCenter: {
    alignSelf: 'center',
  },
  text: {
    flexShrink: 0,
  },
  textCenter: {
    textAlign: 'center',
  },
  measure: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
