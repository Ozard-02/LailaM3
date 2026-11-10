import { useRouter } from 'expo-router';
import {
  ChevronDown,
  Mic2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from '@/ui/icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lyricBottomPadding, lyricCenterPadding } from '@/core/lyrics/centering';
import { activeLineIndex, type Lyrics } from '@/core/lyrics/lrc';
import { useLyrics } from '@/hooks/useLyrics';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { useTheme } from '@/theme/ThemeProvider';
import { MarqueeText } from '@/components/MarqueeText';
import { PlaybackProgress } from '@/components/PlaybackProgress';
import { Artwork } from '@/ui/Artwork';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { Skeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

export default function LyricsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height && width >= 620;
  const shortLandscape = landscape && height < 520;
  const track = useCurrentTrack();
  const status = usePlayerStore((state) => state.status);
  const toggle = usePlayerStore((state) => state.toggle);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const lyrics = useLyrics();
  const [headerHeight, setHeaderHeight] = useState(0);
  const landscapeLeft = track ? (
    <View style={styles.landscapeLeft}>
      <Artwork
        coverArt={track.coverArt}
        size={Math.max(104, Math.min(width * 0.26, height * 0.36))}
        radius={theme.radius.md}
        style={styles.landscapeCover}
      />
      {!shortLandscape ? (
        <View style={styles.landscapeText}>
          <MarqueeText variant="title">{track.title}</MarqueeText>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {track.artist ?? 'Unknown artist'}
          </Text>
        </View>
      ) : null}
      <View style={styles.landscapeControls}>
        <IconButton label="Previous track" size={42} onPress={() => void previous()}>
          <SkipBack size={20} color={theme.colors.text} fill={theme.colors.text} />
        </IconButton>
        <IconButton
          label={status === 'playing' ? 'Pause' : 'Play'}
          size={56}
          variant="soft"
          onPress={() => void toggle()}
        >
          {status === 'playing' ? (
            <Pause size={24} color={theme.colors.text} fill={theme.colors.text} />
          ) : (
            <Play size={24} color={theme.colors.text} fill={theme.colors.text} />
          )}
        </IconButton>
        <IconButton label="Next track" size={42} onPress={() => void next()}>
          <SkipForward size={20} color={theme.colors.text} fill={theme.colors.text} />
        </IconButton>
      </View>
      <View style={styles.landscapeProgress}>
        <PlaybackProgress label="Playback position" />
      </View>
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View
        style={[styles.header, { paddingTop: insets.top + 8 }]}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <IconButton label="Close lyrics" size={42} variant="soft" onPress={() => router.back()}>
          <ChevronDown size={22} color={theme.colors.text} />
        </IconButton>
        <View style={styles.headerText}>
          <Text variant="title">Lyrics</Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {track?.title ?? 'Nothing playing'}
            {track?.artist ? ` — ${track.artist}` : ''}
          </Text>
        </View>
        {track ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Close lyrics"
            onPress={() => router.back()}
            haptic={false}
          >
            <Artwork coverArt={track.coverArt} size={42} radius={8} />
          </PressableScale>
        ) : (
          <View style={{ width: 42 }} />
        )}
      </View>

      {lyrics.isLoading ? (
        <View style={styles.loading}>
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} style={{ width: index % 3 === 0 ? '70%' : '90%', height: 20 }} />
          ))}
        </View>
      ) : !track ? (
        <EmptyState
          title="Nothing playing"
          message="Start a track to see its lyrics."
          icon={<Mic2 size={30} color={theme.colors.textTertiary} />}
        />
      ) : !lyrics.data ? (
        <EmptyState
          title="No lyrics found"
          message="This server did not return lyrics for this track. Sidecar .lrc support comes later."
          icon={<Mic2 size={30} color={theme.colors.textTertiary} />}
        />
      ) : landscape && landscapeLeft ? (
        <View style={[styles.landscape, shortLandscape && styles.landscapeShort]}>
          {landscapeLeft}
          <View style={styles.landscapeRight}>
            <LyricsBody data={lyrics.data} landscape={landscape} topOffset={headerHeight} />
          </View>
        </View>
      ) : (
        <LyricsBody data={lyrics.data} landscape={landscape} topOffset={headerHeight} />
      )}
    </View>
  );
}


const LINE_GAP = 18;

function LyricsBody({
  data,
  landscape,
  topOffset,
}: {
  data: Lyrics;
  landscape: boolean;
  topOffset: number;
}) {
  const insets = useSafeAreaInsets();
  const position = usePlayerStore((state) => state.position);
  const seek = usePlayerStore((state) => state.seek);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Heights only: positions are recomputed from them, so a padding change or a
  // web ResizeObserver that misses a position change cannot break centering.
  const heights = useRef<number[]>([]);
  const [following, setFollowing] = useState(true);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [metaHeight, setMetaHeight] = useState(0);
  const [contentVersion, setContentVersion] = useState(0);
  const paddingTop = lyricCenterPadding(viewportHeight, topOffset + metaHeight);
  const paddingBottom = lyricBottomPadding(
    viewportHeight,
    paddingTop,
    insets.bottom + (landscape ? 24 : 140),
  );

  const active = useMemo(() => {
    if (!data.synced) return -1;
    return activeLineIndex(data.lines, position);
  }, [data, position]);

  const seekToLine = useCallback(
    (start: number) => {
      setFollowing(true);
      void seek(start);
    },
    [seek],
  );

  useEffect(() => {
    if (!following || active < 0 || viewportHeight <= 0) return;
    const height = heights.current[active];
    if (!height) return;
    let offset = 0;
    for (let index = 0; index < active; index += 1) {
      offset += (heights.current[index] ?? 0) + LINE_GAP;
    }
    // The line centre lands at `paddingTop`, which is measured from the full
    // screen (scroll viewport minus the header/meta offset) rather than from
    // the scroll area alone.
    const target = Math.max(0, offset + height / 2);
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [active, contentVersion, following, paddingBottom, paddingTop, viewportHeight]);

  return (
    <>
      <View
        style={styles.meta}
        onLayout={(event) => setMetaHeight(event.nativeEvent.layout.height)}
      >
        <Text variant="label" tone={data.synced ? 'accent' : 'tertiary'}>
          {data.synced ? 'Synced lyrics' : 'Plain lyrics'}
        </Text>
        {data.synced ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={following ? 'Stop following lyrics' : 'Follow lyrics'}
            haptic={false}
            onPress={() => setFollowing((value) => !value)}
          >
            <Text variant="caption" tone={following ? 'accent' : 'tertiary'}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </PressableScale>
        ) : (
          <Text variant="caption" tone="tertiary">
            {data.source === 'structured' ? 'OpenSubsonic' : 'LRC'}
          </Text>
        )}
      </View>
      <ScrollView
        ref={scrollRef}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onScrollBeginDrag={() => setFollowing(false)}
        onContentSizeChange={() => setContentVersion((value) => value + 1)}
        contentContainerStyle={[
          styles.lines,
          { paddingTop, paddingBottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {data.lines.map((line, index) => {
          const isActive = index === active;
          const canSeek = typeof line.start === 'number';
          return (
            <View
              key={`${index}-${line.start ?? 'plain'}`}
              onLayout={(event) => {
                heights.current[index] = event.nativeEvent.layout.height;
              }}
            >
              <LyricVerse
                value={line.value}
                isActive={isActive}
                canSeek={canSeek}
                start={line.start}
                onSeek={seekToLine}
              />
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

const LyricVerse = memo(function LyricVerse({
  value,
  isActive,
  canSeek,
  start,
  onSeek,
}: {
  value: string;
  isActive: boolean;
  canSeek: boolean;
  start?: number;
  onSeek: (start: number) => void;
}) {
  const theme = useTheme();
  const presence = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    presence.set(withTiming(isActive ? 1 : 0, { duration: 300 }));
  }, [isActive, presence]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.68 + presence.get() * 0.32,
    transform: [{ scale: 0.97 + presence.get() * 0.08 }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <PressableScale
        haptic={false}
        disabled={!canSeek}
        accessibilityRole={canSeek ? 'button' : undefined}
        accessibilityLabel={canSeek ? `Seek to ${value}` : value}
        onPress={() => {
          if (start !== undefined) onSeek(start);
        }}
      >
        <Text
          variant="body"
          tone={isActive ? 'accent' : 'secondary'}
          style={[styles.line, isActive && { color: theme.colors.accent }]}
        >
          {value}
        </Text>
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  loading: {
    padding: 24,
    gap: 14,
  },
  landscape: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 28,
  },
  landscapeShort: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 18,
  },
  landscapeLeft: {
    width: '38%',
    maxWidth: 360,
    justifyContent: 'center',
    gap: 16,
  },
  landscapeCover: {
    alignSelf: 'center',
  },
  landscapeText: {
    gap: 4,
  },
  landscapeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  landscapeProgress: {
    marginTop: 2,
  },
  landscapeRight: {
    flex: 1,
    minWidth: 0,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  lines: {
    paddingHorizontal: 24,
    gap: LINE_GAP,
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
  },
  line: {
    lineHeight: 30,
    textAlign: 'center',
  },
});
