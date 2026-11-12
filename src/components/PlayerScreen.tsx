import { useFocusEffect, useRouter } from 'expo-router';
import {
  Cast,
  ChevronDown,
  ChevronUp,
  Disc3,
  Heart,
  ListMusic,
  ListPlus,
  ListStart,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  User,
} from '@/ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { BackHandler, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@/core/models';
import { FAVOURITES_COLLECTION } from '@/core/offline';
import { star } from '@/core/subsonic/client';
import { buildCoverUrl } from '@/core/subsonic/params';
import { QueuePanel } from '@/components/QueuePanel';
import { queryKeys } from '@/core/queryKeys';
import { useAuthStore } from '@/stores/auth';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { isOfflineNow, useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { useSettingsStore } from '@/stores/settings';
import { paletteCoverUrl } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';
import { AddToPlaylistSheet } from '@/components/AddToPlaylistSheet';
import { MarqueeText } from '@/components/MarqueeText';
import { PlaybackProgress } from '@/components/PlaybackProgress';
import { PlayerBackdrop } from '@/components/PlayerBackdrop';
import { ActionSheet, type ActionSheetItem } from '@/ui/ActionSheet';
import { Artwork } from '@/ui/Artwork';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';
import { useTrashAction } from '@/hooks/useTrashAction';
import { useCoverSwipe } from './useCoverSwipe';


const QUEUE_SPRING = motion.sheetSpring;

export interface SharedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SharedPart = 'art' | 'title' | 'play';

export const PlayerScreen = memo(function PlayerScreen({
  onClose,
  onOpenLibrary,
  active = true,
  hideShared = false,
  reducedEffects = false,
  onSharedRect,
  onQueueOpenChange,
  queueProgress,
}: {
  onClose: () => void;
  onOpenLibrary?: (href: string) => void;
  active?: boolean;
  hideShared?: boolean;
  reducedEffects?: boolean;
  onSharedRect?: (part: SharedPart, rect: SharedRect) => void;
  onQueueOpenChange?: (open: boolean) => void;
  /** 0 = queue sheet down, 1 = up. Shared with PlayerSheet's overlay. */
  queueProgress?: SharedValue<number>;
}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const split = wide || (width > height && width >= 620);
  const track = useCurrentTrack();
  const server = useAuthStore((state) => state.server);
  const offline = useEffectiveOffline();
  const status = usePlayerStore((state) => state.status);
  const repeat = usePlayerStore((state) => state.queueState.repeat);
  const shuffle = usePlayerStore((state) => state.queueState.shuffle);
  const queueIndex = usePlayerStore((state) => state.queueState.index);
  const toggle = usePlayerStore((state) => state.toggle);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const castTarget = usePlayerStore((state) => state.castTarget);
  const showCodec = useSettingsStore((state) => state.showCodecBadge);
  const trash = useTrashAction();
  const [moreOpen, setMoreOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueMounted, setQueueMounted] = useState(false);
  const [queueAlignToken, setQueueAlignToken] = useState(0);
  const queueSheetRef = useRef<ComponentRef<typeof View>>(null);
  const [paletteGrace, setPaletteGrace] = useState<{ cover?: string; over: boolean }>({
    over: false,
  });
  const sheetHeight = Math.max(320, height - insets.top - 16);

  // Hold the old backdrop until the palette for this cover is applied, so the
  // blurred image and the bottom gradient swap in the same frame.
  const paletteUrl =
    track?.coverArt && server ? paletteCoverUrl(server, track.coverArt) : undefined;
  const paletteMatches = !track?.coverArt || theme.artworkUrl === paletteUrl;
  const paletteGraceOver = paletteGrace.over && paletteGrace.cover === track?.coverArt;
  const setArtworkFromUrl = theme.setArtworkFromUrl;
  useEffect(() => {
    // Another screen (album/artist) may own the palette while the player is
    // parked. Re-assert the playing track's palette when it opens.
    if (!active || !paletteUrl) return;
    setArtworkFromUrl(paletteUrl);
  }, [active, paletteUrl, setArtworkFromUrl]);
  useEffect(() => {
    const cover = track?.coverArt;
    if (!cover) return;
    // Safety net for a slow or failed extraction: never freeze the backdrop.
    const timer = setTimeout(() => setPaletteGrace({ cover, over: true }), 1200);
    return () => clearTimeout(timer);
  }, [track?.coverArt]);

  const ownQueueProgress = useSharedValue(0);
  const queueP = queueProgress ?? ownQueueProgress;
  const artSize = split
    ? Math.max(120, Math.min(height * 0.6, wide ? 440 : width * 0.34))
    : Math.min(width - 56, 360);
  const { gesture: coverGesture, swipeX: coverX, swiped: coverSwiped } = useCoverSwipe({
    distance: width,
    coverSize: artSize,
    enabled: !hideShared,
  });
  const artRef = useRef<React.ComponentRef<typeof View>>(null);
  const titleRef = useRef<React.ComponentRef<typeof View>>(null);
  const playRef = useRef<React.ComponentRef<typeof View>>(null);

  const reportRect = useCallback(
    (part: SharedPart, ref: React.RefObject<React.ComponentRef<typeof View> | null>) => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) onSharedRect?.(part, { x, y, width, height });
      });
    },
    [onSharedRect],
  );
  // Closing the player resets the queue sheet so the next open starts clean.
  const close = useCallback(() => {
    setQueueOpen(false);
    setQueueMounted(false);
    queueP.set(0);
    onClose();
  }, [onClose, queueP]);
  const openLyrics = useCallback(() => {
    if (coverSwiped) return;
    router.push('/lyrics');
  }, [coverSwiped, router]);
  const openLibrary = useCallback(
    (href: string) => {
      setQueueOpen(false);
      setQueueMounted(false);
      queueP.set(0);
      if (onOpenLibrary) onOpenLibrary(href);
      else router.push(href as never);
    },
    [onOpenLibrary, queueP, router],
  );

  useEffect(() => {
    onQueueOpenChange?.(queueOpen);
  }, [onQueueOpenChange, queueOpen]);

  // The panel stays mounted after the first use. On web, `inert` keeps its
  // off-screen controls out of the tab order while the sheet is down.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = queueSheetRef.current as unknown as HTMLElement | null;
    if (!node) return;
    if (queueOpen) node.removeAttribute('inert');
    else node.setAttribute('inert', '');
  }, [queueMounted, queueOpen]);

  // Button and swipe use the same spring; swipes hand over finger velocity.
  // The panel mounts on touch-down so the first open does not mount it while
  // the spring is already running, and the token aligns it before it moves.
  const mountQueue = useCallback(() => setQueueMounted(true), []);
  const prepareQueue = useCallback(() => {
    setQueueMounted(true);
    setQueueAlignToken((token) => token + 1);
  }, []);
  const openQueueSheet = useCallback(() => {
    prepareQueue();
    setQueueOpen(true);
    queueP.set(withSpring(1, QUEUE_SPRING));
  }, [prepareQueue, queueP]);

  const closeQueueSheet = useCallback(() => {
    setQueueOpen(false);
    queueP.set(withSpring(0, QUEUE_SPRING));
  }, [queueP]);

  // Web Escape closes the More/queue sheets first, then the player itself.
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (moreOpen) {
        setMoreOpen(false);
      } else if (queueOpen) {
        closeQueueSheet();
      } else {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close, closeQueueSheet, moreOpen, queueOpen]);

  // Android back gesture / hardware back closes the queue sheet instead of
  // popping the player route (which used to look like the player minimised).
  useFocusEffect(
    useCallback(() => {
      if (!queueOpen || Platform.OS !== 'android') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        closeQueueSheet();
        return true;
      });
      return () => subscription.remove();
    }, [closeQueueSheet, queueOpen]),
  );

  // With no sheet open, Android back closes the player overlay/route.
  useFocusEffect(
    useCallback(() => {
      if (!active || Platform.OS !== 'android' || queueOpen || moreOpen) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => subscription.remove();
    }, [active, close, moreOpen, queueOpen]),
  );

  const sheetDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onUpdate((event) => {
          queueP.set(1 - Math.max(0, Math.min(sheetHeight, event.translationY)) / sheetHeight);
        })
        .onEnd((event) => {
          const shouldClose = queueP.get() < 0.78 || event.velocityY > 650;
          runOnJS(setQueueOpen)(!shouldClose);
          queueP.set(
            withSpring(shouldClose ? 0 : 1, {
              ...QUEUE_SPRING,
              velocity: -event.velocityY / sheetHeight,
            }),
          );
        }),
    [queueP, sheetHeight],
  );

  const queueGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          // Touch-down on the handle: mount and align the panel before the
          // sheet moves.
          runOnJS(prepareQueue)();
        })
        .onUpdate((event) => {
          queueP.set(Math.max(0, Math.min(1, -event.translationY / sheetHeight)));
        })
        .onEnd((event) => {
          const shouldOpen = queueP.get() > 0.28 || event.velocityY < -600;
          runOnJS(setQueueOpen)(shouldOpen);
          queueP.set(
            withSpring(shouldOpen ? 1 : 0, {
              ...QUEUE_SPRING,
              velocity: -event.velocityY / sheetHeight,
            }),
          );
        }),
    [prepareQueue, queueP, sheetHeight],
  );

  // With the morph overlay in charge, the real shared elements stay mounted
  // (image decoded, layout measured) and only become visible while the queue
  // sheet is up, in the same frame the overlay hides.
  const coverStyle = useAnimatedStyle(() => ({
    opacity: hideShared ? (queueP.get() > 0.001 ? 1 : 0) : 1,
    transform: [{ translateX: coverX.get() }],
  }));
  const sharedStyle = useAnimatedStyle(() => ({
    opacity: hideShared ? (queueP.get() > 0.001 ? 1 : 0) : 1,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - queueP.get()) * sheetHeight }],
  }));

  if (!track) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.colors.background }]}>
        <EmptyState title="Nothing playing" message="Pick an album or a track to start." />
        <IconButton label="Close player" size={44} variant="soft" onPress={close}>
          <ChevronDown size={22} color={theme.colors.text} />
        </IconButton>
      </View>
    );
  }

  const isPlaying = status === 'playing';
  const coverUrl = track.coverArt && server ? buildCoverUrl(server, track.coverArt, 900) : undefined;
  const codec = [track.suffix?.toUpperCase(), track.bitRate ? `${track.bitRate} kbps` : null]
    .filter(Boolean)
    .join(' · ');
  const moreItems: ActionSheetItem[] = [
    {
      label: 'Add to next',
      icon: <ListStart size={18} color={theme.colors.textSecondary} />,
      onPress: () => {
        addToQueue([track], 'next');
        setMoreOpen(false);
      },
    },
    {
      label: 'Add to queue',
      icon: <ListPlus size={18} color={theme.colors.textSecondary} />,
      onPress: () => {
        addToQueue([track], 'end');
        setMoreOpen(false);
      },
    },
    ...(offline
      ? []
      : [
          {
            label: 'Add to playlist',
            icon: <ListMusic size={18} color={theme.colors.textSecondary} />,
            onPress: () => {
              setMoreOpen(false);
              setPlaylistOpen(true);
            },
          },
        ]),
    ...(track.albumId
      ? [
          {
            label: 'Open album',
            icon: <Disc3 size={18} color={theme.colors.textSecondary} />,
            onPress: () => {
              setMoreOpen(false);
              openLibrary(`/(main)/album/${track.albumId}`);
            },
          },
        ]
      : []),
    ...(track.artistId
      ? [
          {
            label: 'Open artist',
            icon: <User size={18} color={theme.colors.textSecondary} />,
            onPress: () => {
              setMoreOpen(false);
              openLibrary(`/(main)/artist/${track.artistId}`);
            },
          },
        ]
      : []),
    {
      label: 'Move to Trash',
      icon: <Trash2 size={18} color={theme.colors.danger} />,
      onPress: () => {
        setMoreOpen(false);
        void trash(queueIndex);
      },
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {!reducedEffects ? (
        <PlayerBackdrop
          uri={coverUrl}
          color={theme.colors.background}
          ready={paletteMatches || paletteGraceOver}
          visible={active}
          reduceMotion={theme.reduceMotion}
        />
      ) : null}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <IconButton label="Close player" size={42} variant="soft" onPress={close}>
          <ChevronDown size={22} color={theme.colors.text} />
        </IconButton>
        <View style={styles.topMeta}>
          <Text variant="label" tone="tertiary">
            Now playing
          </Text>
          {castTarget ? (
            <Text variant="caption" tone="accent" numberOfLines={1} style={styles.castLabel}>
              Casting to {castTarget.name}
            </Text>
          ) : showCodec && codec ? (
            <Text variant="caption" tone="tertiary">
              {codec}
            </Text>
          ) : null}
        </View>
        <View style={styles.topActions}>
          <FavouriteButton key={track.id} track={track} />
          <IconButton label="Devices" size={42} variant="soft" onPress={() => router.push('/devices')}>
            <Cast size={19} color={theme.colors.text} />
          </IconButton>
          <IconButton label="More options" size={42} variant="soft" onPress={() => setMoreOpen(true)}>
            <MoreHorizontal size={20} color={theme.colors.text} />
          </IconButton>
        </View>
      </View>

      <View
        style={[
          styles.content,
          split && styles.contentWide,
          split && !wide && styles.contentLandscape,
          { paddingBottom: split ? insets.bottom + 36 : insets.bottom + 64 },
        ]}
      >
        <GestureDetector gesture={coverGesture}>
          <Animated.View style={[styles.artWrap, split && styles.artWrapWide, coverStyle]}>
            <View
              ref={artRef}
              collapsable={false}
              onLayout={() => reportRect('art', artRef)}
              aria-hidden={hideShared}
              accessibilityElementsHidden={hideShared}
              importantForAccessibility={hideShared ? 'no-hide-descendants' : 'auto'}
            >
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Album cover: tap for lyrics, swipe left or right for previous or next"
                onPress={openLyrics}
                haptic={false}
              >
                <Artwork
                  key={track.id}
                  coverArt={track.coverArt}
                  size={artSize}
                  radius={hideShared ? 10 : wide ? 18 : 14}
                />
              </PressableScale>
            </View>
          </Animated.View>
        </GestureDetector>

        <View style={[styles.info, split && styles.infoWide]}>
          <View style={styles.titleBlock}>
            <Animated.View
              ref={titleRef}
              collapsable={false}
              onLayout={() => reportRect('title', titleRef)}
              style={sharedStyle}
            >
              <MarqueeText variant={wide ? 'display' : 'title'} paused={hideShared && !queueOpen}>
                {track.title}
              </MarqueeText>
            </Animated.View>
            <Text variant="body" tone="secondary" numberOfLines={1}>
              {track.artist ?? 'Unknown artist'}
            </Text>
            {track.album ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {track.album}
              </Text>
            ) : null}
          </View>

          <View style={styles.progressBlock}>
            <PlaybackProgress label="Playback position" height={5} showThumb showTimes />
          </View>

          <View style={styles.controls}>
            <IconButton label="Shuffle" size={42} selected={shuffle} onPress={toggleShuffle}>
              <Shuffle size={18} color={shuffle ? theme.colors.accent : theme.colors.textSecondary} />
            </IconButton>
            <IconButton label="Previous track" size={46} onPress={() => void previous()}>
              <SkipBack size={24} color={theme.colors.text} fill={theme.colors.text} />
            </IconButton>
            <Animated.View
              ref={playRef}
              collapsable={false}
              onLayout={() => reportRect('play', playRef)}
              style={sharedStyle}
              aria-hidden={hideShared}
              accessibilityElementsHidden={hideShared}
              importantForAccessibility={hideShared ? 'no-hide-descendants' : 'auto'}
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
            <IconButton label="Next track" size={46} onPress={() => void next()}>
              <SkipForward size={24} color={theme.colors.text} fill={theme.colors.text} />
            </IconButton>
            <IconButton label="Repeat mode" size={42} selected={repeat !== 'off'} onPress={cycleRepeat}>
              {repeat === 'one' ? (
                <Repeat1 size={18} color={theme.colors.accent} />
              ) : (
                <Repeat
                  size={18}
                  color={repeat === 'all' ? theme.colors.accent : theme.colors.textSecondary}
                />
              )}
            </IconButton>
          </View>

        </View>
      </View>

      {/* Mounted on touch-down of the queue handle, not when the player
          settles: mounting at the end of the morph cost the open 150-250 ms
          frames. Once touched it stays mounted, so later opens are warm. */}
      {queueOpen || queueMounted ? (
        <Animated.View
          ref={queueSheetRef}
          testID="queue-sheet"
          pointerEvents={queueOpen ? 'auto' : 'none'}
          aria-hidden={!queueOpen}
          accessibilityElementsHidden={!queueOpen}
          importantForAccessibility={queueOpen ? 'auto' : 'no-hide-descendants'}
          style={[
            styles.queueSheet,
            {
              height: sheetHeight,
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={sheetDragGesture}>
            <View style={styles.sheetGrabberWrap}>
              <View style={[styles.sheetGrabber, { backgroundColor: theme.colors.textTertiary }]} />
            </View>
          </GestureDetector>
          <QueuePanel
            onClose={closeQueueSheet}
            topPadding={4}
            alignToken={queueAlignToken}
          />
        </Animated.View>
      ) : null}

      <GestureDetector gesture={queueGesture}>
        <Animated.View style={[styles.queueHandleWrap, { bottom: insets.bottom + 8 }]}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Open queue"
            onPressIn={mountQueue}
            onPress={openQueueSheet}
            haptic={false}
          >
            <View
              style={[
                styles.queueHandle,
                {
                  backgroundColor: theme.colors.elevated,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <ChevronUp size={15} color={theme.colors.textSecondary} />
              <Text variant="caption" tone="secondary">
                Queue
              </Text>
            </View>
          </PressableScale>
        </Animated.View>
      </GestureDetector>

      <ActionSheet
        visible={moreOpen}
        title={track.title}
        items={moreItems}
        onClose={() => setMoreOpen(false)}
      />
      {playlistOpen ? (
        <AddToPlaylistSheet tracks={[track]} onClose={() => setPlaylistOpen(false)} />
      ) : null}
    </View>
  );
});

function FavouriteButton({ track }: { track: Track }) {
  const theme = useTheme();
  const server = useAuthStore((state) => state.server);
  const queryClient = useQueryClient();
  const [favourite, setFavourite] = useState(Boolean(track.starred));

  const toggle = async () => {
    if (!server) return;
    const next = !favourite;
    setFavourite(next);
    try {
      await star(server, track.id, { remove: !next });
      await queryClient.invalidateQueries({ queryKey: queryKeys.starred(server) });
      const offline = useOfflineStore.getState();
      if (offline.index.collections[FAVOURITES_COLLECTION.id]) {
        if (next && !isOfflineNow()) {
          offline.downloadTracks([track], FAVOURITES_COLLECTION, { append: true });
        } else if (!next) {
          await offline.removeCollectionTrack(FAVOURITES_COLLECTION.id, track.id);
        }
      }
    } catch {
      setFavourite(!next);
    }
  };

  return (
    <IconButton
      label={favourite ? 'Remove from favourites' : 'Add to favourites'}
      size={42}
      selected={favourite}
      onPress={() => void toggle()}
    >
      <Heart
        size={19}
        color={favourite ? theme.colors.accent : theme.colors.text}
        fill={favourite ? theme.colors.accent : 'transparent'}
      />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topMeta: {
    alignItems: 'center',
    gap: 2,
    maxWidth: 220,
  },
  castLabel: {
    maxWidth: 220,
    textAlign: 'center',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  queueSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetGrabberWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  sheetGrabber: {
    width: 44,
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
  queueHandleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  queueHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
    gap: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 64,
    paddingHorizontal: 64,
  },
  contentLandscape: {
    gap: 28,
    paddingHorizontal: 32,
    paddingTop: 0,
  },
  artWrap: {
    alignItems: 'center',
  },
  artWrapWide: {},
  info: {
    width: '100%',
    maxWidth: 460,
    gap: 18,
  },
  infoWide: {
    flex: 1,
    maxWidth: 520,
  },
  titleBlock: {
    gap: 4,
  },
  progressBlock: {
    gap: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
});
