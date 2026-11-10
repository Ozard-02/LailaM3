import { useRouter } from 'expo-router';
import {
  Cast,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from '@/ui/icons';
import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { CompactPlaybackProgress, PlaybackProgress } from '@/components/PlaybackProgress';
import { MarqueeText } from '@/components/MarqueeText';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';
import { chromeRadii, motion } from '@/theme/tokens';

export interface NowPlayingBarProps {
  compact?: boolean;
  large?: boolean;
  offsetBottom?: number;
  onOpenPlayer?: () => void;
  /** Drag released: the spring is already running; only sync React state. */
  onPlayerSettle?: (open: boolean) => void;
  onClosePlayer?: () => void;
  playerProgress?: SharedValue<number>;
  playerHeight?: number;
  playerStartY?: number;
}

export function NowPlayingBar({
  compact = false,
  large = false,
  offsetBottom = 0,
  onOpenPlayer,
  onPlayerSettle,
  onClosePlayer,
  playerProgress,
  playerHeight,
  playerStartY,
}: NowPlayingBarProps) {
  const theme = useTheme();
  const router = useRouter();
  const chromeRadius = useSettingsStore((state) => state.chromeRadius);
  const track = useCurrentTrack();
  const status = usePlayerStore((state) => state.status);
  const repeat = usePlayerStore((state) => state.queueState.repeat);
  const shuffle = usePlayerStore((state) => state.queueState.shuffle);
  const toggle = usePlayerStore((state) => state.toggle);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const queueCount = usePlayerStore((state) => state.queueState.queue.length);
  const pause = usePlayerStore((state) => state.pause);
  const hidden = useUIStore((state) => state.miniPlayerHidden);
  const setHidden = useUIStore((state) => state.setMiniPlayerHidden);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const playerDragStarted = useSharedValue(false);
  const openPlayer = useCallback(() => {
    if (onOpenPlayer) {
      onOpenPlayer();
      return;
    }
    router.push('/player');
  }, [onOpenPlayer, router]);

  const hideAndPause = useCallback(() => {
    setHidden(true);
    void pause();
  }, [pause, setHidden]);

  const horizontalSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
          translateX.set(Math.max(-120, Math.min(120, event.translationX)));
        })
        .onEnd((event) => {
          if (Math.abs(translateX.get()) > 58 || Math.abs(event.velocityX) > 650) {
            if (translateX.get() < 0) runOnJS(next)();
            else runOnJS(previous)();
          }
          translateX.set(withSpring(0, { ...motion.releaseSpring, velocity: event.velocityX }));
        }),
    [next, previous, translateX],
  );

  const verticalSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-12, 12])
        .onStart(() => {
          playerDragStarted.set(false);
        })
        .onUpdate((event) => {
          if (playerProgress && playerHeight) {
            // Drive the player only once the finger has actually moved up, so
            // a downward swipe to hide the pill does not flash it. No JS call
            // here: React work at drag start shows up as a hitch.
            if (event.translationY < 0 && !playerDragStarted.get()) {
              playerDragStarted.set(true);
            }
            if (playerDragStarted.get()) {
              // Progress is the finger distance towards the top of the screen.
              playerProgress.set(
                Math.max(
                  0,
                  Math.min(1, -event.translationY / Math.max(1, playerStartY ?? playerHeight)),
                ),
              );
            } else if (event.translationY > 0) {
              translateY.set(Math.max(-120, Math.min(120, event.translationY)));
            }
          } else {
            translateY.set(Math.max(-120, Math.min(120, event.translationY)));
          }
        })
        .onEnd((event) => {
          if (playerProgress && playerHeight) {
            const shouldOpen = playerProgress.get() > 0.25 || event.velocityY < -600;
            if (onPlayerSettle && playerDragStarted.get()) {
              // Start the spring here, on the UI thread, carrying the finger's
              // velocity, so release is continuous with the drag.
              playerProgress.set(
                withSpring(shouldOpen ? 1 : 0, {
                  ...motion.playerSpring,
                  velocity: -event.velocityY / Math.max(1, playerStartY ?? playerHeight),
                }),
              );
              runOnJS(onPlayerSettle)(shouldOpen);
            } else if (shouldOpen) {
              runOnJS(openPlayer)();
            } else if (playerDragStarted.get() && onClosePlayer) {
              runOnJS(onClosePlayer)();
            }
            if (!shouldOpen) {
              if (translateY.get() > 42 || event.velocityY > 550) {
                runOnJS(hideAndPause)();
              }
            }
          } else if (translateY.get() < -42 || event.velocityY < -550) {
            runOnJS(openPlayer)();
          } else if (translateY.get() > 42 || event.velocityY > 550) {
            runOnJS(hideAndPause)();
          }
          translateY.set(withSpring(0, { ...motion.releaseSpring, velocity: event.velocityY }));
        }),
    [
      hideAndPause,
      onClosePlayer,
      onPlayerSettle,
      openPlayer,
      playerDragStarted,
      playerHeight,
      playerProgress,
      playerStartY,
      translateY,
    ],
  );

  // Race the axes instead of moving both: a horizontal intent must not make
  // the pill drift vertically while the swipe is in progress.
  const swipe = useMemo(
    () => Gesture.Race(horizontalSwipe, verticalSwipe),
    [horizontalSwipe, verticalSwipe],
  );

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }, { translateY: translateY.get() }],
  }));

  const compactFadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, (playerProgress?.get() ?? 0) * 8),
  }));

  useEffect(() => {
    if (status === 'playing' || status === 'loading') setHidden(false);
  }, [track?.id, status, setHidden]);

  if (!track) return null;
  if (compact && hidden) return null;

  const isPlaying = status === 'playing';

  if (compact) {
    const artSize = large ? 52 : 42;
    const playSize = large ? 46 : 40;
    const queueSize = large ? 40 : 38;
    const iconSize = large ? 22 : 20;
    return (
      <View style={[styles.compactWrap, { bottom: offsetBottom + 10 }]}>
        <GestureDetector gesture={swipe}>
          <Animated.View style={swipeStyle}>
            <View
              style={[
                styles.compact,
                large && styles.compactLarge,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                  borderRadius: chromeRadii[chromeRadius],
                },
              ]}
            >
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Now playing: ${track.title}. Tap for player, swipe left or right for previous or next, swipe down to stop`}
                onPress={openPlayer}
                containerStyle={styles.compactMain}
                style={styles.compactMainInner}
              >
                <Animated.View style={compactFadeStyle}>
                  <Artwork coverArt={track.coverArt} size={artSize} radius={large ? 12 : 10} />
                </Animated.View>
                <Animated.View style={[styles.compactText, compactFadeStyle]}>
                  <MarqueeText variant={large ? 'headline' : 'callout'} style={styles.strong}>
                    {track.title}
                  </MarqueeText>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {track.artist ?? 'Unknown artist'}
                  </Text>
                </Animated.View>
              </PressableScale>
              <Animated.View style={compactFadeStyle}>
                <IconButton
                  label={isPlaying ? 'Pause' : 'Play'}
                  size={playSize}
                  onPress={() => void toggle()}
                >
                  {isPlaying ? (
                    <Pause size={iconSize} color={theme.colors.text} fill={theme.colors.text} />
                  ) : (
                    <Play size={iconSize} color={theme.colors.text} fill={theme.colors.text} />
                  )}
                </IconButton>
              </Animated.View>
              <IconButton
                label={`Open queue (${queueCount} tracks)`}
                size={queueSize}
                onPress={() => router.push('/queue')}
              >
                <ListMusic size={iconSize - 2} color={theme.colors.textSecondary} />
              </IconButton>
              <CompactPlaybackProgress />
            </View>
            <View style={[styles.grabber, { backgroundColor: theme.colors.textTertiary }]} />
          </Animated.View>
        </GestureDetector>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${track.title}. Tap for player, swipe left or right for previous or next, swipe down to stop`}
        onPress={openPlayer}
        style={styles.now}
      >
        <Artwork coverArt={track.coverArt} size={56} radius={10} />
        <View style={styles.nowText}>
          <MarqueeText variant="headline">
            {track.title}
          </MarqueeText>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {track.artist ?? 'Unknown artist'}
            {track.album ? ` — ${track.album}` : ''}
          </Text>
        </View>
      </PressableScale>

      <View style={styles.center}>
        <View style={styles.controls}>
          <IconButton label="Shuffle" size={36} selected={shuffle} onPress={toggleShuffle}>
            <Shuffle
              size={16}
              color={shuffle ? theme.colors.accent : theme.colors.textSecondary}
            />
          </IconButton>
          <IconButton label="Previous track" size={36} onPress={() => void previous()}>
            <SkipBack size={18} color={theme.colors.text} fill={theme.colors.text} />
          </IconButton>
          <IconButton
            label={isPlaying ? 'Pause' : 'Play'}
            size={44}
            variant="soft"
            onPress={() => void toggle()}
          >
            {isPlaying ? (
              <Pause size={20} color={theme.colors.text} fill={theme.colors.text} />
            ) : (
              <Play size={20} color={theme.colors.text} fill={theme.colors.text} />
            )}
          </IconButton>
          <IconButton label="Next track" size={36} onPress={() => void next()}>
            <SkipForward size={18} color={theme.colors.text} fill={theme.colors.text} />
          </IconButton>
          <IconButton label="Repeat mode" size={36} selected={repeat !== 'off'} onPress={cycleRepeat}>
            {repeat === 'one' ? (
              <Repeat1 size={16} color={theme.colors.accent} />
            ) : (
              <Repeat size={16} color={repeat === 'all' ? theme.colors.accent : theme.colors.textSecondary} />
            )}
          </IconButton>
        </View>
        <PlaybackProgress label="Playback position" layout="inline" />
      </View>

      <View style={styles.right}>
        <IconButton label="Devices" size={40} onPress={() => router.push('/devices')}>
          <Cast size={19} color={theme.colors.textSecondary} />
        </IconButton>
        <IconButton label={`Open queue (${queueCount} tracks)`} size={40} onPress={() => router.push('/queue')}>
          <ListMusic size={19} color={theme.colors.textSecondary} />
        </IconButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 20,
  },
  grabber: {
    position: 'absolute',
    top: 3,
    left: '50%',
    marginLeft: -14,
    width: 28,
    height: 3,
    borderRadius: 2,
    opacity: 0.45,
  },
  compact: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    paddingRight: 4,
    borderWidth: 1,
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
  compactLarge: {
    maxWidth: 720,
    gap: 12,
    padding: 10,
    paddingRight: 4,
  },
  compactMain: {
    flex: 1,
    minWidth: 0,
  },
  compactMainInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactText: {
    flex: 1,
    minWidth: 0,
  },
  strong: {
    fontWeight: '700',
  },
  bar: {
    height: 88,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 18,
  },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: 280,
  },
  nowText: {
    flex: 1,
    minWidth: 0,
  },
  center: {
    flex: 1,
    maxWidth: 560,
    gap: 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 120,
    gap: 4,
  },
});
