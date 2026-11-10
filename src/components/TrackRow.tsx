import {
  Download,
  ListPlus,
  ListStart,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
} from '@/ui/icons';
import { useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { Track } from '@/core/models';
import { currentTrack } from '@/core/queue/reducer';
import { useOfflineStore } from '@/stores/offline';
import { usePlayerStore } from '@/stores/player';
import { useSettingsStore, type SwipeAction } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';
import { formatTime } from '@/utils/format';
import { selectFeedback } from '@/utils/haptics';
import { useSwipeRow } from './useSwipeRow';

export interface TrackRowProps {
  track: Track;
  index?: number;
  showArtwork?: boolean;
  onPlay: () => void;
  onAddToPlaylist?: () => void;
  onMore?: () => void;
}

export function TrackRow({
  track,
  index,
  showArtwork = true,
  onPlay,
  onAddToPlaylist,
  onMore,
}: TrackRowProps) {
  const theme = useTheme();
  const isCurrent = usePlayerStore((state) => currentTrack(state.queueState)?.id === track.id);
  const isPlaying = usePlayerStore(
    (state) => currentTrack(state.queueState)?.id === track.id && state.status === 'playing',
  );
  const toggle = usePlayerStore((state) => state.toggle);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const downloadTracks = useOfflineStore((state) => state.downloadTracks);
  const swipeLeftAction = useSettingsStore((state) => state.swipeLeftAction);
  const swipeRightAction = useSettingsStore((state) => state.swipeRightAction);

  const triggerAction = useCallback(
    (action: SwipeAction) => {
      if (action === 'none') return;
      selectFeedback();
      if (action === 'playNext') addToQueue([track], 'next');
      else if (action === 'addToQueue') addToQueue([track], 'end');
      else if (action === 'download' && Platform.OS !== 'web') downloadTracks([track]);
    },
    [addToQueue, downloadTracks, track],
  );

  const swipeRight = useCallback(
    () => triggerAction(swipeRightAction),
    [swipeRightAction, triggerAction],
  );
  const swipeLeft = useCallback(
    () => triggerAction(swipeLeftAction),
    [swipeLeftAction, triggerAction],
  );

  const { gesture, contentStyle, leftOpacity, rightOpacity } = useSwipeRow({
    leftEnabled: swipeRightAction !== 'none',
    rightEnabled: swipeLeftAction !== 'none',
    onLeft: swipeRight,
    onRight: swipeLeft,
  });

  const leftConfig =
    swipeRightAction === 'playNext'
      ? { label: 'Add to next', icon: ListStart, color: theme.colors.accent }
      : swipeRightAction === 'addToQueue'
        ? { label: 'Queue', icon: ListPlus, color: theme.colors.accent }
        : swipeRightAction === 'download'
          ? { label: 'Download', icon: Download, color: theme.colors.warning }
          : null;

  const rightConfig =
    swipeLeftAction === 'playNext'
      ? { label: 'Add to next', icon: ListStart, color: theme.colors.accent }
      : swipeLeftAction === 'addToQueue'
        ? { label: 'Queue', icon: ListPlus, color: theme.colors.accent }
        : swipeLeftAction === 'download'
          ? { label: 'Download', icon: Download, color: theme.colors.warning }
          : null;

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.swipeContainer, { borderRadius: theme.radius.sm }]}>
        {leftConfig ? (
          <Animated.View
            style={[
              styles.action,
              styles.actionLeft,
              { backgroundColor: leftConfig.color },
              leftOpacity,
            ]}
          >
            <leftConfig.icon size={18} color="#fff" />
            <Text variant="caption" tone="inverse" style={styles.actionLabel}>
              {leftConfig.label}
            </Text>
          </Animated.View>
        ) : null}
        {rightConfig ? (
          <Animated.View
            style={[
              styles.action,
              styles.actionRight,
              { backgroundColor: rightConfig.color },
              rightOpacity,
            ]}
          >
            <Text variant="caption" tone="inverse" style={styles.actionLabel}>
              {rightConfig.label}
            </Text>
            <rightConfig.icon size={18} color="#fff" />
          </Animated.View>
        ) : null}

        <Animated.View
          style={[
            {
              backgroundColor: isCurrent ? theme.colors.accentSoft : theme.colors.background,
              borderRadius: theme.radius.sm,
            },
            contentStyle,
          ]}
        >
          <View style={styles.row}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} ${track.title} by ${track.artist ?? 'unknown artist'}`}
              onPress={() => {
                if (isCurrent) void toggle();
                else onPlay();
              }}
              haptic={false}
              containerStyle={styles.main}
              style={styles.mainInner}
            >
            {typeof index === 'number' ? (
              <View style={styles.index}>
                {isPlaying ? (
                  <View style={styles.bars}>
                    <View style={[styles.bar, { backgroundColor: theme.colors.accent, height: 10 }]} />
                    <View style={[styles.bar, { backgroundColor: theme.colors.accent, height: 16 }]} />
                    <View style={[styles.bar, { backgroundColor: theme.colors.accent, height: 6 }]} />
                  </View>
                ) : (
                  <Text variant="caption" tone={isCurrent ? 'accent' : 'tertiary'}>
                    {index + 1}
                  </Text>
                )}
              </View>
            ) : null}

            {showArtwork ? <Artwork coverArt={track.coverArt} size={42} radius={7} /> : null}

            <View style={styles.text}>
              <Text
                variant="callout"
                numberOfLines={1}
                tone={isCurrent ? 'accent' : 'primary'}
                style={styles.title}
              >
                {track.title}
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {[track.artist, track.album].filter(Boolean).join(' — ') || 'Unknown'}
                {track.suffix ? ` · ${track.suffix.toUpperCase()}` : ''}
              </Text>
            </View>

            <Text variant="caption" tone="tertiary" style={styles.duration}>
              {formatTime(track.duration)}
            </Text>

              <View style={styles.playState}>
                {isPlaying ? (
                  <Pause size={15} color={theme.colors.accent} fill={theme.colors.accent} />
                ) : (
                  <Play
                    size={15}
                    color={theme.colors.textTertiary}
                    fill={theme.colors.textTertiary}
                  />
                )}
              </View>
            </PressableScale>
            {onAddToPlaylist ? (
              <IconButton
                label={`Add ${track.title} to playlist`}
                size={34}
                onPress={onAddToPlaylist}
              >
                <Plus size={17} color={theme.colors.textTertiary} />
              </IconButton>
            ) : null}
            {onMore ? (
              <IconButton label={`More options for ${track.title}`} size={34} onPress={onMore}>
                <MoreHorizontal size={18} color={theme.colors.textTertiary} />
              </IconButton>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: 'hidden',
    marginBottom: 2,
  },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  actionLeft: {
    left: 0,
    right: 0,
    justifyContent: 'flex-start',
  },
  actionRight: {
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  actionLabel: {
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  mainInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  index: {
    width: 26,
    alignItems: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  bar: {
    width: 2,
    borderRadius: 1,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontWeight: '600',
  },
  duration: {
    width: 42,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  playState: {
    width: 22,
    alignItems: 'center',
  },
});
