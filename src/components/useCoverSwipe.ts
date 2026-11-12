import { Image } from 'expo-image';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { currentTrack as selectCurrentTrack, queueReducer } from '@/core/queue/reducer';
import { buildCoverUrl } from '@/core/subsonic/params';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';

const RETURN_SPRING = { damping: 26, stiffness: 320, mass: 0.7, overshootClamping: true };
const COMMIT_DISTANCE = 58;
const COMMIT_VELOCITY = 650;

/** Direction of a committed swipe awaiting the new cover's first commit. */
function createPendingSwipe() {
  let dir = 0;
  return {
    set(next: number) {
      dir = next;
    },
    take(): number {
      const value = dir;
      dir = 0;
      return value;
    },
  };
}

function currentId(): string | undefined {
  return selectCurrentTrack(usePlayerStore.getState().queueState)?.id;
}

/**
 * Horizontal swipe on the cover: drag follows the finger, a committed swipe
 * slides the cover out, changes track, then slides the new cover in from the
 * other side. Only transform is animated, so this stays on Reanimated's fast
 * path. `coverSize` is the rendered Artwork size, used to prefetch the exact
 * neighbour cover URLs so the incoming cover is already decoded.
 */
export function useCoverSwipe({
  distance,
  coverSize,
  enabled = true,
}: {
  distance: number;
  coverSize?: number;
  enabled?: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = theme.reduceMotion;
  const swipeX = useSharedValue(0);
  // JS-only flag. Not a shared value: on native, a JS read of a shared value
  // returns a cached copy until the UI thread has applied the write, so the
  // layout effect saw 0 and the new cover stayed parked off-screen.
  const [pending] = useState(createPendingSwipe);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const queueState = usePlayerStore((state) => state.queueState);
  const server = useAuthStore((state) => state.server);
  const trackId = selectCurrentTrack(queueState)?.id;

  // A drag also fires the Pressable's onPress ("tap for lyrics"). This flag
  // lets the tap handler ignore the click that closes a swipe; it clears a
  // moment after the gesture so keyboard activation is never blocked for long.
  const [swiped, setSwiped] = useState(false);
  const resetSwiped = useCallback(() => {
    setTimeout(() => setSwiped(false), 400);
  }, []);

  // dir < 0: swiped left (next); dir > 0: swiped right (previous).
  const commit = useCallback(
    (dir: number) => {
      const before = currentId();
      pending.set(dir);
      void (dir < 0 ? next() : previous());
      if (currentId() === before) {
        // Nothing to change to (start of queue, end with repeat off).
        pending.set(0);
        swipeX.set(reduceMotion ? 0 : withSpring(0, RETURN_SPRING));
      }
    },
    [next, pending, previous, reduceMotion, swipeX],
  );

  // Runs after the new cover is committed, so the old image never slides in.
  useLayoutEffect(() => {
    const dir = pending.take();
    if (!dir) return;
    if (reduceMotion) {
      swipeX.set(0);
      return;
    }
    swipeX.set(-dir * distance);
    swipeX.set(withSpring(0, RETURN_SPRING));
  }, [distance, pending, reduceMotion, swipeX, trackId]);

  useEffect(() => {
    if (!server || !coverSize) return;
    const urls = [
      selectCurrentTrack(queueReducer(queueState, { type: 'next' })),
      selectCurrentTrack(queueReducer(queueState, { type: 'previous' })),
    ]
      .filter((track) => track && track.id !== trackId && track.coverArt)
      .map((track) => buildCoverUrl(server, track!.coverArt!, Math.round(coverSize * 2)));
    if (urls.length) void Image.prefetch(urls, 'memory-disk').catch(() => undefined);
  }, [coverSize, queueState, server, trackId]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-18, 18])
        .failOffsetY([-18, 18])
        .onBegin(() => {
          runOnJS(setSwiped)(false);
        })
        .onUpdate((event) => {
          swipeX.set(Math.max(-distance, Math.min(distance, event.translationX)));
          if (Math.abs(event.translationX) > 8) runOnJS(setSwiped)(true);
        })
        .onEnd((event) => {
          runOnJS(resetSwiped)();
          const dx = event.translationX;
          const vx = event.velocityX;
          const dir =
            dx < -COMMIT_DISTANCE || vx < -COMMIT_VELOCITY
              ? -1
              : dx > COMMIT_DISTANCE || vx > COMMIT_VELOCITY
                ? 1
                : 0;
          if (!dir) {
            swipeX.set(withSpring(0, { ...RETURN_SPRING, velocity: vx }));
            return;
          }
          if (reduceMotion) {
            runOnJS(commit)(dir);
            return;
          }
          swipeX.set(
            withTiming(dir * distance, { duration: 150 }, (finished) => {
              if (finished) runOnJS(commit)(dir);
            }),
          );
        }),
    [commit, distance, enabled, reduceMotion, resetSwiped, swipeX],
  );

  return { gesture, swipeX, swiped };
}
