import type { ServerConfig } from '../models';
import { buildAuthParams } from '../subsonic/params';
import { logger } from '../utils/logger';
import type {
  SegueAuth,
  SegueCommandAction,
  SegueConnectionInfo,
  SegueDevice,
  SegueHello,
  SegueLastPlayback,
  SegueMessage,
  SeguePlayerState,
} from './types';

export interface SegueClientHandlers {
  onWelcome?: (message: Extract<SegueMessage, { type: 'welcome' }>) => void;
  onDevice?: (device: SegueDevice) => void;
  onState?: (deviceId: string, state: SeguePlayerState) => void;
  onGone?: (deviceId: string) => void;
  onLastPlayback?: (lastPlayback: SegueLastPlayback | undefined) => void;
  onCommand?: (id: string, from: string | undefined, command: { action: SegueCommandAction; [key: string]: unknown }) => void;
  onResult?: (id: string, ok: boolean, error?: string) => void;
  onError?: (error: string) => void;
  onClose?: (code: number, reason: string) => void;
}

function segueAuth(server: ServerConfig): SegueAuth {
  const params = buildAuthParams(server);
  if (server.authMode === 'apiKey') {
    if (!params.apiKey) throw new Error('Missing API key');
    return { scheme: 'apiKey', apiKey: params.apiKey };
  }
  return {
    scheme: 'subsonic',
    username: params.u,
    token: params.t,
    salt: params.s,
  };
}

export class SegueClient {
  private socket: WebSocket | null = null;
  private handlers: SegueClientHandlers;
  private closedByUs = false;
  private clockOffset = 0;
  lastWelcomeAt = 0;
  user = '';

  constructor(handlers: SegueClientHandlers) {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get offset(): number {
    return this.clockOffset;
  }

  now(): number {
    return Date.now() + this.clockOffset;
  }

  connect(options: {
    info: SegueConnectionInfo;
    server: ServerConfig;
    deviceId: string;
    deviceName: string;
    version: string;
  }): Promise<void> {
    this.closedByUs = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(options.info.wsUrl);
      this.socket = socket;

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      socket.onopen = () => {
        try {
          const hello: SegueHello = {
            type: 'hello',
            protocol: 1,
            auth: segueAuth(options.server),
            device: {
              id: options.deviceId,
              name: options.deviceName,
              client: 'Laila',
              version: options.version,
              api: 'subsonic',
              roles: ['player', 'controller'],
              capabilities: [
                'play',
                'pause',
                'toggle',
                'stop',
                'next',
                'previous',
                'seek',
                'jump',
                'setVolume',
                'setQueue',
                'setRepeat',
                'setShuffle',
              ],
              reportsPlayback: true,
            },
          };
          this.send(hello);
          if (!settled) {
            settled = true;
            resolve();
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Segue hello failed'));
        }
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as SegueMessage;
          this.handle(message);
        } catch (error) {
          logger.warn('Segue sent an invalid message', { error });
        }
      };

      socket.onerror = () => {
        fail(new Error('Segue connection failed'));
      };

      socket.onclose = (event) => {
        this.socket = null;
        if (this.closedByUs) {
          // Deliberate reconnect/disconnect: the store owns the new connection.
          if (!settled) {
            settled = true;
            reject(new Error('Segue connection closed locally'));
          }
          return;
        }
        this.handlers.onClose?.(event.code, event.reason);
        if (!settled) {
          settled = true;
          const error = new Error(`Segue closed (${event.code})`) as Error & { code?: number };
          error.code = event.code;
          reject(error);
        }
      };

      setTimeout(() => {
        if (!settled) fail(new Error('Segue connection timed out'));
      }, 10_000);
    });
  }

  private handle(message: SegueMessage) {
    switch (message.type) {
      case 'welcome':
        this.user = message.user;
        this.clockOffset = message.serverTime - Date.now();
        this.lastWelcomeAt = Date.now();
        this.handlers.onWelcome?.(message);
        return;
      case 'device':
        this.handlers.onDevice?.(message.device);
        return;
      case 'state':
        this.handlers.onState?.(message.deviceId, message.state);
        return;
      case 'gone':
        this.handlers.onGone?.(message.deviceId);
        return;
      case 'lastPlayback':
        this.handlers.onLastPlayback?.(message.lastPlayback);
        return;
      case 'command':
        this.handlers.onCommand?.(message.id, message.from, message.command);
        return;
      case 'result':
        this.handlers.onResult?.(message.re, message.ok, message.error);
        return;
      case 'error':
        this.handlers.onError?.(message.error);
        return;
      default:
        // transfer is a controller-to-hub message, not sent to players.
        return;
    }
  }

  send(message: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Segue is not connected');
    }
    this.socket.send(JSON.stringify(message));
  }

  reportState(state: SeguePlayerState): void {
    if (!this.connected) return;
    try {
      this.send({ type: 'state', state });
    } catch (error) {
      logger.debug('Segue state report skipped', { error });
    }
  }

  sendResult(id: string, ok: boolean, error?: string): void {
    if (!this.connected) return;
    this.send({ type: 'result', re: id, ok, error });
  }

  sendCommand(
    id: string,
    target: string,
    command: { action: SegueCommandAction; [key: string]: unknown },
  ): void {
    this.send({ type: 'command', id, target, command });
  }

  transfer(options: { id: string; from?: string; to?: string; play?: boolean }): void {
    this.send({ type: 'transfer', ...options });
  }

  close(): void {
    this.closedByUs = true;
    this.socket?.close();
    this.socket = null;
  }

  wasClosedByUs(): boolean {
    return this.closedByUs;
  }
}
