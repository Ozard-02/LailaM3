import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { ListX, X } from '@/ui/icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@/core/models';
import { useTrashAction } from '@/hooks/useTrashAction';
import { usePlayerStore } from '@/stores/player';
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
/** Gap below each QueueRow, from its swipe container margin. */
const QUEUE_ROW_GAP = 4;
/**
 * A QueueRow is an artwork (44) plus vertical padding (6 + 6). The first row
 * reports its real height; this is only the fallback until that layout lands,
 * so a font scale that makes the text taller corrects itself.
 */
const DEFAULT_QUEUE_ROW_HEIGHT = 44 + 6 + 6;
const DEFAULT_QUEUE_ROW_PITCH = DEFAULT_QUEUE_ROW_HEIGHT + QUEUE_ROW_GAP;

function queueKey(item: Track) {
  return item.id;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}

const UpNextPreview = memo(function UpNextPreview({ tracks }: { tracks: Track[] }) {
  if (!tracks.length) return null;
  return (
    <View style={styles.upNext}>
      <Text variant="label" tone="accent">
        Up next
      </Text>
      {tracks.slice(0, MAX_UP_NEXT_ROWS).map((track) => (
        <View key={track.id} style={styles.upNextRow}>
          <Artwork coverArt={track.coverArt} size={34} radius={6} />
          <Text variant="caption" numberOfLines={1} style={styles.upNextText}>
            {track.title}
          </Text>
        </View>
      ))}
      {tracks.length > MAX_UP_NEXT_ROWS ? (
        <Text variant="caption" tone="tertiary">
          +{tracks.length - MAX_UP_NEXT_ROWS} more
        </Text>
      ) : null}
    </View>
  );
});

export const QueuePanel = memo(function QueuePanel({
  onClose,
  topPadding,
  open = true,
}: {
  onClose: () => void;
  topPadding?: number;
  /** Player sheet visibility; the standalone queue screen is always open. */
  open?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queue = usePlayerStore((state) => state.queueState.queue);
  const upNext = usePlayerStore((state) => state.queueState.upNext);
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
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragLockedRef = useRef(false);

  // Opening the queue must land on the playing track, not on the first row.
  // The panel is pre-mounted off-screen once the player settles, so it can be
  // aligned while closed: the first open is then only the sheet spring, with
  // no mount or scroll work on its visible frames.
  const listRef = useRef<FlatList<Track>>(null);
  const listHeightRef = useRef(0);
  const [listHeight, setListHeight] = useState(0);
  const [rowPitch, setRowPitch] = useState(DEFAULT_QUEUE_ROW_PITCH);
  const pitchRef = useRef(DEFAULT_QUEUE_ROW_PITCH);
  const pitchMeasuredRef = useRef(false);
  const alignPendingRef = useRef(false);
  const alignedOnceRef = useRef(false);
  const alignRetriesRef = useRef(0);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
    },
    [],
  );

  const alignToCurrent = useCallback(() => {
    if (!alignPendingRef.current || listHeightRef.current <= 0) return;
    const { queue: currentQueue, index } = usePlayerStore.getState().queueState;
    if (currentQueue.length === 0) {
      alignPendingRef.current = false;
      return;
    }
    alignPendingRef.current = false;
    alignedOnceRef.current = true;
    alignRetriesRef.current = 0;
    const target = Math.max(0, Math.min(index, currentQueue.length - 1));
    listRef.current?.scrollToIndex({ index: target, viewPosition: 0, animated: false });
  }, []);

  const requestAlign = useCallback(() => {
    alignPendingRef.current = true;
    alignedOnceRef.current = false;
    // Two frames let a just-mounted sheet measure its list and apply the
    // bottom space below before the target offset is calculated.
    requestAnimationFrame(() => requestAnimationFrame(alignToCurrent));
  }, [alignToCurrent]);

  // A track change while the panel is closed still re-aligns it, so the next
  // open never has to scroll. Rows select the playing state themselves; this
  // subscription only watches the queue index.
  useEffect(
    () =>
      usePlayerStore.subscribe((state, previous) => {
        if (state.queueState.index !== previous.queueState.index) requestAlign();
      }),
    [requestAlign],
  );

  // First layout and every pitch correction need a fresh alignment. Both can
  // happen while the panel is still translated below the screen.
  useEffect(() => {
    requestAlign();
  }, [requestAlign, rowPitch]);

  // Reopening after the user scrolled away must return to the playing track.
  // When the panel is already aligned this is a no-op scroll, so it does not
  // add work to the opening frames.
  useEffect(() => {
    if (open) requestAlign();
  }, [open, requestAlign]);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      // Jump near the target first so the row exists, then align it exactly
      // once it has been rendered.
      if (alignRetriesRef.current >= 2) return;
      alignRetriesRef.current += 1;
      alignedOnceRef.current = false;
      const offset = (info.averageItemLength || pitchRef.current) * info.index;
      listRef.current?.scrollToOffset({ offset, animated: false });
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
      scrollRetryTimer.current = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0, animated: false });
      }, 60);
    },
    [],
  );

  // Rows are fixed height, so the list can compute offsets without measuring
  // every cell. The pitch comes from the first laid-out row, which keeps the
  // alignment exact with font scaling and any future row padding change.
  const onRowLayout = useCallback((event: LayoutChangeEvent) => {
    // Measure once per mount: virtualisation mounts new rows while the user
    // scrolls, and re-measuring there would re-trigger alignment and snap the
    // list back to the playing track.
    if (pitchMeasuredRef.current) return;
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;
    pitchMeasuredRef.current = true;
    const pitch = height + QUEUE_ROW_GAP;
    pitchRef.current = pitch;
    setRowPitch(pitch);
  }, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<Track> | null | undefined, rowIndex: number) => ({
      length: rowPitch,
      offset: rowPitch * rowIndex,
      index: rowIndex,
    }),
    [rowPitch],
  );

  const requestDrag = useCallback((drag: () => void) => {
    // DraggableFlatList keeps the previous active key during the drop spring.
    // Starting another drag before its delayed reset would move the old row.
    if (!dragLockedRef.current) drag();
  }, []);

  const releaseDragLock = useCallback(() => {
    // Let the list finish its data-change reset before accepting another drag.
    releaseTimer.current = setTimeout(() => {
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

  const moveBy = useCallback((delta: number) => {
    const state = usePlayerStore.getState();
    const from = state.queueState.index;
    const to = from + delta;
    const currentQueue = state.queueState.queue;
    if (to < 0 || to >= currentQueue.length) return;
    const copy = [...currentQueue];
    const [item] = copy.splice(from, 1);
    if (!item) return;
    copy.splice(to, 0, item);
    state.reorder(copy);
  }, []);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      moveBy(event.key === 'ArrowUp' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveBy, open]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Track>) => (
      <QueueRow
        item={item}
        isActive={isActive}
        drag={drag}
        onDrag={requestDrag}
        onPlayNext={moveToUpNext}
        onTrash={trashAt}
        onDismissToast={hideToast}
        onLayout={onRowLayout}
      />
    ),
    [hideToast, moveToUpNext, onRowLayout, requestDrag, trashAt],
  );

  const onContainerLayout = useCallback(
    ({ layout }: { layout: { height: number } }) => {
      const height = layout.height;
      if (height <= 0) return;
      listHeightRef.current = height;
      setListHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
      if (alignPendingRef.current && !alignedOnceRef.current) {
        requestAnimationFrame(() => requestAnimationFrame(alignToCurrent));
      }
    },
    [alignToCurrent],
  );

  const onContentSizeChange = useCallback(() => {
    if (alignPendingRef.current && !alignedOnceRef.current) {
      requestAnimationFrame(alignToCurrent);
    }
  }, [alignToCurrent]);

  const onDragBegin = useCallback(
    (dragIndex: number) => {
      // A previous drag may have been cancelled before its timer/release ran.
      clearHold();
      armedRef.current = false;
      dragLockedRef.current = true;
      handledRef.current = false;
      draggingRef.current = dragIndex;
    },
    [clearHold],
  );

  const onPlaceholderIndexChange = useCallback(
    (placeholderIndex: number) => {
      const from = draggingRef.current;
      if (
        placeholderIndex === 0 &&
        from !== null &&
        from > 0 &&
        from !== usePlayerStore.getState().queueState.index
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
    },
    [clearHold],
  );

  const onRelease = useCallback(
    (from: number) => {
      // The release owns the intent. Cancel the 650 ms timer here: onDragEnd
      // fires only after the drop spring, so a quick drop must not arm late.
      const armed = armedRef.current;
      clearHold();
      if (armed && from !== usePlayerStore.getState().queueState.index) {
        handledRef.current = true;
        draggingRef.current = null;
        moveToUpNext(from);
      }
    },
    [clearHold, moveToUpNext],
  );

  const onDragEnd = useCallback(
    ({ from, to, data }: DragEndParams<Track>) => {
      releaseDragLock();
      if (handledRef.current) {
        handledRef.current = false;
        return;
      }
      clearHold();
      draggingRef.current = null;
      const current = usePlayerStore.getState().queueState.queue;
      const unchanged =
        from === to ||
        (current.length === data.length &&
          current.every((track, index) => track.id === data[index]?.id));
      if (!unchanged) reorder(data);
    },
    [clearHold, releaseDragLock, reorder],
  );

  const contentStyle = useMemo(
    () => ({
      paddingBottom: insets.bottom + 24 + Math.max(0, listHeight - rowPitch),
    }),
    [insets.bottom, listHeight, rowPitch],
  );

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

      <UpNextPreview tracks={upNext} />

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
          <DraggableFlatList
            ref={listRef}
            testID="queue-list"
            data={queue}
            keyExtractor={queueKey}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            windowSize={9}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            onContainerLayout={onContainerLayout}
            onContentSizeChange={onContentSizeChange}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            onDragBegin={onDragBegin}
            onPlaceholderIndexChange={onPlaceholderIndexChange}
            onRelease={onRelease}
            onDragEnd={onDragEnd}
            activationDistance={8}
            onScrollBeginDrag={hideToast}
            containerStyle={styles.list}
            // The extra bottom space lets the last track reach the top of the
            // viewport; it is exactly the viewport height minus one row.
            contentContainerStyle={contentStyle}
          />
        </>
      ) : (
        <EmptyState title="Queue is empty" message="Play an album or add tracks to start." />
      )}
    </View>
  );
});

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
