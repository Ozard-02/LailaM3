import { useRouter } from 'expo-router';
import {
  Cast,
  Check,
  ChevronDown,
  Circle,
  Laptop,
  Pause,
  Play,
  Radio,
  RefreshCw,
  SkipBack,
  SkipForward,
  Smartphone,
  Speaker,
  Volume2,
  WifiOff,
} from '@/ui/icons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { handoffCandidate } from '@/core/segue/handoff';
import type { SegueDevice } from '@/core/segue/types';
import { useAuthStore } from '@/stores/auth';
import { useCastStore } from '@/stores/cast';
import { useEffectiveOffline } from '@/stores/offline';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { useSegueStore } from '@/stores/segue';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Input';
import { PressableScale } from '@/ui/PressableScale';
import { ProgressBar } from '@/ui/ProgressBar';
import { Surface } from '@/ui/Surface';
import { Text } from '@/ui/Text';

function DeviceIcon({ device }: { device: SegueDevice }) {
  const theme = useTheme();
  const name = `${device.name} ${device.client ?? ''}`.toLowerCase();
  const Icon = name.includes('tv') ? Cast : name.includes('web') || name.includes('laptop') ? Laptop : Smartphone;
  return <Icon size={20} color={device.online ? theme.colors.text : theme.colors.textTertiary} />;
}

function statusLabel(device: SegueDevice): string {
  if (!device.online) return 'Offline';
  const state = device.state;
  if (!state) return 'Online';
  if (state.status === 'playing') return 'Playing';
  if (state.status === 'paused') return 'Paused';
  return 'Stopped';
}

function currentTitle(device: SegueDevice): string | undefined {
  const state = device.state;
  if (!state?.queue?.length) return undefined;
  const index = state.index ?? 0;
  return state.queue[index]?.title;
}

export default function DevicesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = useSegueStore((state) => state.status);
  const hub = useSegueStore((state) => state.hub);
  const user = useSegueStore((state) => state.user);
  const deviceId = useSegueStore((state) => state.deviceId);
  const deviceName = useSegueStore((state) => state.deviceName);
  const setDeviceName = useSegueStore((state) => state.setDeviceName);
  const devices = useSegueStore((state) => state.devices);
  const storedLastPlayback = useSegueStore((state) => state.lastPlayback);
  const error = useSegueStore((state) => state.error);
  const polling = useSegueStore((state) => state.polling);
  const server = useAuthStore((state) => state.server);
  const transferTo = useSegueStore((state) => state.transferTo);
  const transferHere = useSegueStore((state) => state.transferHere);
  const sendCommand = useSegueStore((state) => state.sendCommand);
  const renderers = useCastStore((state) => state.renderers);
  const scanningSpeakers = useCastStore((state) => state.scanning);
  const speakersScanned = useCastStore((state) => state.scanned);
  const speakerError = useCastStore((state) => state.error);
  const scanSpeakers = useCastStore((state) => state.scan);
  const castTarget = usePlayerStore((state) => state.castTarget);
  const castTo = usePlayerStore((state) => state.castTo);
  const stopCast = usePlayerStore((state) => state.stopCast);
  const playerError = usePlayerStore((state) => state.error);
  const track = useCurrentTrack();
  const offline = useEffectiveOffline();
  const hubUrl = useSettingsStore((state) => state.hubUrl);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(deviceName);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void scanSpeakers();
  }, [scanSpeakers]);

  const others = Object.values(devices).filter(
    (device) => device.id !== deviceId && device.online,
  );
  // Fall back to a live playing device when the hub has no lastPlayback record
  // (e.g. after a restart) so the Continue here card stays useful.
  const lastPlayback = handoffCandidate(
    storedLastPlayback,
    deviceId,
    { status: 'idle' },
    devices,
  );
  const connected = status === 'connected';
  const connectionLabel =
    status === 'connected'
      ? `Connected${user ? ` as ${user}` : ''}`
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'nohub'
          ? 'No hub configured'
          : status === 'error'
            ? 'Connection error'
            : 'Not connected';

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <IconButton label="Close devices" size={42} variant="soft" onPress={() => router.back()}>
          <ChevronDown size={22} color={theme.colors.text} />
        </IconButton>
        <View style={styles.headerText}>
          <Text variant="title">Devices</Text>
          <Text variant="caption" tone="secondary">
            {connectionLabel}
          </Text>
        </View>
        <IconButton
          label="Reconnect devices"
          size={40}
          onPress={() => {
            if (server) {
              void useSegueStore
                .getState()
                .connect(server, hubUrl || undefined)
                .catch(() => undefined);
            }
          }}
        >
          <RefreshCw size={18} color={theme.colors.textSecondary} />
        </IconButton>
      </View>

      <View style={styles.content}>
        <Surface style={styles.card} bordered>
          <View style={styles.thisDevice}>
            <View style={[styles.deviceMark, { backgroundColor: theme.colors.accentSoft }]}>
              <Radio size={20} color={theme.colors.accent} />
            </View>
            <View style={styles.deviceText}>
              <Text variant="callout" style={styles.strong}>
                This device
              </Text>
              {editingName ? (
                <View style={styles.nameRow}>
                  <Input
                    value={name}
                    onChangeText={setName}
                    placeholder="Device name"
                    containerStyle={styles.nameInput}
                  />
                  <IconButton
                    label="Save device name"
                    size={34}
                    onPress={() => {
                      setDeviceName(name);
                      setEditingName(false);
                    }}
                  >
                    <Check size={16} color={theme.colors.accent} />
                  </IconButton>
                </View>
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Rename this device"
                  onPress={() => setEditingName(true)}
                >
                  <Text variant="caption" tone="secondary">
                    {deviceName} · tap to rename
                  </Text>
                </PressableScale>
              )}
            </View>
            {connected ? (
              <View style={styles.onlineDot}>
                <Circle size={8} color={theme.colors.success} fill={theme.colors.success} />
              </View>
            ) : null}
          </View>
          <View style={[styles.metaRow, { borderTopColor: theme.colors.border }]}>
            <Text variant="caption" tone="tertiary">
              Hub
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.metaValue}>
              {hub ? new URL(hub.wsUrl).host : 'Not found'}
            </Text>
          </View>
          {polling ? (
            <View style={styles.notice}>
              <WifiOff size={15} color={theme.colors.warning} />
              <Text variant="caption" tone="secondary" style={styles.noticeText}>
                No Segue hub. Showing devices from Navidrome&apos;s now-playing list; transfer
                needs a hub.
              </Text>
            </View>
          ) : null}
          {error ? <ErrorNotice message={error} /> : null}
        </Surface>

        {lastPlayback && lastPlayback.deviceId !== deviceId ? (
          <Surface style={styles.card} bordered>
            <Text variant="headline">Last playback</Text>
            <Text variant="caption" tone="secondary">
              {lastPlayback.deviceName}
              {lastPlayback.state.queue?.[lastPlayback.state.index ?? 0]?.title
                ? ` · ${lastPlayback.state.queue[lastPlayback.state.index ?? 0]?.title}`
                : ''}
            </Text>
            <Button
              label="Continue here"
              onPress={() => transferHere(lastPlayback.deviceId || undefined)}
              disabled={!connected}
              style={styles.continueButton}
            />
          </Surface>
        ) : null}

        <View style={styles.listHeader}>
          <Text variant="headline">Speakers on Wi-Fi</Text>
          {Platform.OS === 'web' ? null : (
            <IconButton
              label="Scan for speakers"
              size={34}
              onPress={() => void scanSpeakers({ force: true })}
            >
              <RefreshCw size={16} color={theme.colors.textSecondary} />
            </IconButton>
          )}
        </View>

        {Platform.OS === 'web' ? (
          <Surface style={styles.card} bordered>
            <Text variant="caption" tone="secondary">
              Speaker discovery runs in the Android app; browsers cannot send SSDP multicast
              packets.
            </Text>
          </Surface>
        ) : renderers.length ? (
          renderers.map((renderer) => {
            const active = castTarget?.id === renderer.id;
            const detail = [renderer.manufacturer, renderer.model]
              .filter(Boolean)
              .join(' · ');
            return (
              <Surface key={renderer.id} style={styles.deviceCard} bordered>
                <View style={styles.deviceRow}>
                  <View style={styles.deviceIcon}>
                    <Speaker
                      size={20}
                      color={active ? theme.colors.accent : theme.colors.text}
                    />
                  </View>
                  <View style={styles.deviceText}>
                    <Text variant="callout" style={styles.strong} numberOfLines={1}>
                      {renderer.name}
                    </Text>
                    <Text variant="caption" tone="secondary" numberOfLines={1}>
                      {detail || 'DLNA renderer'}
                      {active ? ' · Casting' : ''}
                    </Text>
                  </View>
                  <Button
                    label={active ? 'Stop' : 'Play on'}
                    size="sm"
                    variant="secondary"
                    disabled={!active && (!track || offline)}
                    onPress={() => {
                      if (active) void stopCast();
                      else void castTo(renderer);
                    }}
                  />
                </View>
              </Surface>
            );
          })
        ) : (
          <Surface style={styles.card} bordered>
            <Text variant="caption" tone="secondary">
              {scanningSpeakers
                ? 'Scanning your Wi-Fi for speakers…'
                : (speakerError ??
                  (speakersScanned
                    ? 'No DLNA speakers found. Check that the speaker is on the same Wi-Fi.'
                    : 'Scanning…'))}
            </Text>
          </Surface>
        )}

        {playerError ? (
          <Text variant="caption" tone="danger">
            {playerError}
          </Text>
        ) : null}

        <View style={styles.listHeader}>
          <Text variant="headline">Other devices</Text>
          <Text variant="caption" tone="tertiary">
            {others.length} visible
          </Text>
        </View>

        {others.length ? (
          others.map((device) => {
            const title = currentTitle(device);
            const capabilities = device.capabilities ?? [];
            const isPlayer = Boolean(device.roles?.includes('player'));
            const canPrevious = capabilities.includes('previous');
            const canNext = capabilities.includes('next');
            const canToggle =
              capabilities.includes('toggle') ||
              (capabilities.includes('play') && capabilities.includes('pause'));
            const hasVolume = capabilities.includes('setVolume');
            const isPlaying = device.state?.status === 'playing';
            const volume =
              typeof device.state?.volume === 'number' ? device.state.volume : 0;
            const toggleAction = capabilities.includes('toggle')
              ? 'toggle'
              : isPlaying
                ? 'pause'
                : 'play';
            return (
              <Surface key={device.id} style={styles.deviceCard} bordered>
                <View style={styles.deviceRow}>
                  <View style={styles.deviceIcon}>
                    <DeviceIcon device={device} />
                  </View>
                  <View style={styles.deviceText}>
                    <Text variant="callout" style={styles.strong} numberOfLines={1}>
                      {device.name}
                    </Text>
                    <Text variant="caption" tone="secondary" numberOfLines={1}>
                      {statusLabel(device)}
                      {title ? ` · ${title}` : ''}
                    </Text>
                  </View>
                  {connected ? (
                    <View style={styles.actions}>
                      {device.roles?.includes('player') ? (
                        <Button
                          label="Play on"
                          size="sm"
                          variant="secondary"
                          onPress={() => transferTo(device.id)}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
                {connected && isPlayer && (canPrevious || canToggle || canNext) ? (
                  <View style={styles.transportRow}>
                    {canPrevious ? (
                      <IconButton
                        label={`Previous track on ${device.name}`}
                        size={36}
                        onPress={() => sendCommand(device.id, { action: 'previous' })}
                      >
                        <SkipBack
                          size={18}
                          color={theme.colors.text}
                          fill={theme.colors.text}
                        />
                      </IconButton>
                    ) : null}
                    {canToggle ? (
                      <IconButton
                        label={`${isPlaying ? 'Pause' : 'Play'} ${device.name}`}
                        size={44}
                        variant="soft"
                        onPress={() =>
                          sendCommand(device.id, { action: toggleAction })
                        }
                      >
                        {isPlaying ? (
                          <Pause
                            size={20}
                            color={theme.colors.text}
                            fill={theme.colors.text}
                          />
                        ) : (
                          <Play
                            size={20}
                            color={theme.colors.text}
                            fill={theme.colors.text}
                          />
                        )}
                      </IconButton>
                    ) : null}
                    {canNext ? (
                      <IconButton
                        label={`Next track on ${device.name}`}
                        size={36}
                        onPress={() => sendCommand(device.id, { action: 'next' })}
                      >
                        <SkipForward
                          size={18}
                          color={theme.colors.text}
                          fill={theme.colors.text}
                        />
                      </IconButton>
                    ) : null}
                  </View>
                ) : null}
                {connected && isPlayer && hasVolume ? (
                  <View style={styles.volumeRow}>
                    <Volume2 size={16} color={theme.colors.textTertiary} />
                    <View style={styles.volumeSlider}>
                      <ProgressBar
                        label={`Volume for ${device.name}`}
                        value={volume}
                        max={100}
                        height={4}
                        showThumb
                        formatValue={(value) => `${Math.round(value)}`}
                        onSeek={(value) =>
                          sendCommand(device.id, {
                            action: 'setVolume',
                            volume: Math.round(value),
                          })
                        }
                      />
                    </View>
                    <Text variant="caption" tone="tertiary">
                      {Math.round(volume)}
                    </Text>
                  </View>
                ) : null}
              </Surface>
            );
          })
        ) : (
          <EmptyState
            title="No other devices"
            message={
              connected
                ? 'Open Laila on another device with the same account, or play something in another Segue app.'
                : 'Configure a Segue hub next to Navidrome to see and control your other devices instantly.'
            }
            icon={<Cast size={30} color={theme.colors.textTertiary} />}
          />
        )}
      </View>
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
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: 14,
  },
  card: {
    padding: 16,
    gap: 8,
  },
  thisDevice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  strong: {
    fontWeight: '700',
  },
  onlineDot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameInput: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
  },
  notice: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  noticeText: {
    flex: 1,
  },
  continueButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  deviceCard: {
    padding: 12,
    gap: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceIcon: {
    width: 36,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  commandRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 48,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingTop: 8,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
  },
  volumeSlider: {
    flex: 1,
  },
});
