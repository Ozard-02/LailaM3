import { GripVertical, ListStart, Pause, Play, Trash2, X } from '@/ui/icons';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
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
  position: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isActive: boolean;
  drag: () => void;
  onPlayNext: (index: number) => void;
  onTrash: (index: number) => void;
  onDismissToast: () => void;
}

export function QueueRow({
  item,
  position,
  isCurrent,
  isPlaying,
  isActive,
  drag,
  onPlayNext,
  onTrash,
  onDismissToast,
}: QueueRowProps) {
  const theme = useTheme();
  const jump = usePlayerStore((state) => state.jump);
  const removeAt = usePlayerStore((state) => state.removeAt);
  const toggle = usePlayerStore((state) => state.toggle);

  const handleTrash = useCallback(() => {
    onDismissToast();
    selectFeedback();
    onTrash(position);
  }, [onDismissToast, onTrash, position]);

  const onNext = useCallback(() => {
    onDismissToast();
    selectFeedback();
    onPlayNext(position);
  }, [onDismissToast, onPlayNext, position]);

  const { gesture, contentStyle, leftOpacity: nextOpacity, rightOpacity: trashOpacity } =
    useSwipeRow({
      leftEnabled: !isCurrent,
      rightEnabled: true,
      onLeft: onNext,
      onRight: handleTrash,
      onBegin: onDismissToast,
      maxTranslate: 120,
      revealDistance: 40,
      scale: isActive ? 1.02 : 1,
    });

  return (
    <View style={[styles.swipeContainer, { borderRadius: theme.radius.sm }]}>
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
          <IconButton
            label="Drag to reorder"
            size={30}
            onPress={() => {
              onDismissToast();
              drag();
            }}
          >
            <GripVertical size={18} color={theme.colors.textTertiary} />
          </IconButton>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.title}`}
            onLongPress={() => {
              onDismissToast();
              drag();
            }}
            delayLongPress={180}
            haptic={false}
            scaleTo={1}
            onPress={() => {
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
}

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
