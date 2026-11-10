import { StyleSheet, View } from 'react-native';
import { usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';
import { ProgressBar } from '@/ui/ProgressBar';
import { Text } from '@/ui/Text';
import { formatTime } from '@/utils/format';

export interface PlaybackProgressProps {
  label?: string;
  height?: number;
  showThumb?: boolean;
  showTimes?: boolean;
  /** `inline` puts current time and duration on the sides (desktop bar). */
  layout?: 'inline' | 'stacked';
}

/**
 * Small isolated subscriber: only this node re-renders on the 2 Hz position
 * updates, not the full player or the mini-player shell.
 */
export function PlaybackProgress({
  label = 'Playback position',
  height = 4,
  showThumb = false,
  showTimes = false,
  layout = 'stacked',
}: PlaybackProgressProps) {
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const seek = usePlayerStore((state) => state.seek);

  const bar = (
    <ProgressBar
      label={label}
      value={position}
      max={duration}
      height={height}
      showThumb={showThumb}
      onSeek={(value) => void seek(value)}
    />
  );

  if (!showTimes) return bar;

  if (layout === 'inline') {
    return (
      <View style={styles.row}>
        <Text variant="caption" tone="tertiary" style={styles.time}>
          {formatTime(position)}
        </Text>
        <View style={styles.grow}>{bar}</View>
        <Text variant="caption" tone="tertiary" style={styles.time}>
          {formatTime(duration)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {bar}
      <View style={styles.times}>
        <Text variant="caption" tone="tertiary">
          {formatTime(position)}
        </Text>
        <Text variant="caption" tone="tertiary">
          -{formatTime(Math.max(0, duration - position))}
        </Text>
      </View>
    </View>
  );
}

/** Non-interactive line used at the bottom of the compact pill. */
export function CompactPlaybackProgress() {
  const theme = useTheme();
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const ratio = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  return (
    <View style={[styles.compactTrack, { backgroundColor: theme.colors.accentSoft }]}>
      <View
        style={[
          styles.compactFill,
          { width: `${ratio * 100}%`, backgroundColor: theme.colors.accent },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stack: {
    gap: 2,
  },
  grow: {
    flex: 1,
  },
  time: {
    width: 38,
    textAlign: 'center',
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compactTrack: {
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  compactFill: {
    height: 2,
    borderRadius: 1,
  },
});
