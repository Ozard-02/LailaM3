import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type KeyDownEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTime } from '@/utils/format';
import { Text } from './Text';

export interface ProgressBarProps {
  value: number;
  max: number;
  onSeek?: (value: number) => void;
  height?: number;
  showThumb?: boolean;
  label?: string;
  /** Format the scrub tooltip. Defaults to `m:ss` for playback. */
  formatValue?: (value: number) => string;
}

const PILL_WIDTH = 58;
const PILL_HEIGHT = 26;
const HIDE_DELAY = 700;

export function ProgressBar({
  value,
  max,
  onSeek,
  height = 4,
  showThumb = false,
  label,
  formatValue,
}: ProgressBarProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [interacting, setInteracting] = useState(false);
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const displayRatio = scrub ?? ratio;
  const displayValue = Math.round(displayRatio * max);

  // Hide the preview shortly after a tap or a released drag.
  useEffect(() => {
    if (scrub === null || interacting) return;
    const timer = setTimeout(() => setScrub(null), HIDE_DELAY);
    return () => clearTimeout(timer);
  }, [scrub, interacting]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const clampRatio = useCallback(
    (x: number) => {
      if (width <= 0) return 0;
      return Math.max(0, Math.min(1, x / width));
    },
    [width],
  );

  const seekAt = useCallback(
    (x: number) => {
      const next = clampRatio(x);
      setScrub(next);
      onSeek?.(next * max);
    },
    [clampRatio, max, onSeek],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-4, 4])
        .failOffsetY([-16, 16])
        .onBegin((event) => {
          // Show the target time as soon as the user presses; holding still
          // keeps it up because `interacting` blocks the auto-hide.
          setInteracting(true);
          setScrub(clampRatio(event.x));
        })
        .onStart((event) => {
          setScrub(clampRatio(event.x));
        })
        .onUpdate((event) => {
          // X only: the vertical component is deliberately ignored once active.
          setScrub(clampRatio(event.x));
        })
        .onEnd((event) => {
          const next = clampRatio(event.x);
          setScrub(next);
          onSeek?.(next * max);
        })
        .onFinalize(() => setInteracting(false)),
    [clampRatio, max, onSeek],
  );

  const seekTo = useCallback(
    (next: number) => {
      if (!onSeek || !Number.isFinite(max) || max <= 0 || !Number.isFinite(next)) return;
      const clamped = Math.max(0, Math.min(max, next));
      setScrub(clamped / max);
      onSeek(clamped);
    },
    [max, onSeek],
  );

  const onKeyDown = (event: KeyDownEvent) => {
    if (!onSeek || max <= 0) return;
    const key = event.nativeEvent.key;
    const step = event.nativeEvent.shiftKey ? 30 : 5;
    switch (key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        seekTo(value - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        seekTo(value + step);
        break;
      case 'PageDown':
        event.preventDefault();
        seekTo(value - 30);
        break;
      case 'PageUp':
        event.preventDefault();
        seekTo(value + 30);
        break;
      case 'Home':
        event.preventDefault();
        seekTo(0);
        break;
      case 'End':
        event.preventDefault();
        seekTo(max);
        break;
      default:
        break;
    }
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    if (action === 'increment') seekTo(value + 5);
    else if (action === 'decrement') seekTo(value - 5);
  };

  const pillLeft =
    width > 0
      ? Math.max(0, Math.min(width - PILL_WIDTH, displayRatio * width - PILL_WIDTH / 2))
      : 0;

  const bar = (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: Math.round(max),
        now: Math.round(scrub !== null ? scrub * max : value),
      }}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(scrub !== null ? scrub * max : value)}
      onLayout={onLayout}
      onPress={(event) => {
        if (!onSeek || width <= 0) return;
        seekAt(event.nativeEvent.locationX);
      }}
      onKeyDown={onSeek ? onKeyDown : undefined}
      accessibilityActions={
        onSeek ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
      }
      onAccessibilityAction={onSeek ? onAccessibilityAction : undefined}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.hit, { height: Math.max(height + 12, 20) }]}
    >
      {scrub !== null && width > 0 ? (
        <View
          testID="seek-preview"
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              left: pillLeft,
              backgroundColor: theme.colors.elevated,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Text variant="caption" tone="primary">
            {formatValue ? formatValue(displayValue) : formatTime(displayValue)}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.track,
          { height, borderRadius: height / 2, backgroundColor: theme.colors.accentSoft },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${displayRatio * 100}%`,
              height,
              borderRadius: height / 2,
              backgroundColor: theme.colors.accent,
            },
          ]}
        />
        {showThumb || scrub !== null ? (
          <View
            style={[
              styles.thumb,
              {
                left: `${displayRatio * 100}%`,
                backgroundColor: theme.colors.accent,
                opacity: hover || scrub !== null ? 1 : 0.9,
              },
            ]}
          />
        ) : null}
      </View>
    </Pressable>
  );

  if (!onSeek) return bar;
  return <GestureDetector gesture={gesture}>{bar}</GestureDetector>;
}

const styles = StyleSheet.create({
  hit: {
    justifyContent: 'center',
    width: '100%',
  },
  track: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    top: -4,
  },
  tooltip: {
    position: 'absolute',
    top: -PILL_HEIGHT - 8,
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    zIndex: 20,
    elevation: 20,
  },
});
