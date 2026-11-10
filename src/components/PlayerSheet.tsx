import { useRouter } from 'expo-router';
import { Pause, Play } from '@/ui/icons';
import { useCallback, useMemo, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { MarqueeText } from '@/components/MarqueeText';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { PressableScale } from '@/ui/PressableScale';
import { IconButton } from '@/ui/IconButton';
import { PlayerScreen, type SharedPart, type SharedRect } from './PlayerScreen';
import { useWebDialog } from '@/hooks/useWebDialog';
import { useCoverSwipe } from './useCoverSwipe';

export interface PlayerOrigin {
  top: number;
  left: number;
  right: number;
  height: number;
  radius: number;
}

function range(p: number, from: number, to: number): number {
  'worklet';
  return Math.max(0, Math.min(1, (p - from) / (to - from)));
}

/**
 * Morph from the mini player. The background expands from the pill rect while
 * the artwork/title/play elements fly to rects measured inside PlayerScreen.
 * The expanded layout itself is faded in late, so it is never squashed.
 */
export function PlayerSheet({
  progress,
  origin,
  open,
  morph = true,
  onClose,
}: {
  progress: SharedValue<number>;
  origin: PlayerOrigin;
  open: boolean;
  morph?: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const track = useCurrentTrack();
  const status = usePlayerStore((state) => state.status);
  const toggle = usePlayerStore((state) => state.toggle);
  const [rects, setRects] = useState<Partial<Record<SharedPart, SharedRect>>>({});
  // React state only for pointer events; visuals follow queueProgress on the
  // UI thread so the overlay and the queue sheet swap in the same frame.
  const [queueOpen, setQueueOpen] = useState(false);
  const [settledAtOne, setSettledAtOne] = useState(false);
  // Queue panel mounts once the player has come to rest and unmounts only
  // after it is fully closed, so neither happens mid-animation.
  const [queueReady, setQueueReady] = useState(false);
  const queueProgress = useSharedValue(0);
  const detailsOn = useSharedValue(false);
  const detailsOpacity = useSharedValue(0);
  const surfaceVisible = useSharedValue(false);
  const surfaceOpacity = useSharedValue(0);
  const scrimVisible = useSharedValue(false);
  const scrimOpacity = useSharedValue(0);

  const wasSettled = useSharedValue(false);
  const wasParked = useSharedValue(true);
  const sheetRef = useRef<ComponentRef<typeof View>>(null);

  useWebDialog(open, sheetRef, '[aria-label="Close player"]');

  useAnimatedReaction(
    () => progress.get(),
    (p) => {
      // React state flips only at the two rest points (fully open / fully
      // parked), never mid-flight: a React commit during the close spring
      // costs frames. "Settled" stays true through the close and resets once
      // parked, so closing triggers no render at all.
      if (p >= 0.995 && !wasSettled.get()) {
        wasSettled.set(true);
        wasParked.set(false);
        runOnJS(setSettledAtOne)(true);
        runOnJS(setQueueReady)(true);
      }
      if (p <= 0.001 && !wasParked.get()) {
        wasParked.set(true);
        if (wasSettled.get()) {
          wasSettled.set(false);
          runOnJS(setSettledAtOne)(false);
          runOnJS(setQueueReady)(false);
        }
      }
      if (p > 0.001) wasParked.set(false);

      const surfaceNow = p > 0.02;
      if (surfaceNow !== surfaceVisible.get()) {
        surfaceVisible.set(surfaceNow);
        surfaceOpacity.set(withTiming(surfaceNow ? 1 : 0, { duration: 140 }));
      }
      const scrimNow = p > 0.04;
      if (scrimNow !== scrimVisible.get()) {
        scrimVisible.set(scrimNow);
        scrimOpacity.set(withTiming(scrimNow ? 0.55 : 0, { duration: 140 }));
      }
      if (p <= 0.001) {
        surfaceOpacity.set(0);
        scrimOpacity.set(0);
      }

      // One threshold and one duration in both directions: the inverse morph
      // is the time-reverse of the open, not a faster close.
      const next = p > 0.55;
      if (next !== detailsOn.get()) {
        detailsOn.set(next);
        detailsOpacity.set(withTiming(next ? 1 : 0, { duration: 140 }));
      }
      if (p >= 0.995) detailsOpacity.set(1);
      if (p <= 0.001) detailsOpacity.set(0);
    },
  );

  const onSharedRect = useCallback((part: SharedPart, rect: SharedRect) => {
    setRects((current) => {
      const old = current[part];
      if (
        old &&
        Math.abs(old.x - rect.x) < 0.5 &&
        Math.abs(old.y - rect.y) < 0.5 &&
        Math.abs(old.width - rect.width) < 0.5 &&
        Math.abs(old.height - rect.height) < 0.5
      ) {
        return current;
      }
      return { ...current, [part]: rect };
    });
  }, []);

  const pillWidth = width - origin.left - origin.right;
  const pillRight = origin.left + pillWidth;
  const largePill = origin.height >= 68;
  const compactArtSize = largePill ? 52 : 42;
  const compactArt = {
    x: origin.left + 9,
    y: origin.top + (origin.height - compactArtSize) / 2,
    width: compactArtSize,
    height: compactArtSize,
  };
  const compactPlaySize = largePill ? 46 : 40;
  const compactQueueSize = largePill ? 40 : 38;
  const compactPlay = {
    cx: pillRight - (4 + compactQueueSize + 10 + compactPlaySize / 2),
    cy: origin.top + origin.height / 2,
    size: compactPlaySize,
  };
  const compactTitle = {
    x: compactArt.x + compactArt.width + 10,
    y: origin.top + 10,
    width: compactPlay.cx - 30 - (compactArt.x + compactArt.width + 10),
  };

  const pillCx = origin.left + pillWidth / 2;
  const pillCy = origin.top + origin.height / 2;
  const scaleFromX = pillWidth / width;
  const scaleFromY = origin.height / height;

  // Static radius: animating borderRadius re-rasterises the full-screen view
  // every frame. Match the selected compact-pill radius on screen; the square
  // layer below takes over at the end of the travel.
  const pillRadius = Math.min(origin.radius, origin.height / 2);
  const backgroundRadius = pillRadius / Math.max(0.08, scaleFromX);

  const backgroundStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.get()));
    return {
      opacity: surfaceOpacity.get(),
      transform: [
        { translateX: (pillCx - width / 2) * (1 - p) },
        { translateY: (pillCy - height / 2) * (1 - p) },
        { scaleX: scaleFromX + (1 - scaleFromX) * p },
        { scaleY: scaleFromY + (1 - scaleFromY) * p },
      ],
    };
  });

  const backgroundSquareStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.get()));
    return { opacity: surfaceOpacity.get() * range(p, 0.88, 1) };
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.get(),
  }));

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: detailsOpacity.get(),
  }));

  const art = rects.art;
  const play = rects.play;
  const titleRect = rects.title;
  const artSize = art ? Math.round(art.width) : 0;
  const { gesture: coverGesture, swipeX: artSwipeX } = useCoverSwipe({
    distance: width,
    coverSize: artSize || undefined,
    enabled: settledAtOne,
  });

  // A close can start from Escape, the close button, a resize or the mini-player
  // gesture; none of those go through handleClose. Reset the overlay state as
  // soon as progress starts decreasing so the queue does not hide it and the
  // shared elements stay no longer interactive while they fly back.
  const closeStarted = useSharedValue(false);
  useAnimatedReaction(
    () => progress.get(),
    (p) => {
      if (p < 0.99 && !closeStarted.get()) {
        closeStarted.set(true);
        wasSettled.set(false);
        queueProgress.set(0);
        artSwipeX.set(0);
        runOnJS(setSettledAtOne)(false);
        runOnJS(setQueueOpen)(false);
      } else if (p >= 0.995) {
        closeStarted.set(false);
      }
    },
  );

  // Layout is static (changes only when a rect is re-measured). Animated
  // styles below carry transform/opacity only, so per-frame updates skip the
  // shadow-tree commit and layout pass.
  const artBox = useMemo(
    () =>
      art
        ? { position: 'absolute' as const, left: art.x, top: art.y, width: art.width, height: art.height }
        : null,
    [art],
  );
  const playBox = useMemo(
    () =>
      play
        ? {
            position: 'absolute' as const,
            left: play.x + play.width / 2 - 36,
            top: play.y + play.height / 2 - 36,
            width: 72,
            height: 72,
          }
        : null,
    [play],
  );
  const compactTitleBox = useMemo(
    () => ({
      position: 'absolute' as const,
      left: compactTitle.x,
      top: compactTitle.y,
      width: compactTitle.width,
    }),
    [compactTitle.x, compactTitle.y, compactTitle.width],
  );
  const expandedTitleBox = useMemo(
    () =>
      titleRect
        ? { position: 'absolute' as const, left: titleRect.x, top: titleRect.y, width: titleRect.width }
        : null,
    [titleRect],
  );

  const artTargetCx = art ? art.x + art.width / 2 : 0;
  const artTargetCy = art ? art.y + art.height / 2 : 0;
  const artHeight = art ? art.height : 1;
  const artScaleFrom = art ? compactArt.width / art.width : 1;
  const compactArtCx = compactArt.x + compactArt.width / 2;
  const compactArtCy = compactArt.y + compactArt.height / 2;
  const originTop = origin.top;

  const artStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.get()));
    // Symmetric smoothstep: the close retraces the open trajectory instead of
    // using the time-reverse of an ease-out curve.
    const eased = p * p * (3 - 2 * p);
    const scale = artScaleFrom + (1 - artScaleFrom) * eased;
    let cy = artTargetCy + (compactArtCy - artTargetCy) * (1 - eased);
    const visualTop = cy - (artHeight * scale) / 2;
    const surfaceTop = originTop * (1 - p);
    if (visualTop < surfaceTop + 6) {
      cy += surfaceTop + 6 - visualTop;
    }
    return {
      opacity: Math.min(1, p * 8),
      transform: [
        { translateX: (compactArtCx - artTargetCx) * (1 - eased) + artSwipeX.get() },
        { translateY: cy - artTargetCy },
        { scale },
      ],
    };
  });

  const playTargetCx = play ? play.x + play.width / 2 : 0;
  const playTargetCy = play ? play.y + play.height / 2 : 0;
  const compactPlayCx = compactPlay.cx;
  const compactPlayCy = compactPlay.cy;
  const playScaleFrom = compactPlay.size / 72;

  const playStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.get()));
    const eased = p * p * (3 - 2 * p);
    return {
      opacity: Math.min(1, p * 8),
      transform: [
        { translateX: (compactPlayCx - playTargetCx) * (1 - eased) },
        { translateY: (compactPlayCy - playTargetCy) * (1 - eased) },
        { scale: playScaleFrom + (1 - playScaleFrom) * eased },
      ],
    };
  });

  const compactTitleStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.get()));
    return { opacity: Math.min(1, p * 8) * (1 - range(p, 0.3, 0.55)) };
  });

  const expandedTitleStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, progress.get()));
    return { opacity: range(p, 0.4, 0.75) };
  });

  // Overlay is hidden whenever the queue sheet has left its rest position,
  // and PlayerScreen shows its own shared elements in the same frame.
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: queueProgress.get() > 0.001 ? 0 : 1,
  }));

  const handleClose = useCallback(() => {
    // Leaving with the queue up: drop it so the morph back has its overlay.
    queueProgress.set(0);
    onClose();
  }, [onClose, queueProgress]);

  const openLibrary = useCallback(
    (href: string) => {
      handleClose();
      router.push(href as never);
    },
    [handleClose, router],
  );

  const isPlaying = status === 'playing';
  const wide = width >= 900;

  return (
    <View
      ref={sheetRef}
      testID="player-sheet"
      style={styles.root}
      pointerEvents={open ? 'auto' : 'box-none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!open}
      aria-label="Player"
      aria-modal={open || undefined}
      role={open ? 'dialog' : undefined}
    >
      <Animated.View pointerEvents="none" style={[styles.scrim, scrimStyle]} />

      <Animated.View
        testID="player-surface"
        pointerEvents="none"
        style={[
          styles.background,
          { backgroundColor: theme.colors.background, borderRadius: backgroundRadius },
          backgroundStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.background, { backgroundColor: theme.colors.background }, backgroundSquareStyle]}
      />

      <Animated.View
        pointerEvents={settledAtOne ? 'auto' : 'none'}
        style={[styles.expanded, expandedStyle]}
      >
        <PlayerScreen
          active={open}
          queueReady={queueReady}
          onClose={handleClose}
          onOpenLibrary={openLibrary}
          hideShared={morph}
          queueProgress={queueProgress}
          reducedEffects={false}
          onSharedRect={onSharedRect}
          onQueueOpenChange={setQueueOpen}
        />
      </Animated.View>

      {morph && track ? (
        <Animated.View
          testID="player-morph-overlay"
          pointerEvents={queueOpen ? 'none' : 'box-none'}
          aria-hidden={queueOpen}
          accessibilityElementsHidden={queueOpen}
          importantForAccessibility={queueOpen ? 'no-hide-descendants' : 'auto'}
          style={[styles.overlay, overlayStyle]}
        >
          {artBox ? (
            <GestureDetector gesture={coverGesture}>
              <Animated.View
                pointerEvents={settledAtOne ? 'auto' : 'none'}
                style={[artBox, artStyle]}
              >
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Album cover: tap for lyrics, swipe left or right for previous or next"
                  onPress={() => router.push('/lyrics')}
                  haptic={false}
                >
                  <Artwork key={track.id} coverArt={track.coverArt} size={artSize} radius={10} />
                </PressableScale>
              </Animated.View>
            </GestureDetector>
          ) : null}

          <Animated.View pointerEvents="none" style={[compactTitleBox, compactTitleStyle]}>
            <MarqueeText variant="callout" style={styles.strong} paused>
              {track.title}
            </MarqueeText>
          </Animated.View>

          {expandedTitleBox ? (
            <Animated.View pointerEvents="none" style={[expandedTitleBox, expandedTitleStyle]}>
              <MarqueeText variant={wide ? 'display' : 'title'} paused={!settledAtOne}>
                {track.title}
              </MarqueeText>
            </Animated.View>
          ) : null}

          {playBox ? (
            <Animated.View
              pointerEvents={settledAtOne ? 'auto' : 'none'}
              style={[playBox, playStyle]}
            >
              <IconButton
                label={isPlaying ? 'Pause' : 'Play'}
                size={72}
                variant="soft"
                onPress={() => void toggle()}
              >
                {isPlaying ? (
                  <Pause size={30} color={theme.colors.text} fill={theme.colors.text} />
                ) : (
                  <Play size={30} color={theme.colors.text} fill={theme.colors.text} />
                )}
              </IconButton>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  expanded: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  strong: {
    fontWeight: '700',
  },
});
