import { Redirect, Slot } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { runOnJS, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HandoffPill } from '@/components/HandoffPill';
import { BottomTabs, Rail } from '@/components/Navigation';
import { NowPlayingBar } from '@/components/NowPlayingBar';
import { PlayerSheet, type PlayerOrigin } from '@/components/PlayerSheet';
import { RouteFocus } from '@/components/RouteFocus';
import { SkipLink } from '@/components/SkipLink';
import { isServerUsable, useAuthStore } from '@/stores/auth';
import { useCurrentTrack } from '@/stores/player';
import { useSettingsStore } from '@/stores/settings';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { chromeRadii, motion } from '@/theme/tokens';
import { Text } from '@/ui/Text';

type SizeClass = 'compact' | 'medium' | 'expanded';

function sizeClass(width: number): SizeClass {
  if (width < 600) return 'compact';
  if (width < 900) return 'medium';
  return 'expanded';
}

export default function MainLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const size = sizeClass(width);
  const server = useAuthStore((state) => state.server);
  const chromeRadius = useSettingsStore((state) => state.chromeRadius);
  const track = useCurrentTrack();
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());
  const playerOpen = useUIStore((state) => state.playerOpen);
  const setPlayerOpen = useUIStore((state) => state.setPlayerOpen);
  const closeRequest = useUIStore((state) => state.closePlayerRequest);
  const toggleRequest = useUIStore((state) => state.togglePlayerRequest);
  const playerProgress = useSharedValue(0);

  const openPlayer = useCallback(() => {
    setPlayerOpen(true);
    playerProgress.set(withSpring(1, motion.playerSpring));
  }, [playerProgress, setPlayerOpen]);

  // Drag release: NowPlayingBar already started the spring with velocity.
  const settlePlayer = useCallback(
    (open: boolean) => {
      setPlayerOpen(open);
    },
    [setPlayerOpen],
  );

  // React state flips when the spring lands, not when it starts: re-rendering
  // the layout and player on the first frame of the close made it stutter.
  // A re-open mid-close cancels the spring (finished = false), so no flip.
  const closePlayer = useCallback(() => {
    playerProgress.set(
      withSpring(0, motion.playerSpring, (finished) => {
        'worklet';
        if (finished) runOnJS(setPlayerOpen)(false);
      }),
    );
  }, [playerProgress, setPlayerOpen]);

  // Keyboard Escape asks for a close without reaching into the spring, which
  // lives here. Ignore a stale request after the player is already closed.
  const lastCloseRequest = useRef(closeRequest);
  useEffect(() => {
    if (closeRequest === lastCloseRequest.current) return;
    lastCloseRequest.current = closeRequest;
    if (playerOpen) closePlayer();
  }, [closeRequest, closePlayer, playerOpen]);

  // `F` maximises or minimises the player through the same spring.
  const lastToggleRequest = useRef(toggleRequest);
  useEffect(() => {
    if (toggleRequest === lastToggleRequest.current) return;
    lastToggleRequest.current = toggleRequest;
    if (!track) return;
    if (playerOpen) closePlayer();
    else openPlayer();
  }, [closePlayer, openPlayer, playerOpen, toggleRequest, track]);

  // Re-park on a window resize while closed. Not on playerOpen changes: that
  // would cancel the closing spring and snap the player shut.
  const lastHeight = useRef(height);
  useEffect(() => {
    if (lastHeight.current === height) return;
    lastHeight.current = height;
    if (!playerOpen) playerProgress.set(0);
  }, [height, playerOpen, playerProgress]);

  useEffect(() => {
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.textSecondary} />
        <Text variant="caption" tone="tertiary" style={styles.loadingText}>
          Opening your library…
        </Text>
      </View>
    );
  }

  if (!server) return <Redirect href="/login" />;
  if (!isServerUsable(server)) return <Redirect href="/login?reconnect=1" />;

  const hasTrack = Boolean(track);
  const compactBottom = Math.max(insets.bottom, 10) + 62;
  const railWidth = size === 'compact' ? 0 : 76;
  const mainWidth = width - railWidth;
  const maxPillWidth = size === 'expanded' ? 720 : 520;
  const pillWidth = Math.min(mainWidth - 20, maxPillWidth);
  const pillLeft = railWidth + 10 + (mainWidth - 20 - pillWidth) / 2;
  const expandedPillHeight = 72;
  const playerOrigin: PlayerOrigin =
    size === 'expanded'
      ? {
          top: height - Math.max(insets.bottom, 10) - 10 - expandedPillHeight,
          left: pillLeft,
          right: width - pillLeft - pillWidth,
          height: expandedPillHeight,
          radius: chromeRadii[chromeRadius],
        }
      : size === 'compact'
        ? {
            top: height - compactBottom - 10 - 60,
            left: pillLeft,
            right: width - pillLeft - pillWidth,
            height: 60,
            radius: chromeRadii[chromeRadius],
          }
        : {
            top: height - Math.max(insets.bottom, 10) - 10 - 60,
            left: pillLeft,
            right: width - pillLeft - pillWidth,
            height: 60,
            radius: chromeRadii[chromeRadius],
          };
  const playerStartY = playerOrigin.top + playerOrigin.height / 2;

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      onTouchStart={() => useUIStore.getState().requestHandoffDismiss()}
    >
      <SkipLink />
      <RouteFocus />
      <View
        style={styles.row}
        accessibilityElementsHidden={playerOpen}
        importantForAccessibility={playerOpen ? 'no-hide-descendants' : 'auto'}
      >
        {size !== 'compact' ? <Rail /> : null}

        <View style={styles.main}>
          <View
            style={styles.content}
            nativeID="main-content"
            role="main"
            tabIndex={Platform.OS === 'web' ? -1 : undefined}
          >
            <Slot />
          </View>

          {size !== 'compact' && hasTrack ? (
            <NowPlayingBar
              compact
              large={size === 'expanded'}
              offsetBottom={Math.max(insets.bottom, 10)}
              onOpenPlayer={openPlayer}
              onPlayerSettle={settlePlayer}
              onClosePlayer={closePlayer}
              playerProgress={playerProgress}
              playerHeight={height}
              playerStartY={playerStartY}
            />
          ) : null}
          {size === 'compact' && hasTrack ? (
            <NowPlayingBar
              compact
              offsetBottom={compactBottom}
              onOpenPlayer={openPlayer}
              onPlayerSettle={settlePlayer}
              onClosePlayer={closePlayer}
              playerProgress={playerProgress}
              playerHeight={height}
              playerStartY={playerStartY}
            />
          ) : null}
        </View>
      </View>

      {size === 'compact' ? <BottomTabs /> : null}
      {hasTrack ? (
        <PlayerSheet
          progress={playerProgress}
          origin={playerOrigin}
          open={playerOpen}
          onClose={closePlayer}
        />
      ) : null}
      <HandoffPill />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    marginTop: 4,
  },
});
