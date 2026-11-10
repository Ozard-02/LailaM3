import { Platform } from 'react-native';
import { create } from 'zustand';
import type { ServerConfig } from '@/core/models';
import { getNowPlaying } from '@/core/subsonic/client';
import { SegueClient } from '@/core/segue/client';
import { discoverSegue } from '@/core/segue/discovery';
import { shouldPlayTransferredQueue } from '@/core/segue/commands';
import { fromSegueState, toSegueState } from '@/core/segue/state';
import { logger } from '@/core/utils/logger';
import type {
  SegueCommandAction,
  SegueConnectionInfo,
  SegueDevice,
  SegueLastPlayback,
  SeguePlayerState,
} from '@/core/segue/types';
import { kvStore } from '@/services/storage';
import { useAuthStore } from './auth';
import { usePlayerStore } from './player';
import { useSettingsStore } from './settings';

const DEVICE_ID_KEY = 'laila.deviceId';
const DEVICE_NAME_KEY = 'laila.deviceName';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `laila-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function defaultDeviceName(): string {
  if (Platform.OS === 'web') return 'Laila Web';
  if (Platform.OS === 'android') {
    const model = (Platform.constants as { Model?: string } | undefined)?.Model;
    return model ? `Laila · ${model}` : 'Laila Android';
  }
  return 'Laila';
}

type SegueStatus = 'idle' | 'connecting' | 'connected' | 'nohub' | 'error' | 'disconnected';

interface SegueState {
  status: SegueStatus;
  hub: SegueConnectionInfo | null;
  user: string;
  deviceId: string;
  deviceName: string;
  devices: Record<string, SegueDevice>;
  lastPlayback: SegueLastPlayback | undefined;
  error: string | null;
  polling: boolean;
  connect: (server: ServerConfig, manualHubUrl?: string) => Promise<void>;
  disconnect: () => void;
  reportPlayerState: () => void;
  sendCommand: (deviceId: string, command: { action: SegueCommandAction; [key: string]: unknown }) => void;
  transferTo: (deviceId: string) => void;
  transferHere: (fromDeviceId?: string) => void;
  setDeviceName: (name: string) => void;
}

let client: SegueClient | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
/** Invalidates handlers from a superseded connection. */
let connectionSeq = 0;

function clearTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pollTimer) clearInterval(pollTimer);
  reconnectTimer = null;
  pollTimer = null;
}

function scheduleHubRetry(
  server: ServerConfig,
  manualHubUrl: string | undefined,
  delay = 30_000,
) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const current = useAuthStore.getState().server;
    if (!current || current.url !== server.url || current.username !== server.username) return;
    const hubUrl = manualHubUrl ?? (useSettingsStore.getState().hubUrl || undefined);
    void useSegueStore.getState().connect(current, hubUrl).catch(() => undefined);
  }, delay);
}

function mergeState(previous: SeguePlayerState | undefined, next: SeguePlayerState): SeguePlayerState {
  return { ...previous, ...next };
}

export const useSegueStore = create<SegueState>()((set, get) => {
  const ensureDeviceId = async (): Promise<string> => {
    const existing = await kvStore.get(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = uuid();
    await kvStore.set(DEVICE_ID_KEY, id);
    return id;
  };

  const ensureDeviceName = async (deviceId: string): Promise<string> => {
    const stored = (await kvStore.get(DEVICE_NAME_KEY))?.trim();
    if (stored) return stored;
    const base = defaultDeviceName();
    // Two identical models would otherwise be indistinguishable in the hub.
    const name = base === 'Laila Android' ? `${base} · ${deviceId.slice(-4).toUpperCase()}` : base;
    await kvStore.set(DEVICE_NAME_KEY, name);
    return name;
  };

  const startPolling = (server: ServerConfig) => {
    if (pollTimer) return;
    set({ polling: true });
    const poll = async () => {
      try {
        const entries = await getNowPlaying(server);
        const devices: Record<string, SegueDevice> = {};
        entries.forEach((entry, index) => {
          const id = `nowplaying-${entry.playerId ?? index}`;
          devices[id] = {
            id,
            name: entry.playerName ?? 'Navidrome client',
            online: true,
            state: {
              status: 'playing',
              positionMs: 0,
              queue: entry.track
                ? [
                    {
                      id: entry.track.id,
                      title: entry.track.title,
                      artist: entry.track.artist,
                      album: entry.track.album,
                      durationMs: entry.track.duration ? entry.track.duration * 1000 : undefined,
                    },
                  ]
                : [],
            },
          };
        });
        set({ devices });
      } catch {
        // Polling is best effort; keep the previous list.
      }
    };
    void poll();
    pollTimer = setInterval(() => void poll(), 20_000);
  };

  const handleCommand = async (
    id: string,
    from: string | undefined,
    command: { action: SegueCommandAction; [key: string]: unknown },
  ) => {
    const player = usePlayerStore.getState();
    let ok = true;
    let error: string | undefined;

    try {
      switch (command.action) {
        case 'play':
          await player.play();
          break;
        case 'pause':
          await player.pause();
          break;
        case 'toggle':
          await player.toggle();
          break;
        case 'stop':
          await player.stop();
          break;
        case 'next':
          await player.next();
          break;
        case 'previous':
          await player.previous();
          break;
        case 'seek':
          if (typeof command.positionMs === 'number') await player.seek(command.positionMs / 1000);
          break;
        case 'jump':
          if (typeof command.index === 'number') await player.jump(command.index);
          break;
        case 'setVolume':
          if (typeof command.volume === 'number') await player.setVolume(command.volume / 100);
          break;
        case 'setRepeat':
          if (command.repeat === 'off' || command.repeat === 'all' || command.repeat === 'one') {
            await player._apply({ type: 'setRepeat', repeat: command.repeat });
          }
          break;
        case 'setShuffle':
          if (typeof command.shuffle === 'boolean') {
            if (player.queueState.shuffle !== command.shuffle) player.toggleShuffle();
          }
          break;
        case 'setQueue': {
          const remote: SeguePlayerState = {
            status: command.play ? 'playing' : 'paused',
            positionMs: typeof command.positionMs === 'number' ? command.positionMs : 0,
            index: typeof command.index === 'number' ? command.index : 0,
            repeat:
              command.repeat === 'off' || command.repeat === 'all' || command.repeat === 'one'
                ? command.repeat
                : undefined,
            shuffle: typeof command.shuffle === 'boolean' ? command.shuffle : undefined,
            order: Array.isArray(command.order) ? (command.order as number[]) : undefined,
            queue: Array.isArray(command.queue)
              ? (command.queue as SeguePlayerState['queue'])
              : [],
          };
          const transfer = fromSegueState(remote);
          // A legitimate transfer always names the requesting device in `from`.
          // The hub may push a setQueue-with-play on app open to restore the
          // last playback; that arrives without a requester and must stay
          // paused rather than starting a track with no input.
          await player.applyRemoteQueue(
            transfer,
            shouldPlayTransferredQueue(command.play, from),
          );
          break;
        }
        case 'addToQueue': {
          const items = Array.isArray(command.queue) ? command.queue : [];
          const transfer = fromSegueState({
            status: 'paused',
            positionMs: 0,
            queue: items as SeguePlayerState['queue'],
          });
          player.addToQueue(transfer.tracks, command.next ? 'next' : 'end');
          break;
        }
        case 'removeFromQueue':
          if (typeof command.index === 'number') player.removeAt(command.index);
          break;
        case 'moveInQueue':
          if (typeof command.index === 'number' && typeof command.to === 'number') {
            player.move(command.index, command.to);
          }
          break;
        default:
          ok = false;
          error = `unsupported command: ${command.action}`;
      }
    } catch (commandError) {
      ok = false;
      error = commandError instanceof Error ? commandError.message : 'command failed';
    }

    client?.sendResult(id, ok, error);
    void from;
    get().reportPlayerState();
  };

  const attachClient = (
    server: ServerConfig,
    info: SegueConnectionInfo,
    deviceId: string,
    manualHubUrl: string | undefined,
    generation: number,
  ) => {
    const current = () => generation === connectionSeq;
    const next = new SegueClient({
      onWelcome: (message) => {
        if (!current()) return;
        const devices: Record<string, SegueDevice> = {};
        for (const device of message.devices) devices[device.id] = device;
        set({
          status: 'connected',
          user: message.user,
          devices,
          lastPlayback: message.lastPlayback,
          error: null,
          polling: false,
        });
        logger.info('Segue welcome', {
          devices: message.devices.length,
          hasLastPlayback: Boolean(message.lastPlayback),
        });
        get().reportPlayerState();
      },
      onDevice: (device) => {
        if (!current()) return;
        set((state) => ({ devices: { ...state.devices, [device.id]: device } }));
      },
      onState: (deviceId, nextState) => {
        if (!current()) return;
        set((state) => {
          const existing = state.devices[deviceId];
          if (!existing) return state;
          return {
            devices: {
              ...state.devices,
              [deviceId]: { ...existing, state: mergeState(existing.state, nextState), online: true },
            },
          };
        });
      },
      onGone: (deviceId) => {
        if (!current()) return;
        set((state) => {
          const devices = { ...state.devices };
          delete devices[deviceId];
          return { devices };
        });
      },
      onLastPlayback: (lastPlayback) => {
        if (current()) set({ lastPlayback });
      },
      onCommand: (id, from, command) => {
        if (!current()) return;
        logger.info('Segue command received', {
          action: command.action,
          from: from || '',
          play: command.action === 'setQueue' ? Boolean(command.play) : undefined,
          queue: command.action === 'setQueue' && Array.isArray(command.queue)
            ? command.queue.length
            : undefined,
        });
        void handleCommand(id, from, command);
      },
      onError: (error) => {
        if (current()) set({ error });
      },
      onClose: (code, reason) => {
        if (!current()) return;
        logger.warn('Segue connection closed', { code, reason });
        client = null;
        if (code === 4003) {
          set({ status: 'disconnected', error: 'This device was replaced by another connection.' });
          return;
        }
        set({ status: 'disconnected', error: reason || null });
        if (code !== 4001) scheduleHubRetry(server, manualHubUrl, 3000);
      },
    });

    client = next;
    return next
      .connect({
        info,
        server,
        deviceId,
        deviceName: get().deviceName,
        version: '0.1.0',
      })
      .then(() => {
        if (!current()) return;
        set({ status: 'connected', hub: info, error: null, polling: false });
      })
      .catch((error) => {
        if (!current()) return;
        const code = (error as { code?: number }).code;
        // onClose already set the replacement/unauthorized state.
        if (code === 4001 || code === 4003) return;
        // A close also scheduled its own retry; do not replace it with a slower one.
        if (reconnectTimer) return;
        client = null;
        set({
          status: 'error',
          error: error instanceof Error ? error.message : 'Segue connection failed',
        });
        startPolling(server);
        scheduleHubRetry(server, manualHubUrl);
      });
  };

  return {
    status: 'idle',
    hub: null,
    user: '',
    deviceId: '',
    deviceName: defaultDeviceName(),
    devices: {},
    lastPlayback: undefined,
    error: null,
    polling: false,

    connect: async (server, manualHubUrl) => {
      clearTimers();
      const generation = ++connectionSeq;
      client?.close();
      client = null;
      set({ status: 'connecting', error: null, devices: {}, hub: null, polling: false });
      const deviceId = get().deviceId || (await ensureDeviceId());
      const deviceName = await ensureDeviceName(deviceId);
      if (generation !== connectionSeq) return;
      set({ deviceId, deviceName });
      const info = await discoverSegue(server.url, manualHubUrl);
      if (generation !== connectionSeq) return;
      if (!info) {
        logger.info('Segue hub not found', { host: new URL(server.url).host });
        set({ status: 'nohub', hub: null });
        startPolling(server);
        scheduleHubRetry(server, manualHubUrl);
        return;
      }
      set({ hub: info });
      try {
        await attachClient(server, info, deviceId, manualHubUrl, generation);
      } catch {
        // attachClient already records the error, starts polling and retries.
      }
    },

    disconnect: () => {
      connectionSeq += 1;
      clearTimers();
      client?.close();
      client = null;
      set({ status: 'idle', hub: null, devices: {}, lastPlayback: undefined, polling: false });
    },

    reportPlayerState: () => {
      if (!client?.connected) return;
      const player = usePlayerStore.getState();
      client.reportState(toSegueState(player.queueState, player.status, player.position, player.volume));
    },

    sendCommand: (deviceId, command) => {
      if (!client?.connected) return;
      client.sendCommand(uuid(), deviceId, command);
    },

    transferTo: (deviceId) => {
      if (!client?.connected) return;
      const playing = usePlayerStore.getState().status === 'playing';
      client.transfer({ id: uuid(), from: get().deviceId, to: deviceId, play: playing });
    },

    transferHere: (fromDeviceId) => {
      if (!client?.connected) return;
      client.transfer({
        id: uuid(),
        ...(fromDeviceId ? { from: fromDeviceId } : {}),
        to: get().deviceId,
        play: true,
      });
    },

    setDeviceName: (deviceName) => {
      const trimmed = deviceName.trim();
      if (!trimmed) return;
      set({ deviceName: trimmed });
      void kvStore.set(DEVICE_NAME_KEY, trimmed).catch(() => undefined);
    },
  };
});

export function segueClient(): SegueClient | null {
  return client;
}
