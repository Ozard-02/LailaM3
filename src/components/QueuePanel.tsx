import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { ListX, X } from '@/ui/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@/core/models';
import { useTrashAction } from '@/hooks/useTrashAction';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Text } from '@/ui/Text';
import { QueueRow } from './QueueRow';
import { selectFeedback } from '@/utils/haptics';

/** The up-next list is a preview: the full queue is editable below. */
const MAX_UP_NEXT_ROWS = 20;
/** First-paint row pitch until QueueRow reports its measured height. */
const QUEUE_ROW_HEIGHT = 60;

export function QueuePanel({
  onClose,
  topPadding,
  alignToken = 0,
}: {
  onClose: () => void;
  topPadding?: number;
  /** Bumped when the queue is about to open, before the sheet moves. */
  alignToken?: number;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queue = usePlayerStore((state) => state.queueState.queue);
  const upNext = usePlayerStore((state) => state.queueState.upNext);
  const index = usePlayerStore((state) => state.queueState.index);
  const status = usePlayerStore((state) => state.status);
  const current = useCurrentTrack();
  const reorder = usePlayerStore((state) => state.reorder);
  const clear = usePlayerStore((state) => state.clear);
  const moveToUpNext = usePlayerStore((state) => state.moveToUpNext);
  const trash = useTrashAction();
  const hideToast = useUIStore((state) => state.hideToast);
  const trashAt = useCallback(
    (position: number) => {
      hideToast();
      void trash(position);
    },
    [hideToast, trash],
  );

  const [topHold, setTopHold] = useState(false);
  const [playNextArmed, setPlayNextArmed] = useState(false);
  const draggingRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const handledRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragLockedRef = useRef(false);

  // Opening the queue must land on the playing track, not on the first row.
  // The list mounts only after its container is measured, so the trailing
  // space is already correct and initialScrollIndex can land on the target on
  // the first paint. Later opens re-align through alignToken as the sheet
  // starts moving; the rows are still below the fold at that point.
  const listRef = useRef<FlatList<Track>>(null);
  const listHeightRef = useRef(0);
  const [listHeight, setListHeight] = useState(0);
  const rowHeightRef = useRef(0);
  const [rowHeight, setRowHeight] = useState(0);
  const indexRef = useRef(index);
  const queueLengthRef = useRef(queue.length);
  const measuredRef = useRef(false);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    queueLengthRef.current = queue.length;
    // A new list will mount when tracks return; let it snap into place again.
    if (queue.length === 0) measuredRef.current = false;
  }, [queue.length]);

  const alignToCurrent = useCallback(() => {
    const pitch = rowHeightRef.current;
    const length = queueLengthRef.current;
    if (listHeightRef.current <= 0 || pitch <= 0 || length === 0) return;
    const target = Math.max(0, Math.min(indexRef.current, length - 1));
    listRef.current?.scrollToOffset({ offset: target * pitch, animated: false });
  }, []);

  // One frame is enough: the sheet starts fully below the screen and the list
  // only becomes visible after it has risen past the header.
  useEffect(() => {
    const frame = requestAnimationFrame(alignToCurrent);
    return () => cancelAnimationFrame(frame);
  }, [alignToken, alignToCurrent]);

  // A single initial snap handles the first mount and later row measurements
  // (enlarged system text). Height changes after that, such as Up next
  // growing, must not pull the list away from where the user is.
  useEffect(() => {
    if (measuredRef.current || listHeight <= 0 || rowHeight <= 0) return;
    measuredRef.current = true;
    alignToCurrent();
  }, [alignToCurrent, listHeight, rowHeight]);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;
    listHeightRef.current = height;
    setListHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
  }, []);

  const handleRowHeight = useCallback((height: number) => {
    if (height <= 0) return;
    rowHeightRef.current = height;
    setRowHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
  }, []);

  const pitch = rowHeight || QUEUE_ROW_HEIGHT;
  // VirtualizedList reads initialScrollIndex only on mount. Freeze it: a later
  // track change must not make it scroll when the list content changes.
  const [initialIndex] = useState(() =>
    queue.length ? Math.max(0, Math.min(index, queue.length - 1)) : 0,
  );
  const trailingSpace = Math.max(0, listHeight - pitch);
  const getItemLayout = useCallback(
    (_data: unknown, itemIndex: number) => ({
      length: pitch,
      offset: pitch * itemIndex,
      index: itemIndex,
    }),
    [pitch],
  );

  const requestDrag = useCallback((drag: () => void) => {
    // DraggableFlatList keeps the previous active key during the drop spring.
    // Starting another drag before its delayed reset would move the old row.
    if (!dragLockedRef.current) drag();
  }, []);

  const releaseDragLock = useCallback(() => {
    // Let the list finish its data-change reset before accepting another drag.
    setTimeout(() => {
      dragLockedRef.current = false;
    }, 60);
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setTopHold(false);
    setPlayNextArmed(false);
    armedRef.current = false;
  }, []);

  const moveBy = useCallback(
    (from: number, delta: number) => {
      const to = from + delta;
      if (to < 0 || to >= queue.length) return;
      const copy = [...queue];
      const [item] = copy.splice(from, 1);
      if (!item) return;
      copy.splice(to, 0, item);
      reorder(copy);
    },
    [queue, reorder],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      moveBy(index, event.key === 'ArrowUp' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, moveBy]);

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<Track>) => {
    const position = getIndex() ?? 0;
    const isCurrent = item.id === current?.id;
    return (
      <QueueRow
        item={item}
        position={position}
        isCurrent={isCurrent}
        isPlaying={isCurrent && status === 'playing'}
        isActive={isActive}
        drag={() => requestDrag(drag)}
        onPlayNext={moveToUpNext}
        onTrash={trashAt}
        onDismissToast={hideToast}
        onHeight={handleRowHeight}
      />
    );
  };

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.background, paddingTop: topPadding ?? insets.top + 10 },
      ]}
    >
      <View style={styles.header}>
        <IconButton label="Close queue" size={42} variant="soft" onPress={onClose}>
          <X size={20} color={theme.colors.text} />
        </IconButton>
        <View style={styles.headerText}>
          <Text variant="title">Queue</Text>
          <Text variant="caption" tone="secondary">
            {queue.length} tracks · drag to reorder · swipe for trash
          </Text>
        </View>
        <IconButton label="Clear queue" size={40} onPress={clear}>
          <ListX size={18} color={theme.colors.textSecondary} />
        </IconButton>
      </View>

      {upNext.length ? (
        <View style={styles.upNext}>
          <Text variant="label" tone="accent">
            Up next
          </Text>
          {upNext.slice(0, MAX_UP_NEXT_ROWS).map((track) => (
            <View key={track.id} style={styles.upNextRow}>
              <Artwork coverArt={track.coverArt} size={34} radius={6} />
              <Text variant="caption" numberOfLines={1} style={styles.upNextText}>
                {track.title}
              </Text>
            </View>
          ))}
          {upNext.length > MAX_UP_NEXT_ROWS ? (
            <Text variant="caption" tone="tertiary">
              +{upNext.length - MAX_UP_NEXT_ROWS} more
            </Text>
          ) : null}
        </View>
      ) : null}

      {queue.length ? (
        <>
          <View
            style={[
              styles.dropHint,
              {
                backgroundColor: topHold ? theme.colors.accentSoft : 'transparent',
                borderColor: playNextArmed ? theme.colors.accent : 'transparent',
              },
            ]}
          >
            {topHold ? (
              <Text variant="caption" tone={playNextArmed ? 'accent' : 'secondary'}>
                {playNextArmed ? 'Release to add to next' : 'Hold here to add to next'}
              </Text>
            ) : null}
          </View>
          <View style={styles.list} onLayout={handleListLayout}>
            {listHeight > 0 ? (
              <DraggableFlatList
                ref={listRef}
                testID="queue-list"
                data={queue}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                getItemLayout={getItemLayout}
                initialScrollIndex={initialIndex}
                onDragBegin={(dragIndex) => {
                  dragLockedRef.current = true;
                  handledRef.current = false;
                  draggingRef.current = dragIndex;
                }}
                onPlaceholderIndexChange={(placeholderIndex) => {
                  if (
                    placeholderIndex === 0 &&
                    draggingRef.current !== null &&
                    draggingRef.current > 0 &&
                    draggingRef.current !== index
                  ) {
                    setTopHold(true);
                    if (!holdTimer.current) {
                      holdTimer.current = setTimeout(() => {
                        armedRef.current = true;
                        setPlayNextArmed(true);
                        selectFeedback();
                      }, 650);
                    }
                  } else {
                    clearHold();
                  }
                }}
                onRelease={(from) => {
                  // onDragEnd fires only after the snap-back animation. Move
                  // the row immediately so Up next does not wait for it.
                  if (armedRef.current && from !== index) {
                    handledRef.current = true;
                    clearHold();
                    draggingRef.current = null;
                    moveToUpNext(from);
                  }
                }}
                onDragEnd={({ data }) => {
                  releaseDragLock();
                  if (handledRef.current) {
                    handledRef.current = false;
                    return;
                  }
                  const armed = armedRef.current;
                  const from = draggingRef.current;
                  clearHold();
                  draggingRef.current = null;
                  if (armed && from !== null) {
                    moveToUpNext(from);
                  } else {
                    reorder(data);
                  }
                }}
                activationDistance={8}
                onScrollBeginDrag={hideToast}
                containerStyle={styles.listContainer}
                // The extra bottom space lets the last track reach the top of
                // the viewport; it is exactly the viewport height minus a row.
                contentContainerStyle={{
                  paddingBottom: insets.bottom + 24 + trailingSpace,
                }}
              />
            ) : null}
          </View>
        </>
      ) : (
        <EmptyState title="Queue is empty" message="Play an album or add tracks to start." />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  list: {
    flex: 1,
    marginTop: 6,
  },
  listContainer: {
    flex: 1,
  },
  dropHint: {
    minHeight: 26,
    borderWidth: 1,
    borderRadius: 999,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upNext: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upNextText: {
    flex: 1,
  },
});
