import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** A press this soon after a horizontal drag belongs to the drag, not the row. */
const PRESS_AFTER_SWIPE_MS = 400;
const LIFT_MS = 140;

/** Shared horizontal swipe used by track rows and queue rows. */
export function useSwipeRow({
  leftEnabled = true,
  rightEnabled = true,
  onLeft,
  onRight,
  onBegin,
  maxTranslate = 130,
  threshold = 58,
  revealDistance = 36,
  scale = 1,
}: {
  /** Swipe right / positive translation. */
  leftEnabled?: boolean;
  /** Swipe left / negative translation. */
  rightEnabled?: boolean;
  onLeft: () => void;
  onRight: () => void;
  onBegin?: () => void;
  maxTranslate?: number;
  threshold?: number;
  revealDistance?: number;
  scale?: number;
}) {
  const theme = useTheme();
  const reduceMotion = theme.reduceMotion;
  const translateX = useSharedValue(0);
  const scaleValue = useSharedValue(scale);
  const ended = useSharedValue(false);
  const [lastSwipeAt, setLastSwipeAt] = useState(0);

  // The lift is a real state change (dragging a queue row), so fade it in
  // instead of switching scale in the same frame the drag starts.
  useEffect(() => {
    scaleValue.set(reduceMotion ? scale : withTiming(scale, { duration: LIFT_MS }));
  }, [reduceMotion, scale, scaleValue]);

  // Runs in JS: the browser still delivers a click on pointer-up after a drag,
  // so the row's press handler asks `consumeSwipePress` before acting on it.
  const markSwiped = useCallback(() => setLastSwipeAt(Date.now()), []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          ended.set(false);
          if (onBegin) runOnJS(onBegin)();
        })
        .onStart(() => {
          runOnJS(markSwiped)();
        })
        .onUpdate((event) => {
          let next = event.translationX;
          if (next > 0 && !leftEnabled) next = 0;
          if (next < 0 && !rightEnabled) next = 0;
          translateX.set(Math.max(-maxTranslate, Math.min(maxTranslate, next)));
        })
        .onEnd((event) => {
          ended.set(true);
          // Stamp on release too. A slow, deliberate swipe can last longer
          // than the press guard window measured from drag start, and the
          // browser click lands after release.
          runOnJS(markSwiped)();
          const swipeRight = event.translationX > 0;
          const shouldTrigger =
            Math.abs(translateX.get()) >= threshold || Math.abs(event.velocityX) > 750;
          if (shouldTrigger) {
            if (swipeRight && leftEnabled) runOnJS(onLeft)();
            else if (!swipeRight && rightEnabled) runOnJS(onRight)();
          }
          // Spring back carrying the finger's velocity instead of a fixed
          // timing. Reduced motion parks the row immediately.
          translateX.set(
            reduceMotion
              ? 0
              : withSpring(0, { ...motion.releaseSpring, velocity: event.velocityX }),
          );
        })
        // A pan can fail or be cancelled without onEnd. Do not leave the row
        // half-way across its reveal action.
        .onFinalize(() => {
          if (!ended.get()) {
            translateX.set(reduceMotion ? 0 : withSpring(0, motion.releaseSpring));
          }
          ended.set(false);
        }),
    [
      ended,
      leftEnabled,
      markSwiped,
      maxTranslate,
      onBegin,
      onLeft,
      onRight,
      reduceMotion,
      rightEnabled,
      threshold,
      translateX,
    ],
  );

  /** True when the press that just landed is the tail of a horizontal swipe. */
  const consumeSwipePress = useCallback(
    () => Date.now() - lastSwipeAt < PRESS_AFTER_SWIPE_MS,
    [lastSwipeAt],
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scaleValue.value }],
  }));

  const leftOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, revealDistance], [0, 1], 'clamp'),
  }));

  const rightOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-revealDistance, 0], [1, 0], 'clamp'),
  }));

  return { gesture, translateX, contentStyle, leftOpacity, rightOpacity, consumeSwipePress };
}
