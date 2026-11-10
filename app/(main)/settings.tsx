import { useRouter } from 'expo-router';
import {
  Cast,
  Check,
  ChevronRight,
  Download,
  Info,
  Keyboard,
  LogOut,
  Palette,
  Radio,
  Server,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Trash2,
} from '@/ui/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TrashPlaylistSheet } from '@/components/TrashPlaylistSheet';
import { usePlaylists } from '@/hooks/useLibrary';
import { refreshExcludedSongIds } from '@/services/exclusions';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import {
  useSettingsStore,
  type DownloadQuality,
  type StreamQuality,
  type SwipeAction,
} from '@/stores/settings';
import type { ChromeRadius } from '@/theme/tokens';
import { serverKey } from '@/core/queryKeys';
import { Input } from '@/ui/Input';
import { Pill } from '@/ui/Pill';
import { ACCENT_PRESETS } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { PressableScale } from '@/ui/PressableScale';
import { Surface } from '@/ui/Surface';
import { Text } from '@/ui/Text';

const QUALITIES: { value: StreamQuality; label: string; hint: string }[] = [
  { value: 'raw', label: 'Original', hint: 'Stream the file as stored (format=raw)' },
  { value: 'opus', label: 'Opus', hint: 'Server transcodes to Opus when available' },
  { value: 'mp3', label: 'MP3', hint: 'Widest compatibility; server transcodes' },
];

const CHROME_SHAPES: { value: ChromeRadius; label: string }[] = [
  { value: 'pill', label: 'Pill' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'soft', label: 'Soft' },
];

const DOWNLOAD_QUALITIES: { value: DownloadQuality; label: string; hint: string }[] = [
  { value: 'original', label: 'Original', hint: 'Download the file exactly as stored' },
  { value: 'opus', label: 'Opus 128', hint: 'Smaller files; server transcodes to Opus' },
  { value: 'mp3', label: 'MP3 192', hint: 'Smaller files; widest compatibility' },
];

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const content = (
    <View style={[styles.row, { borderBottomColor: theme.colors.border }]}>
      {icon}
      <Text variant="callout" style={styles.rowLabel}>
        {label}
      </Text>
      {value ? (
        <Text variant="caption" tone="secondary">
          {value}
        </Text>
      ) : null}
      {onPress ? <ChevronRight size={16} color={theme.colors.textTertiary} /> : null}
    </View>
  );
  return onPress ? (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value ? { text: value } : undefined}
      onPress={onPress}
    >
      {content}
    </PressableScale>
  ) : (
    content
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderLeftColor: theme.colors.accent }]}>
      <View style={styles.sectionHeader}>
        <Icon size={15} color={theme.colors.accent} />
        <Text variant="label" tone="accent">
          {title.toUpperCase()}
        </Text>
      </View>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const setShortcutsOpen = useUIStore((state) => state.setShortcutsOpen);
  const [exclusionState, setExclusionState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );
  const [trashOpen, setTrashOpen] = useState(false);

  const refreshExclusions = async () => {
    if (!server || exclusionState === 'loading') return;
    setExclusionState('loading');
    try {
      await refreshExcludedSongIds(server);
      setExclusionState('done');
      setTimeout(() => setExclusionState('idle'), 2500);
    } catch {
      setExclusionState('error');
    }
  };
  const server = useAuthStore((state) => state.server);
  const logout = useAuthStore((state) => state.logout);
  const quality = useSettingsStore((state) => state.quality);
  const setQuality = useSettingsStore((state) => state.setQuality);
  const showCodecBadge = useSettingsStore((state) => state.showCodecBadge);
  const toggleCodecBadge = useSettingsStore((state) => state.toggleCodecBadge);
  const reduceBlur = useSettingsStore((state) => state.reduceBlur);
  const toggleReduceBlur = useSettingsStore((state) => state.toggleReduceBlur);
  const hubUrl = useSettingsStore((state) => state.hubUrl);
  const setHubUrl = useSettingsStore((state) => state.setHubUrl);
  const [hubInput, setHubInput] = useState(hubUrl);
  const swipeLeftAction = useSettingsStore((state) => state.swipeLeftAction);
  const swipeRightAction = useSettingsStore((state) => state.swipeRightAction);
  const setSwipeAction = useSettingsStore((state) => state.setSwipeAction);
  const continueWithRadio = useSettingsStore((state) => state.continueWithRadio);
  const toggleContinueWithRadio = useSettingsStore((state) => state.toggleContinueWithRadio);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const setAccentColor = useSettingsStore((state) => state.setAccentColor);
  const parallelDownloads = useSettingsStore((state) => state.parallelDownloads);
  const setParallelDownloads = useSettingsStore((state) => state.setParallelDownloads);
  const downloadQuality = useSettingsStore((state) => state.downloadQuality);
  const setDownloadQuality = useSettingsStore((state) => state.setDownloadQuality);
  const chromeRadius = useSettingsStore((state) => state.chromeRadius);
  const setChromeRadius = useSettingsStore((state) => state.setChromeRadius);
  const trashPlaylistIds = useSettingsStore((state) => state.trashPlaylistIds);
  const playlists = usePlaylists();
  const trashPlaylistName = server
    ? playlists.data?.find((playlist) => playlist.id === trashPlaylistIds[serverKey(server)])
        ?.name
    : undefined;
  const [hexInput, setHexInput] = useState(accentColor ?? '');
  const [hexError, setHexError] = useState<string | null>(null);

  const chooseAccent = (color: string | null) => {
    setAccentColor(color);
    setHexInput(color ?? '');
    setHexError(null);
  };

  const applyHex = () => {
    const raw = hexInput.trim();
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
      setHexError('Use a 6-digit hex colour, for example #FA2D48.');
      return;
    }
    setHexError(null);
    setHexInput(normalized.toUpperCase());
    setAccentColor(normalized);
  };

  return (
    <Screen title="Settings" subtitle="Server, sound and local data.">
      <Section title="Account" icon={Server}>
        <Surface style={styles.card} bordered>
          <Row
            icon={<Server size={18} color={theme.colors.textSecondary} />}
            label="Server"
            value={server ? new URL(server.url).host : 'Not connected'}
          />
          <Row
            icon={<Shield size={18} color={theme.colors.textSecondary} />}
            label="Account"
            value={server?.username ?? '—'}
          />
          <Row
            icon={<Info size={18} color={theme.colors.textSecondary} />}
            label="Authentication"
            value={server?.authMode === 'apiKey' ? 'API key' : 'Token + salt'}
          />
          <Row
            icon={<Server size={18} color={theme.colors.textSecondary} />}
            label="Servers and networks"
            value="Manage"
            onPress={() => router.push('/(main)/servers')}
          />
          <Row
            icon={<Cast size={18} color={theme.colors.textSecondary} />}
            label="Devices and Segue"
            value="Manage"
            onPress={() => router.push('/devices')}
          />
        </Surface>
        <Surface style={styles.card} bordered>
        <View style={styles.cardHeader}>
          <Cast size={18} color={theme.colors.accent} />
          <Text variant="headline">Segue hub</Text>
        </View>
        <Text variant="caption" tone="secondary">
          Optional. Laila looks for a hub at /connect/ on your server; set a URL if your
          proxy publishes it elsewhere. Without a hub, device presence falls back to
          Navidrome&apos;s now-playing list.
        </Text>
        <Input
          placeholder="https://music.example.com/connect"
          value={hubInput}
          onChangeText={setHubInput}
          onBlur={() => setHubUrl(hubInput.trim())}
          autoCapitalize="none"
          keyboardType="url"
          containerStyle={styles.hubInput}
        />
      </Surface>
      <Surface style={styles.card} bordered>
        <Text variant="headline">Local data</Text>
        <Text variant="caption" tone="secondary">
          Credentials are stored on this device only. Logging out removes the saved
          session; the queue and settings remain until you clear them.
        </Text>
        <View style={styles.actions}>
          <Button
            label="Switch server"
            variant="secondary"
            icon={<LogOut size={16} color={theme.colors.text} />}
            onPress={() => {
              logout();
              router.replace('/login');
            }}
          />
        </View>
      </Surface>
      </Section>

      <Section title="Playback" icon={SlidersHorizontal}>
        <Surface style={styles.card} bordered>
          <View style={styles.cardHeader}>
            <Radio size={18} color={theme.colors.accent} />
            <Text variant="headline">Queue end</Text>
          </View>
          <Text variant="caption" tone="secondary">
            When the queue ends, keep playing random library songs. Shuffle
            exclusions still apply.
          </Text>
          <Row
            icon={<Radio size={17} color={theme.colors.textSecondary} />}
            label="Continue with radio"
            value={continueWithRadio ? 'On' : 'Off'}
            onPress={toggleContinueWithRadio}
          />
          <Row
            icon={<Shuffle size={18} color={theme.colors.textSecondary} />}
            label="Shuffle exclusions"
            value={
              exclusionState === 'loading'
                ? 'Refreshing…'
                : exclusionState === 'done'
                  ? 'Updated'
                  : exclusionState === 'error'
                    ? 'Failed'
                    : 'Refresh'
            }
            onPress={() => void refreshExclusions()}
          />
          {exclusionState === 'error' ? (
            <ErrorNotice message="Could not refresh shuffle exclusions. Check the server and try again." />
          ) : null}
        </Surface>

        <Surface style={styles.card} bordered>
          <View style={styles.cardHeader}>
            <SlidersHorizontal size={18} color={theme.colors.accent} />
            <Text variant="headline">Streaming quality</Text>
          </View>
          {QUALITIES.map((item) => {
            const selected = quality === item.value;
            return (
              <PressableScale
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${item.label}: ${item.hint}`}
                onPress={() => setQuality(item.value)}
              >
                <View style={[styles.qualityRow, { borderTopColor: theme.colors.border }]}>
                  <View style={styles.qualityText}>
                    <Text variant="callout" tone={selected ? 'accent' : 'primary'}>
                      {item.label}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {item.hint}
                    </Text>
                  </View>
                  {selected ? <Check size={18} color={theme.colors.accent} /> : null}
                </View>
              </PressableScale>
            );
          })}
        </Surface>
        <Surface style={styles.card} bordered>
          <Row
            label="Codec badge in player"
            value={showCodecBadge ? 'On' : 'Off'}
            onPress={toggleCodecBadge}
          />
          <Row
            label="Reduce blur effects"
            value={reduceBlur ? 'On' : 'Off'}
            onPress={toggleReduceBlur}
          />
        </Surface>
      </Section>

      <Section title="Downloads" icon={Download}>
        <Surface style={styles.card} bordered>
          <Row
            icon={<Download size={18} color={theme.colors.textSecondary} />}
            label="Downloads"
            value="Manage"
            onPress={() => router.push('/(main)/downloads')}
          />
        </Surface>
        <Surface style={styles.card} bordered>
          <Text variant="headline">Download quality</Text>
          <Text variant="caption" tone="secondary">
            Quality applies to new downloads; existing files stay as they are.
          </Text>
          <View style={styles.swipeOptions}>
            {DOWNLOAD_QUALITIES.map((item) => {
              const selected = downloadQuality === item.value;
              return (
                <Pill
                  key={item.value}
                  label={item.label}
                  selected={selected}
                  onPress={() => setDownloadQuality(item.value)}
                />
              );
            })}
          </View>
          <Text variant="caption" tone="tertiary">
            {DOWNLOAD_QUALITIES.find((item) => item.value === downloadQuality)?.hint}
          </Text>
          <Text variant="caption" tone="secondary" style={styles.downloadCount}>
            Number of tracks downloaded at the same time:
          </Text>
          <View style={styles.swipeOptions}>
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <Pill
                key={count}
                label={`${count}`}
                selected={parallelDownloads === count}
                onPress={() => setParallelDownloads(count)}
              />
            ))}
          </View>
        </Surface>
      </Section>

      <Section title="Appearance" icon={Palette}>

      <Surface style={styles.card} bordered>
        <Text variant="headline">Player and tab shape</Text>
        <Text variant="caption" tone="secondary">
          Shared corner radius for the compact mini player and the floating bottom tabs.
        </Text>
        <View style={styles.swipeOptions}>
          {CHROME_SHAPES.map((item) => (
            <Pill
              key={item.value}
              label={item.label}
              selected={chromeRadius === item.value}
              onPress={() => setChromeRadius(item.value)}
            />
          ))}
        </View>
      </Surface>

      <Surface style={styles.card} bordered>
        <Text variant="headline">Accent colour</Text>
        <Text variant="caption" tone="secondary">
          Artwork follows the current cover. A custom colour keeps its contrast on
          buttons and text.
        </Text>
        <View style={styles.swipeOptions}>
          <Pill
            label="Artwork"
            selected={accentColor === null}
            onPress={() => chooseAccent(null)}
            icon={
              <View
                style={[styles.swipeDot, { backgroundColor: theme.colors.accent }]}
              />
            }
          />
          {ACCENT_PRESETS.map((preset) => (
            <Pill
              key={preset.value}
              label={preset.name}
              selected={accentColor === preset.value}
              onPress={() => chooseAccent(preset.value)}
              icon={
                <View style={[styles.swipeDot, { backgroundColor: preset.value }]} />
              }
            />
          ))}
        </View>
        <Input
          containerStyle={styles.hexField}
          placeholder="#FA2D48"
          value={hexInput}
          onChangeText={(value) => {
            setHexInput(value);
            setHexError(null);
          }}
          onSubmitEditing={applyHex}
          autoCapitalize="characters"
          maxLength={7}
          accessibilityLabel="Custom accent hex colour"
          error={hexError ?? undefined}
          hint="Any 6-digit hex colour; contrast is corrected automatically."
        />
        <Button
          label="Apply colour"
          variant="secondary"
          size="sm"
          onPress={applyHex}
          style={styles.hexButton}
        />
      </Surface>

      </Section>

      <Section title="Library & queue" icon={Shuffle}>

      <Surface style={styles.card} bordered>
        <Text variant="headline">Swipe actions on tracks</Text>
        <Text variant="caption" tone="secondary">
          Swipe right on a song to reveal the left action; swipe left to reveal the right
          one. The action is applied when you pass the threshold.
        </Text>
        <SwipeActionPicker
          label="Swipe right"
          value={swipeRightAction}
          onChange={(action) => setSwipeAction('right', action)}
        />
        <SwipeActionPicker
          label="Swipe left"
          value={swipeLeftAction}
          onChange={(action) => setSwipeAction('left', action)}
        />
      </Surface>

      <Surface style={styles.card} bordered>
        <View style={styles.cardHeader}>
          <Trash2 size={18} color={theme.colors.accent} />
          <Text variant="headline">Queue trash</Text>
        </View>
        <Text variant="caption" tone="secondary">
          Swipe left on a queue row to move it to Trash. The playlist is automatically
          excluded from shuffle and radio.
        </Text>
        <Row
          icon={<Trash2 size={17} color={theme.colors.textSecondary} />}
          label="Trash playlist"
          value={trashPlaylistName ?? 'Not set'}
          onPress={() => setTrashOpen(true)}
        />
      </Surface>

      </Section>

      <Section title="About" icon={Keyboard}>
        <Surface style={styles.card} bordered>
          <Row
            icon={<Keyboard size={18} color={theme.colors.textSecondary} />}
            label="Keyboard shortcuts"
            value="View"
            onPress={() => setShortcutsOpen(true)}
          />
        </Surface>

        {process.env.NODE_ENV !== 'production' ? (
          <Surface style={styles.card} bordered>
            <Row
              label="Component gallery"
              value="Developer"
              onPress={() => router.push('/gallery' as never)}
            />
          </Surface>
        ) : null}


      </Section>

      <Text variant="caption" tone="tertiary" style={styles.version}>
        Laila 0.1.0 · made for self-hosted music
      </Text>

      <TrashPlaylistSheet visible={trashOpen} onClose={() => setTrashOpen(false)} />
    </Screen>
  );
}

const SWIPE_ACTIONS: { value: SwipeAction; label: string }[] = [
  { value: 'playNext', label: 'Add to next' },
  { value: 'addToQueue', label: 'Add to queue' },
  { value: 'download', label: 'Download' },
  { value: 'none', label: 'None' },
];

function SwipeActionPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SwipeAction;
  onChange: (action: SwipeAction) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.swipeRow}>
      <Text variant="caption" tone="secondary" style={styles.swipeLabel}>
        {label}
      </Text>
      <View style={styles.swipeOptions}>
        {SWIPE_ACTIONS.map((action) => (
          <Pill
            key={action.value}
            label={action.label}
            selected={value === action.value}
            onPress={() => onChange(action.value)}
            icon={
              value === action.value ? (
                <View style={[styles.swipeDot, { backgroundColor: theme.colors.background }]} />
              ) : undefined
            }
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 18,
  },
  section: {
    borderLeftWidth: 2,
    paddingLeft: 12,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderBottomWidth: 1,
  },
  rowLabel: {
    flex: 1,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  qualityText: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  hubInput: {
    marginTop: 6,
  },
  hexField: {
    marginTop: 12,
  },
  hexButton: {
    marginTop: 8,
  },
  swipeRow: {
    gap: 6,
    marginTop: 8,
  },
  swipeLabel: {
    fontWeight: '600',
  },
  swipeOptions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  downloadCount: {
    marginTop: 8,
  },
  swipeDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  version: {
    textAlign: 'center',
    marginTop: 8,
  },
});
