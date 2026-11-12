import { Download, HardDrive, Pause, Play, Trash2, WifiOff, X } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { DownloadEntry } from '@/core/offline';
import { Screen } from '@/components/Screen';
import { VirtualList } from '@/components/VirtualList';
import { useBottomChromeInset } from '@/hooks/useBottomChromeInset';
import { useDownloadProgress } from '@/stores/downloadProgress';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { useSettingsStore } from '@/stores/settings';
import { usePlayerStore } from '@/stores/player';
import { useFreeSpace } from '@/hooks/useFreeSpace';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { Surface } from '@/ui/Surface';
import { ProgressBar } from '@/ui/ProgressBar';
import { Text } from '@/ui/Text';
import { formatBytes, formatDurationLong } from '@/utils/format';
import { buildDownloadItems, downloadItemKey } from '@/utils/downloadItems';

function ActiveDownloadRow({ entry }: { entry: DownloadEntry }) {
  const theme = useTheme();
  const live = useDownloadProgress(entry.track.id);
  const pause = useOfflineStore((state) => state.pause);
  const resume = useOfflineStore((state) => state.resume);
  const cancel = useOfflineStore((state) => state.cancel);

  const progress = live?.progress ?? entry.progress;
  const percent = Math.round(progress * 100);
  const speed = entry.status === 'downloading' && live?.speed ? `${formatBytes(live.speed)}/s` : null;
  const bytesWritten = live?.bytesWritten ?? entry.bytesWritten;
  const totalBytes = live?.totalBytes ?? entry.totalBytes;

  return (
    <Surface style={styles.activeRow} bordered>
      <Artwork coverArt={entry.track.coverArt} size={42} radius={7} />
      <View style={styles.activeText}>
        <Text variant="callout" numberOfLines={1} style={styles.strong}>
          {entry.track.title}
        </Text>
        <ProgressBar
          label={`Download progress ${entry.track.title}`}
          value={progress}
          max={1}
          height={4}
        />
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {entry.status === 'queued'
            ? 'Queued'
            : entry.status === 'paused'
              ? 'Paused'
              : entry.status === 'error'
                ? entry.error ?? 'Download failed'
                : `${percent}%${speed ? ` · ${speed}` : ''}${
                    bytesWritten && totalBytes
                      ? ` · ${formatBytes(bytesWritten)} / ${formatBytes(totalBytes)}`
                      : ''
                  }`}
        </Text>
      </View>
      {entry.status === 'downloading' ? (
        <IconButton label={`Pause ${entry.track.title}`} size={34} onPress={() => pause(entry.track.id)}>
          <Pause size={16} color={theme.colors.textSecondary} />
        </IconButton>
      ) : (
        <IconButton
          label={`${entry.status === 'error' ? 'Retry' : 'Resume'} ${entry.track.title}`}
          size={34}
          onPress={() => resume(entry.track.id)}
        >
          <Play size={16} color={theme.colors.textSecondary} />
        </IconButton>
      )}
      <IconButton
        label={`Cancel ${entry.track.title}`}
        size={34}
        onPress={() => cancel(entry.track.id)}
      >
        <X size={16} color={theme.colors.textTertiary} />
      </IconButton>
    </Surface>
  );
}

export default function DownloadsScreen() {
  const theme = useTheme();
  const index = useOfflineStore((state) => state.index);
  const offlineMode = useOfflineStore((state) => state.offlineMode);
  const networkOffline = useOfflineStore((state) => state.networkOffline);
  const effectiveOffline = useEffectiveOffline();
  const setOfflineMode = useOfflineStore((state) => state.setOfflineMode);
  const removeCollection = useOfflineStore((state) => state.removeCollection);
  const removeTrack = useOfflineStore((state) => state.removeTrack);
  const clearAll = useOfflineStore((state) => state.clearAll);
  const freeUpSpace = useOfflineStore((state) => state.freeUpSpace);
  const downloads = useOfflineStore((state) => state.downloads);
  const freeBytes = useFreeSpace();
  const downloadQuality = useSettingsStore((state) => state.downloadQuality);
  const offlineLimitBytes = useSettingsStore((state) => state.offlineLimitBytes);
  const queue = usePlayerStore((state) => state.queueState.queue);
  const queueIds = useMemo(() => new Set(queue.map((track) => track.id)), [queue]);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, message: string) => {
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(message);
    }
  };

  const collections = useMemo(() => Object.values(index.collections), [index.collections]);
  const tracks = useMemo(() => Object.values(index.tracks), [index.tracks]);
  const collectionTrackIds = useMemo(
    () => new Set(collections.flatMap((collection) => collection.trackIds)),
    [collections],
  );
  const looseTracks = useMemo(
    () => tracks.filter((entry) => !collectionTrackIds.has(entry.track.id)),
    [tracks, collectionTrackIds],
  );
  const activeDownloads = useMemo(
    () => Object.values(downloads).filter((entry) => entry.status !== 'done'),
    [downloads],
  );
  const total = useMemo(
    () => tracks.reduce((sum, entry) => sum + entry.size, 0),
    [tracks],
  );
  const chromeInset = useBottomChromeInset();
  const downloadItems = useMemo(
    () => buildDownloadItems({ active: activeDownloads, collections, tracks: looseTracks }),
    [activeDownloads, collections, looseTracks],
  );

  return (
    <Screen
      title="Downloads"
      subtitle="Original files, kept on this device."
      scroll={false}
      right={
        <Button
          label={
            networkOffline
              ? 'Offline · no network'
              : offlineMode
                ? 'Offline mode on'
                : 'Offline mode off'
          }
          size="sm"
          variant={effectiveOffline ? 'secondary' : 'ghost'}
          icon={
            <WifiOff
              size={15}
              color={effectiveOffline ? theme.colors.accent : theme.colors.textSecondary}
            />
          }
          disabled={networkOffline}
          onPress={() => setOfflineMode(!offlineMode)}
        />
      }
    >
      <VirtualList
        style={styles.fill}
        data={downloadItems}
        keyExtractor={downloadItemKey}
        getItemType={(item) => item.kind}
        contentContainerStyle={{ paddingBottom: chromeInset + 32 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <Surface style={styles.summary} bordered>
              <View style={[styles.summaryIcon, { backgroundColor: theme.colors.accentSoft }]}>
                <HardDrive size={20} color={theme.colors.accent} />
              </View>
              <View style={styles.summaryText}>
                <Text variant="headline">
                  {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                </Text>
                <Text variant="caption" tone="secondary">
                  {formatBytes(total)} on this device
                  {freeBytes !== null ? ` · ${formatBytes(freeBytes)} free` : ''}
                  {effectiveOffline ? ' · downloads only' : ''}
                </Text>
                <Text variant="caption" tone="tertiary">
                  New downloads:{' '}
                  {downloadQuality === 'original'
                    ? 'original files'
                    : downloadQuality === 'opus'
                      ? 'Opus 128 kbps'
                      : 'MP3 192 kbps'}
                </Text>
              </View>
              {tracks.length ? (
                <Button
                  label="Clear all"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    void run(
                      clearAll,
                      'Could not clear all downloads. Close any playing file and try again.',
                    )
                  }
                />
              ) : null}
            </Surface>

            {offlineLimitBytes && total > offlineLimitBytes ? (
              <Surface style={styles.summary} bordered>
                <View style={styles.summaryText}>
                  <Text variant="headline">Over the download budget</Text>
                  <Text variant="caption" tone="secondary">
                    {formatBytes(total)} of {formatBytes(offlineLimitBytes)} used ·{' '}
                    {formatBytes(total - offlineLimitBytes)} over
                  </Text>
                </View>
                <Button
                  label="Free up space"
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    void run(
                      () => freeUpSpace(queueIds).then(() => undefined),
                      'Could not free up space. Close any playing file and try again.',
                    )
                  }
                />
              </Surface>
            ) : null}

            <Text variant="caption" tone="tertiary">
              Offline mode keeps Home and Library on downloaded music only. It is enabled
              automatically when the device has no network.
            </Text>
            {actionError ? <ErrorNotice message={actionError} /> : null}
          </View>
        }
        renderItem={({ item }) => {
          switch (item.kind) {
            case 'section':
              return (
                <View style={styles.sectionHeader}>
                  <Text variant="headline">{item.title}</Text>
                  {item.subtitle ? (
                    <Text variant="caption" tone="tertiary">
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
              );
            case 'active':
              return (
                <View style={styles.rowWrap}>
                  <ActiveDownloadRow entry={item.entry} />
                </View>
              );
            case 'collection':
              return (
                <View style={styles.rowWrap}>
                  <Surface style={styles.collection} bordered>
                    {item.collection.coverArt ? (
                      <Artwork coverArt={item.collection.coverArt} size={42} radius={7} />
                    ) : (
                      <View
                        style={[
                          styles.collectionIcon,
                          { backgroundColor: theme.colors.elevated2 },
                        ]}
                      >
                        <Download size={18} color={theme.colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.collectionText}>
                      <Text variant="callout" style={styles.strong} numberOfLines={1}>
                        {item.collection.name}
                      </Text>
                      <Text variant="caption" tone="secondary">
                        {item.collection.type} ·{' '}
                        {
                          item.collection.trackIds.filter((trackId) =>
                            Boolean(index.tracks[trackId]),
                          ).length
                        }
                        /{item.collection.trackIds.length} tracks ·{' '}
                        {formatBytes(
                          item.collection.trackIds.reduce(
                            (sum, trackId) => sum + (index.tracks[trackId]?.size ?? 0),
                            0,
                          ),
                        )}
                      </Text>
                    </View>
                    <IconButton
                      label={`Remove download ${item.collection.name}`}
                      size={36}
                      onPress={() =>
                        void run(
                          () => removeCollection(item.collection.id),
                          `Could not remove ${item.collection.name}. Close any playing file and try again.`,
                        )
                      }
                    >
                      <Trash2 size={17} color={theme.colors.textTertiary} />
                    </IconButton>
                  </Surface>
                </View>
              );
            case 'track':
              return (
                <View style={styles.rowWrap}>
                  <PressableScale style={styles.trackRow} haptic={false}>
                    <Artwork coverArt={item.entry.track.coverArt} size={42} radius={7} />
                    <View style={styles.trackText}>
                      <Text variant="callout" numberOfLines={1} style={styles.strong}>
                        {item.entry.track.title}
                      </Text>
                      <Text variant="caption" tone="secondary" numberOfLines={1}>
                        {item.entry.track.artist ?? 'Unknown artist'}
                        {item.entry.track.duration
                          ? ` · ${formatDurationLong(item.entry.track.duration)}`
                          : ''}
                      </Text>
                    </View>
                    <Text variant="caption" tone="tertiary">
                      {formatBytes(item.entry.size)}
                    </Text>
                    <IconButton
                      label={`Remove ${item.entry.track.title} download`}
                      size={34}
                      onPress={() =>
                        void run(
                          () => removeTrack(item.entry.track.id),
                          `Could not remove ${item.entry.track.title}. Close any playing file and try again.`,
                        )
                      }
                    >
                      <Trash2 size={16} color={theme.colors.textTertiary} />
                    </IconButton>
                  </PressableScale>
                </View>
              );
            case 'empty':
              return (
                <EmptyState
                  title="No downloads yet"
                  message="Open an album or playlist and choose Download to keep the original files on this device."
                  icon={<Download size={30} color={theme.colors.textTertiary} />}
                />
              );
          }
        }}
      />
    </Screen>
  );
}


const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  fill: {
    flex: 1,
  },
  headerStack: {
    gap: 16,
    marginBottom: 16,
  },
  rowWrap: {
    marginBottom: 8,
  },
  sectionHeader: {
    gap: 2,
    marginTop: 10,
    marginBottom: 6,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  activeText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  collection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  collectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionText: {
    flex: 1,
    gap: 2,
  },
  strong: {
    fontWeight: '700',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  trackText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
