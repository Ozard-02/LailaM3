import { useRouter } from 'expo-router';
import {
  Cast,
  Check,
  ChevronDown,
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
  type ThemePreference,
} from '@/stores/settings';
import type { ChromeRadius } from '@/theme/tokens';
import type { PerformanceModeSetting } from '@/core/device-tier';
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

const THEME_PREFERENCES: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const PERFORMANCE_MODES: { value: PerformanceModeSetting; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const GB = 1024 ** 3;
const OFFLINE_LIMITS: { value: number | null; label: string }[] = [
  { value: null, label: 'Off' },
  { value: 5 * GB, label: '5 GB' },
  { value: 10 * GB, label: '10 GB' },
  { value: 25 * GB, label: '25 GB' },
  { value: 50 * GB, label: '50 GB' },
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
  open,
  onToggle,
  summary,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  open: boolean;
  onToggle: () => void;
  summary?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderLeftColor: theme.colors.accent }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        accessibilityLabel={`${title} section`}
        accessibilityHint={open ? 'Collapse section' : 'Expand section'}
        haptic={false}
        onPress={onToggle}
        style={styles.sectionHeader}
      >
        <View style={styles.sectionHeaderMain}>
          <Icon size={15} color={theme.colors.accent} />
          <Text variant="label" tone="accent">
            {title.toUpperCase()}
          </Text>
        </View>
        {!open && summary ? (
          <Text
            variant="caption"
            tone="tertiary"
            numberOfLines={1}
            style={styles.sectionSummary}
          >
            {summary}
          </Text>
        ) : null}
        {open ? (
          <ChevronDown size={16} color={theme.colors.textTertiary} />
        ) : (
          <ChevronRight size={16} color={theme.colors.textTertiary} />
        )}
      </PressableScale>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
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
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, boolean>>({});
  // Keep the familiar all-open page by default; collapsing is an opt-in way to
  // shorten it. This also keeps every control reachable on small screens.
  const sectionOpen = (id: string) => sectionOverrides[id] ?? true;
  const toggleSection = (id: string) => {
    setSectionOverrides((current) => ({
      ...current,
      [id]: !(current[id] ?? true),
    }));
  };

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
  const performanceModeSetting = useSettingsStore((state) => state.performanceMode);
  const setPerformanceMode = useSettingsStore((state) => state.setPerformanceMode);
  const themePreference = useSettingsStore((state) => state.themePreference);
  const setThemePreference = useSettingsStore((state) => state.setThemePreference);
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
  const offlineLimitBytes = useSettingsStore((state) => state.offlineLimitBytes);
  const setOfflineLimit = useSettingsStore((state) => state.setOfflineLimit);
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

  const qualityLabel = QUALITIES.find((item) => item.value === quality)?.label ?? quality;
  const downloadQualityLabel =
    DOWNLOAD_QUALITIES.find((item) => item.value === downloadQuality)?.label ??
    downloadQuality;
  const offlineLimitLabel =
    OFFLINE_LIMITS.find((item) => item.value === offlineLimitBytes)?.label ?? 'Off';
  const shapeLabel =
    CHROME_SHAPES.find((item) => item.value === chromeRadius)?.label ?? chromeRadius;
  const themeLabel =
    THEME_PREFERENCES.find((item) => item.value === themePreference)?.label ?? 'Dark';
  const accentLabel = accentColor
    ? ACCENT_PRESETS.find((preset) => preset.value === accentColor)?.name ?? 'Custom'
    : 'Artwork';
  const swipeLeftLabel =
    SWIPE_ACTIONS.find((action) => action.value === swipeLeftAction)?.label ?? 'None';
  const swipeRightLabel =
    SWIPE_ACTIONS.find((action) => action.value === swipeRightAction)?.label ?? 'None';
  const accountSummary = server
    ? `${new URL(server.url).host}${server.username ? ` · ${server.username}` : ''}`
    : 'Not connected';
  const playbackSummary = `${qualityLabel} · radio ${continueWithRadio ? 'on' : 'off'}`;
  const downloadsSummary = `${downloadQualityLabel} · ${parallelDownloads} parallel · ${offlineLimitLabel}`;
  const appearanceSummary = `${themeLabel} · ${shapeLabel} · ${accentLabel}${
    theme.performanceMode ? ' · Performance' : ''
  }`;
  const gesturesSummary = `${swipeLeftLabel} / ${swipeRightLabel}${
    trashPlaylistName ? ` · ${trashPlaylistName}` : ''
  }`;
  const aboutSummary = 'Laila 0.1.0';

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
      <Section
        title="Account"
        icon={Server}
        open={sectionOpen('account')}
        onToggle={() => toggleSection('account')}
        summary={accountSummary}
      >
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

      <Section
        title="Playback"
        icon={SlidersHorizontal}
        open={sectionOpen('playback')}
        onToggle={() => toggleSection('playback')}
        summary={playbackSummary}
      >
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
        </Surface>
      </Section>

      <Section
        title="Downloads"
        icon={Download}
        open={sectionOpen('downloads')}
        onToggle={() => toggleSection('downloads')}
        summary={downloadsSummary}
      >
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
          <Text variant="caption" tone="secondary" style={styles.downloadCount}>
            Local download budget:
          </Text>
          <View style={styles.swipeOptions}>
            {OFFLINE_LIMITS.map((item) => (
              <Pill
                key={item.label}
                label={item.label}
                selected={offlineLimitBytes === item.value}
                onPress={() => setOfflineLimit(item.value)}
              />
            ))}
          </View>
          <Text variant="caption" tone="tertiary">
            Use Free up space in Downloads to drop the oldest files; the current queue is
            kept.
          </Text>
        </Surface>
      </Section>

      <Section
        title="Appearance"
        icon={Palette}
        open={sectionOpen('appearance')}
        onToggle={() => toggleSection('appearance')}
        summary={appearanceSummary}
      >

      <Surface testID="theme-preference" style={styles.card} bordered>
        <Text variant="headline">Theme</Text>
        <Text variant="caption" tone="secondary">
          Dark is the default and stays on even when the device is in light mode.
          System follows the device appearance.
        </Text>
        <View style={styles.swipeOptions}>
          {THEME_PREFERENCES.map((item) => (
            <Pill
              key={item.value}
              label={item.label}
              selected={themePreference === item.value}
              onPress={() => setThemePreference(item.value)}
            />
          ))}
        </View>
      </Surface>

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

      <Surface testID="performance-mode" style={styles.card} bordered>
        <Text variant="headline">Performance mode</Text>
        <Text variant="caption" tone="secondary">
          Cuts blur, motion and high-resolution artwork on very weak devices. Auto turns
          it on when the device has 2 GB of RAM or less.
        </Text>
        <View style={styles.swipeOptions}>
          {PERFORMANCE_MODES.map((item) => (
            <Pill
              key={item.value}
              label={item.label}
              selected={performanceModeSetting === item.value}
              onPress={() => setPerformanceMode(item.value)}
            />
          ))}
        </View>
        <Text variant="caption" tone="tertiary">
          {performanceModeSetting === 'auto'
            ? theme.performanceMode
              ? 'Auto: on — this device has 2 GB of RAM or less.'
              : 'Auto: off — this device does not need it.'
            : theme.performanceMode
              ? 'On — reduced visuals and no backdrop blur.'
              : 'Off — the full visual experience.'}
        </Text>
      </Surface>

      {!theme.performanceMode ? (
        <Surface style={styles.card} bordered>
          <Row
            label="Reduce blur effects"
            value={reduceBlur ? 'On' : 'Off'}
            onPress={toggleReduceBlur}
          />
        </Surface>
      ) : null}

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

      <Section
        title="Gestures & queue"
        icon={Shuffle}
        open={sectionOpen('gestures')}
        onToggle={() => toggleSection('gestures')}
        summary={gesturesSummary}
      >

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

      <Section
        title="About"
        icon={Keyboard}
        open={sectionOpen('about')}
        onToggle={() => toggleSection('about')}
        summary={aboutSummary}
      >
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
    minHeight: 44,
    paddingVertical: 4,
  },
  sectionHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  sectionSummary: {
    flex: 1,
    textAlign: 'right',
  },
  sectionBody: {
    gap: 12,
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
