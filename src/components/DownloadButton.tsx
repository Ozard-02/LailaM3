import { Check, Download, Pause, X } from '@/ui/icons';
import { Platform, StyleSheet, View } from 'react-native';
import { useLiveProgressSum } from '@/stores/downloadProgress';
import { useOfflineStore } from '@/stores/offline';
import { useFreeSpace } from '@/hooks/useFreeSpace';
import { formatBytes } from '@/utils/format';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { ProgressBar } from '@/ui/ProgressBar';
import { Text } from '@/ui/Text';

export interface DownloadButtonProps {
  trackIds: string[];
  label: string;
  onDownload: () => void;
  downloadedLabel?: string;
  estimatedBytes?: number;
}

export function DownloadButton({
  trackIds,
  label,
  onDownload,
  downloadedLabel = 'Downloaded',
  estimatedBytes,
}: DownloadButtonProps) {
  const theme = useTheme();
  const freeBytes = useFreeSpace();
  const index = useOfflineStore((state) => state.index);
  const downloads = useOfflineStore((state) => state.downloads);
  const cancel = useOfflineStore((state) => state.cancel);
  const liveProgress = useLiveProgressSum(trackIds);

  if (Platform.OS === 'web') return null;

  const downloadedCount = trackIds.filter((id) => Boolean(index.tracks[id])).length;
  const overallProgress =
    trackIds.length > 0
      ? Math.min(1, (downloadedCount + liveProgress) / trackIds.length)
      : 0;
  const activeIds = trackIds.filter(
    (id) => downloads[id]?.status === 'downloading' || downloads[id]?.status === 'queued',
  );

  if (trackIds.length > 0 && downloadedCount === trackIds.length) {
    return (
      <Button
        label={downloadedLabel}
        variant="ghost"
        icon={<Check size={16} color={theme.colors.success} />}
        disabled
      />
    );
  }

  const sizeLabel = estimatedBytes ? formatBytes(estimatedBytes) : null;
  const insufficient =
    estimatedBytes !== undefined &&
    freeBytes !== null &&
    estimatedBytes > freeBytes;

  if (insufficient) {
    return (
      <View style={styles.insufficient}>
        <Button
          label="Not enough space"
          variant="secondary"
          icon={<Download size={15} color={theme.colors.danger} />}
          disabled
        />
        <Text variant="caption" tone="danger">
          {sizeLabel} needed · {formatBytes(freeBytes)} free
        </Text>
      </View>
    );
  }

  if (activeIds.length > 0) {
    return (
      <View style={[styles.downloading, { borderColor: theme.colors.border, borderRadius: theme.radius.pill }]}>
        <Download size={15} color={theme.colors.textSecondary} />
        <View style={styles.progress}>
          <ProgressBar label="Download progress" value={overallProgress} max={1} height={3} />
        </View>
        <Text variant="caption" tone="secondary">
          {downloadedCount}/{trackIds.length} · {Math.round(overallProgress * 100)}%
        </Text>
        <IconButton label="Cancel download" size={28} onPress={() => activeIds.forEach((id) => cancel(id))}>
          <X size={14} color={theme.colors.textTertiary} />
        </IconButton>
      </View>
    );
  }

  const paused = trackIds.some((id) => downloads[id]?.status === 'paused');
  return (
    <Button
      label={
        paused
          ? sizeLabel
            ? `Resume · ${sizeLabel}`
            : 'Resume download'
          : sizeLabel
            ? `${label} · ${sizeLabel}`
            : label
      }
      variant="secondary"
      icon={paused ? <Pause size={15} color={theme.colors.text} /> : <Download size={15} color={theme.colors.text} />}
      onPress={onDownload}
    />
  );
}

const styles = StyleSheet.create({
  downloading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 2,
    height: 40,
    maxWidth: 230,
  },
  progress: {
    flex: 1,
  },
  insufficient: {
    gap: 4,
  },
});
