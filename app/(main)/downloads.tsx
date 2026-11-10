import { Download, HardDrive, Pause, Play, Trash2, WifiOff, X } from '@/ui/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { DownloadEntry } from '@/core/offline';
import { Screen } from '@/components/Screen';
import { useDownloadProgress } from '@/stores/downloadProgress';
import { useEffectiveOffline, useOfflineStore } from '@/stores/offline';
import { useSettingsStore } from '@/stores/settings';
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
  const downloads = useOfflineStore((state) => state.downloads);
  const freeBytes = useFreeSpace();
  const downloadQuality = useSettingsStore((state) => state.downloadQuality);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, message: string) => {
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(message);
    }
  };

  const collections = Object.values(index.collections);
  const tracks = Object.values(index.tracks);
  const collectionTrackIds = new Set(collections.flatMap((collection) => collection.trackIds));
  const looseTracks = tracks.filter((entry) => !collectionTrackIds.has(entry.track.id));
  const activeDownloads = Object.values(downloads).filter((entry) => entry.status !== 'done');
  const total = tracks.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <Screen
      title="Downloads"
      subtitle="Original files, kept on this device."
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
              void run(clearAll, 'Could not clear all downloads. Close any playing file and try again.')
            }
          />
        ) : null}
      </Surface>

      <Text variant="caption" tone="tertiary">
        Offline mode keeps Home and Library on downloaded music only. It is enabled
        automatically when the device has no network.
      </Text>
      {actionError ? <ErrorNotice message={actionError} /> : null}

      {activeDownloads.length ? (
        <View style={styles.section}>
          <Text variant="headline">Downloading</Text>
          {activeDownloads.map((entry) => (
            <ActiveDownloadRow key={entry.track.id} entry={entry} />
          ))}
        </View>
      ) : null}

      {collections.length ? (
        <View style={styles.section}>
          <Text variant="headline">Collections</Text>
          {collections.map((collection) => (
            <Surface key={collection.id} style={styles.collection} bordered>
              {collection.coverArt ? (
                <Artwork coverArt={collection.coverArt} size={42} radius={7} />
              ) : (
                <View style={[styles.collectionIcon, { backgroundColor: theme.colors.elevated2 }]}>
                  <Download size={18} color={theme.colors.textSecondary} />
                </View>
              )}
              <View style={styles.collectionText}>
                <Text variant="callout" style={styles.strong} numberOfLines={1}>
                  {collection.name}
                </Text>
                <Text variant="caption" tone="secondary">
                  {collection.type} ·{' '}
                  {collection.trackIds.filter((trackId) => Boolean(index.tracks[trackId])).length}/
                  {collection.trackIds.length} tracks
                </Text>
              </View>
              <IconButton
                label={`Remove download ${collection.name}`}
                size={36}
                onPress={() =>
                  void run(
                    () => removeCollection(collection.id),
                    `Could not remove ${collection.name}. Close any playing file and try again.`,
                  )
                }
              >
                <Trash2 size={17} color={theme.colors.textTertiary} />
              </IconButton>
            </Surface>
          ))}
        </View>
      ) : null}

      {looseTracks.length ? (
        <View style={styles.section}>
          <Text variant="headline">Tracks</Text>
          <Text variant="caption" tone="tertiary">
            Tracks that are not part of a downloaded album or playlist.
          </Text>
          {looseTracks.map((entry) => (
            <PressableScale key={entry.track.id} style={styles.trackRow} haptic={false}>
              <Artwork coverArt={entry.track.coverArt} size={42} radius={7} />
              <View style={styles.trackText}>
                <Text variant="callout" numberOfLines={1} style={styles.strong}>
                  {entry.track.title}
                </Text>
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {entry.track.artist ?? 'Unknown artist'}
                  {entry.track.duration ? ` · ${formatDurationLong(entry.track.duration)}` : ''}
                </Text>
              </View>
              <Text variant="caption" tone="tertiary">
                {formatBytes(entry.size)}
              </Text>
              <IconButton
                label={`Remove ${entry.track.title} download`}
                size={34}
                onPress={() =>
                  void run(
                    () => removeTrack(entry.track.id),
                    `Could not remove ${entry.track.title}. Close any playing file and try again.`,
                  )
                }
              >
                <Trash2 size={16} color={theme.colors.textTertiary} />
              </IconButton>
            </PressableScale>
          ))}
        </View>
      ) : null}

      {!tracks.length && !collections.length && !activeDownloads.length ? (
        <EmptyState
          title="No downloads yet"
          message="Open an album or playlist and choose Download to keep the original files on this device."
          icon={<Download size={30} color={theme.colors.textTertiary} />}
        />
      ) : null}
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
  section: {
    gap: 8,
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
