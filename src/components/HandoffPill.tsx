import { usePathname } from 'expo-router';
import { Play } from '@/ui/icons';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { handoffCandidate } from '@/core/segue/handoff';
import type { SegueLastPlayback, SegueQueueItem } from '@/core/segue/types';
import { useBottomChromeInset } from '@/hooks/useBottomChromeInset';
import { usePlayerStore } from '@/stores/player';
import { useSegueStore } from '@/stores/segue';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

const MODAL_ROUTES = new Set(['/devices', '/queue', '/player', '/lyrics']);
const AUTO_HIDE_MS = 3_800;
const ENTER_MS = 260;
const EXIT_MS = 180;

type Phase = 'in' | 'out' | 'hidden';

/**
 * "Continue here" handoff pill. It only appears when another Segue device is
 * playing and this device has no queue, rises from the bottom chrome, and gets
 * out of the way after a few seconds or on the first tap/keypress elsewhere.
 */
export function HandoffPill() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const chromeInset = useBottomChromeInset();
  const status = useSegueStore((state) => state.status);
  const lastPlayback = useSegueStore((state) => state.lastPlayback);
  const devices = useSegueStore((state) => state.devices);
  const deviceId = useSegueStore((state) => state.deviceId);
  const localStatus = usePlayerStore((state) => state.status);
  const playerOpen = useUIStore((state) => state.playerOpen);

  const candidate =
    status === 'connected'
      ? handoffCandidate(lastPlayback, deviceId, { status: localStatus }, devices)
      : undefined;
  const track = candidate?.state.queue?.[candidate.state.index ?? 0];
  const modalOpen = MODAL_ROUTES.has(pathname) || playerOpen;

  if (!candidate || !track || modalOpen) return null;
  return (
    <HandoffPillContent
      key={`${candidate.deviceId}:${track.id}`}
      candidate={candidate}
      track={track}
      bottom={Math.max(chromeInset, insets.bottom) + 12}
    />
  );
}

function HandoffPillContent({
  candidate,
  track,
  bottom,
}: {
  candidate: SegueLastPlayback;
  track: SegueQueueItem;
  bottom: number;
}) {
  const theme = useTheme();
  const transferHere = useSegueStore((state) => state.transferHere);
  const [phase, setPhase] = useState<Phase>('in');
  const progress = useSharedValue(0);
  const dismiss = useCallback(() => {
    setPhase((current) => (current === 'in' ? 'out' : current));
  }, []);

  useEffect(() => {
    const timer = setTimeout(dismiss, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [dismiss]);

  // Any touch outside the pill dismisses it. The root layout turns native
  // touches into this counter; web also gets mouse/keyboard events here.
  useEffect(() => {
    let last = useUIStore.getState().handoffDismissRequest;
    const unsubscribe = useUIStore.subscribe((state) => {
      if (state.handoffDismissRequest !== last) {
        last = state.handoffDismissRequest;
        dismiss();
      }
    });
    return unsubscribe;
  }, [dismiss]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const pointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('#handoff-pill')) return;
      dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [dismiss]);

  useEffect(() => {
    const duration = theme.reduceMotion ? 0 : phase === 'in' ? ENTER_MS : EXIT_MS;
    progress.set(
      withTiming(phase === 'in' ? 1 : 0, { duration }, (finished) => {
        'worklet';
        if (finished && phase === 'out') runOnJS(setPhase)('hidden');
      }),
    );
  }, [phase, progress, theme.reduceMotion]);

  const animated = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: value,
      transform: [
        { translateY: (1 - value) * (theme.reduceMotion ? 0 : 28) },
        { scale: theme.reduceMotion ? 1 : 0.96 + value * 0.04 },
      ],
    };
  });

  if (phase === 'hidden') return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { bottom }, animated]}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Continue playback from ${candidate.deviceName}: ${track.title}`}
        onPress={() => {
          transferHere(candidate.deviceId || undefined);
          dismiss();
        }}
        nativeID="handoff-pill"
        containerStyle={styles.pillContainer}
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.elevated,
            borderColor: theme.colors.borderStrong,
            borderRadius: theme.radius.pill,
          },
        ]}
      >
        <View style={[styles.play, { backgroundColor: theme.colors.accent }]}>
          <Play size={15} color="#fff" fill="#fff" />
        </View>
        <View style={styles.text}>
          <Text variant="callout" style={styles.title} numberOfLines={1}>
            Continue here
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {track.title} · {candidate.deviceName}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  pillContainer: {
    maxWidth: '92%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingLeft: 9,
    paddingRight: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  play: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 300,
  },
  title: {
    fontWeight: '700',
  },
});
