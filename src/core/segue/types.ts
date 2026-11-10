export type SegueRole = 'player' | 'controller';

export type SegueCommandAction =
  | 'play'
  | 'pause'
  | 'toggle'
  | 'stop'
  | 'next'
  | 'previous'
  | 'jump'
  | 'seek'
  | 'setVolume'
  | 'setQueue'
  | 'addToQueue'
  | 'moveInQueue'
  | 'removeFromQueue'
  | 'setRepeat'
  | 'setShuffle';

export interface SegueQueueItem {
  id?: string;
  title: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  /**
   * Optional extension used by Laila. Upstream hubs drop it; the receiving
   * device then resolves the cover from the song id.
   */
  coverArt?: string;
}

export type SegueRepeat = 'off' | 'all' | 'one';

export interface SeguePlayerState {
  status: 'playing' | 'paused' | 'stopped';
  positionMs: number;
  index?: number;
  volume?: number;
  repeat?: SegueRepeat;
  shuffle?: boolean;
  queue?: SegueQueueItem[];
  order?: number[];
  at?: number;
}

export interface SegueDevice {
  id: string;
  name: string;
  client?: string;
  version?: string;
  api?: 'subsonic' | 'jellyfin';
  roles?: SegueRole[];
  capabilities?: SegueCommandAction[];
  reportsPlayback?: boolean;
  online: boolean;
  state?: SeguePlayerState;
}

export interface SegueLastPlayback {
  deviceId: string;
  deviceName: string;
  state: SeguePlayerState;
}

export type SegueMessage =
  | {
      type: 'welcome';
      protocol: number;
      user: string;
      serverTime: number;
      devices: SegueDevice[];
      lastPlayback?: SegueLastPlayback;
    }
  | { type: 'device'; device: SegueDevice }
  | { type: 'state'; deviceId: string; state: SeguePlayerState }
  | { type: 'gone'; deviceId: string }
  | { type: 'lastPlayback'; lastPlayback?: SegueLastPlayback }
  | {
      type: 'command';
      id: string;
      from?: string;
      command: { action: SegueCommandAction; [key: string]: unknown };
    }
  | { type: 'result'; re: string; ok: boolean; error?: string }
  | { type: 'error'; error: string }
  | { type: 'transfer'; id?: string; from?: string; to?: string; play?: boolean };

export interface SegueAuth {
  scheme: 'subsonic' | 'apiKey' | 'jellyfin';
  username?: string;
  token?: string;
  salt?: string;
  apiKey?: string;
}

export interface SegueHello {
  type: 'hello';
  protocol: 1;
  auth: SegueAuth;
  device: {
    id: string;
    name: string;
    client: string;
    version: string;
    api: 'subsonic';
    roles: SegueRole[];
    capabilities: SegueCommandAction[];
    reportsPlayback: boolean;
  };
}

export interface SegueConnectionInfo {
  httpUrl: string;
  wsUrl: string;
  manual: boolean;
}
