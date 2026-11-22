import { GripVertical, ListStart, Pause, Play, Trash2, X } from '@/ui/icons';
import { memo, useCallback } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { Track } from '@/core/models';
import { usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';
import { selectFeedback } from '@/utils/haptics';
import { useSwipeRow } from './useSwipeRow';

export interface QueueRowProps {
  item: Track;
  isActive: boolean;
  /** The list's stable drag starter. */
  drag: () => void;
  /** Laila's drag lock wrapper. */
  onDrag: (drag: () => void) => void;
  onPlayNext: (index: number) => void;
  onTrash: (index: number) => void;
  onDismissToast: () => void;
  /** Reports the row's laid-out height so the list can derive its pitch. */
  onLayout?: (event: LayoutChangeEvent) => void;
}

/**
 * A queue row subscribes only to the numeric state it needs (0 = not current,
 * 1 = current paused, 2 = current playing). The panel therefore does not have
 * to re-render every mounted row for a play/pause or an automatic advance.
 */
export const QueueRow = memo(function QueueRow({
  item,
  isActive,
  drag,
  onDrag,
  onPlayNext,
  onTrash,
  onDismissToast,
  onLayout,
}: QueueRowProps) {
  const theme = useTheme();
  const playbackState = usePlayerStore((state) => {
    const current = state.queueState.queue[state.queueState.index];
    if (!current || current.id !== item.id) return 0;
    return state.status === 'playing' ? 2 : 1;
  });
  const isCurrent = playbackState > 0;
  const isPlaying = playbackState === 2;
  const jump = usePlayerStore((state) => state.jump);
  const removeAt = usePlayerStore((state) => state.removeAt);
  const toggle = usePlayerStore((state) => state.toggle);

  // DraggableFlatList's `getIndex` is a last-known index: cells can keep a
  // stale value after the queue changes. Resolve the row's position from the
  // live queue when the action runs instead, so a second swipe/remove cannot
  // hit the row that inherited the old index.
  const resolveIndex = useCallback(() => {
    const queue = usePlayerStore.getState().queueState.queue;
    const byIdentity = queue.indexOf(item);
    return byIdentity >= 0 ? byIdentity : queue.findIndex((track) => track.id === item.id);
  }, [item]);

  const handleTrash = useCallback(() => {
    const position = resolveIndex();
    if (position < 0) return;
    onDismissToast();
    selectFeedback();
    onTrash(position);
  }, [onDismissToast, onTrash, resolveIndex]);

  const onNext = useCallback(() => {
    const position = resolveIndex();
    if (position < 0) return;
    onDismissToast();
    selectFeedback();
    onPlayNext(position);
  }, [onDismissToast, onPlayNext, resolveIndex]);

  const startDrag = useCallback(() => {
    onDismissToast();
    onDrag(drag);
  }, [drag, onDismissToast, onDrag]);

  const { gesture, contentStyle, leftOpacity: nextOpacity, rightOpacity: trashOpacity, consumeSwipePress } =
    useSwipeRow({
      leftEnabled: !isCurrent,
      rightEnabled: true,
      onLeft: onNext,
      onRight: handleTrash,
      onBegin: onDismissToast,
      maxTranslate: 120,
      revealDistance: 40,
      scale: isActive && !theme.reduceMotion ? 1.02 : 1,
    });

  return (
    <View style={[styles.swipeContainer, { borderRadius: theme.radius.sm }]} onLayout={onLayout}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.actionClip,
          { borderRadius: theme.radius.sm },
        ]}
      >
        <Animated.View
          style={[
            styles.action,
            styles.actionRight,
            { backgroundColor: theme.colors.danger },
            trashOpacity,
          ]}
        >
          <Trash2 size={18} color="#fff" />
          <Text variant="caption" tone="inverse" style={styles.actionLabel}>
            Trash
          </Text>
        </Animated.View>
        {!isCurrent ? (
          <Animated.View
            style={[
              styles.action,
              styles.actionLeft,
              { backgroundColor: theme.colors.accent },
              nextOpacity,
            ]}
          >
            <Text variant="caption" tone="inverse" style={styles.actionLabel}>
              Play next
            </Text>
            <ListStart size={18} color="#fff" />
          </Animated.View>
        ) : null}
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          accessibilityActions={[
            { name: 'trash', label: 'Move to Trash' },
            ...(isCurrent ? [] : [{ name: 'playNext', label: 'Play next' }]),
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'trash') handleTrash();
            else if (event.nativeEvent.actionName === 'playNext') onNext();
          }}
          style={[
            styles.row,
            {
              backgroundColor: isActive
                ? theme.colors.elevated2
                : isCurrent
                  ? theme.colors.accentSoft
                  : theme.colors.background,
              borderRadius: theme.radius.sm,
            },
            isActive && styles.activeRow,
            contentStyle,
          ]}
        >
          <IconButton label="Drag to reorder" size={30} onPress={startDrag}>
            <GripVertical size={18} color={theme.colors.textTertiary} />
          </IconButton>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.title}`}
            onLongPress={startDrag}
            delayLongPress={180}
            haptic={false}
            scaleTo={1}
            onPress={() => {
              if (consumeSwipePress()) return;
              const position = resolveIndex();
              if (position < 0) return;
              onDismissToast();
              void jump(position);
            }}
            containerStyle={styles.main}
            style={styles.mainInner}
          >
            <Artwork coverArt={item.coverArt} size={44} radius={7} />
            <View style={styles.text}>
              <Text
                variant="callout"
                numberOfLines={1}
                tone={isCurrent ? 'accent' : 'primary'}
                style={styles.title}
              >
                {item.title}
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {item.artist ?? 'Unknown artist'}
              </Text>
            </View>
          </PressableScale>
          {isCurrent ? (
            <IconButton
              label={isPlaying ? 'Pause' : 'Play'}
              size={34}
              onPress={() => {
                onDismissToast();
                void toggle();
              }}
            >
              {isPlaying ? (
                <Pause size={16} color={theme.colors.accent} fill={theme.colors.accent} />
              ) : (
                <Play size={16} color={theme.colors.accent} fill={theme.colors.accent} />
              )}
            </IconButton>
          ) : null}
          <IconButton
            label={`Remove ${item.title} from queue`}
            size={30}
            onPress={() => {
              const position = resolveIndex();
              if (position < 0) return;
              onDismissToast();
              removeAt(position);
            }}
          >
            <X size={16} color={theme.colors.textTertiary} />
          </IconButton>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  swipeContainer: {
    marginBottom: 4,
  },
  actionClip: {
    overflow: 'hidden',
  },
  activeRow: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  actionLeft: {
    left: 0,
  },
  actionRight: {
    right: 0,
  },
  actionLabel: {
    fontWeight: '600',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  mainInner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontWeight: '600',
  },
});
