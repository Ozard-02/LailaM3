import { md5 } from 'js-md5';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthMode, ServerConfig } from '@/core/models';
import { ping } from '@/core/subsonic/client';
import { decideServer } from '@/core/servers/switch';
import { normalizeBaseUrl, resetSessionSalt, sessionSalt } from '@/core/subsonic/params';
import { logger } from '@/core/utils/logger';
import { sanitiseHeaders } from '@/core/http/headers';
import type { NetworkInfo } from '@/ports/network';
import { kvStore } from '@/services/storage';

export interface Credentials {
  url: string;
  username: string;
  authMode: AuthMode;
  apiKey?: string;
  password?: string;
  headers?: Record<string, string>;
  name?: string;
  network?: string;
}

interface AuthState {
  server: ServerConfig | null;
  servers: ServerConfig[];
  remember: boolean;
  connecting: boolean;
  error: string | null;
  /** Last unbound/fallback server, used when leaving a bound network. */
  fallbackKey: string | null;
  connect: (
    credentials: Credentials,
    options?: { remember?: boolean; replaceAll?: boolean },
  ) => Promise<boolean>;
  switchServer: (url: string, username?: string) => void;
  removeServer: (url: string, username?: string) => void;
  setServerNetwork: (url: string, username: string, network: string | undefined) => void;
  setServerHeaders: (
    url: string,
    username: string,
    headers: Record<string, string> | undefined,
  ) => void;
  restoreFallback: () => void;
  autoSwitch: (network: NetworkInfo) => void;
  logout: () => void;
  clearError: () => void;
}

const storage = createJSONStorage<Pick<AuthState, 'server' | 'servers' | 'remember' | 'fallbackKey'>>(
  () => ({
    getItem: (name) => kvStore.get(name),
    setItem: (name, value) => kvStore.set(name, value),
    removeItem: (name) => kvStore.remove(name),
  }),
);

function keyOf(server: Pick<ServerConfig, 'url' | 'username'>): string {
  return `${server.url}|${server.username}`;
}

function sameServer(a: ServerConfig | null, b: ServerConfig): boolean {
  return Boolean(a && a.url === b.url && a.username === b.username);
}

export function isServerUsable(server: ServerConfig): boolean {
  if (server.authMode === 'apiKey') return Boolean(server.apiKey);
  return Boolean(server.password || (server.token && server.salt));
}

function sanitise(server: ServerConfig, remember: boolean): ServerConfig {
  if (!remember) {
    return {
      ...server,
      apiKey: undefined,
      password: undefined,
      token: undefined,
      salt: undefined,
    };
  }
  return {
    ...server,
    password: undefined,
    headers: sanitiseHeaders(server.headers),
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      server: null,
      servers: [],
      remember: false,
      connecting: false,
      error: null,
      fallbackKey: null,

      connect: async (credentials, options) => {
        const remember = options?.remember ?? get().remember;
        const base: ServerConfig = {
          url: normalizeBaseUrl(credentials.url),
          name: credentials.name?.trim() || undefined,
          network: credentials.network || undefined,
          username: credentials.username.trim(),
          authMode: credentials.authMode,
          apiKey: credentials.apiKey?.trim() || undefined,
          password: credentials.password || undefined,
          headers: sanitiseHeaders(credentials.headers),
        };

        let server = base;
        if (base.authMode === 'token' && base.password && remember) {
          const salt = sessionSalt();
          server = {
            ...base,
            salt,
            token: md5(`${base.password}${salt}`),
          };
        }

        set({ connecting: true, error: null });
        try {
          resetSessionSalt();
          await ping(server);
          const existing = get().servers;
          const without = existing.filter((item) => !sameServer(item, server));
          const servers = options?.replaceAll ? [server] : [...without, server];
          const nextFallback =
            !server.network && get().fallbackKey === null ? keyOf(server) : get().fallbackKey;
          set({
            server,
            servers,
            fallbackKey: nextFallback,
            remember,
            connecting: false,
            error: null,
          });
          logger.info('Connected to server', { host: new URL(server.url).host });
          return true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Could not connect to the server';
          logger.warn('Connection failed', { message });
          set({ connecting: false, error: message });
          return false;
        }
      },

      switchServer: (url, username) => {
        const target = get().servers.find(
          (item) => item.url === url && (username === undefined || item.username === username),
        );
        if (!target) return;
        const previous = get().server;
        if (!isServerUsable(target)) {
          // Make the unusable instance active so the layout routes to the
          // unlock screen; silently staying on the old server hid the failure.
          set({
            server: target,
            fallbackKey:
              previous && !previous.network && !target.network
                ? keyOf(previous)
                : get().fallbackKey,
            error: null,
          });
          return;
        }
        if (previous && !previous.network && !target.network) {
          set({ fallbackKey: keyOf(previous), server: target });
        } else {
          set({ server: target });
        }
        logger.info('Switched server', { host: new URL(target.url).host });
      },

      removeServer: (url, username) => {
        const servers = get().servers.filter(
          (item) => !(item.url === url && (username === undefined || item.username === username)),
        );
        const activeRemoved = get().server
          ? !servers.some((item) => sameServer(get().server, item))
          : false;
        set({
          servers,
          server: activeRemoved ? (servers[0] ?? null) : get().server,
          fallbackKey: null,
        });
      },

      setServerHeaders: (url, username, headers) => {
        set((state) => {
          const clean = sanitiseHeaders(headers);
          const servers = state.servers.map((item) =>
            item.url === url && item.username === username
              ? { ...item, headers: clean }
              : item,
          );
          const server =
            state.server && state.server.url === url && state.server.username === username
              ? { ...state.server, headers: clean }
              : state.server;
          return { servers, server };
        });
      },

      restoreFallback: () => {
        const { servers, fallbackKey, server } = get();
        const fallback =
          servers.find((item) => keyOf(item) === fallbackKey && isServerUsable(item)) ??
          servers.find((item) => item !== server && isServerUsable(item));
        if (fallback) set({ server: fallback, error: null });
      },

      setServerNetwork: (url, username, network) => {
        set((state) => {
          const servers = state.servers.map((item) =>
            item.url === url && item.username === username
              ? { ...item, network: network || undefined }
              : item,
          );
          const server =
            state.server && state.server.url === url && state.server.username === username
              ? { ...state.server, network: network || undefined }
              : state.server;
          return { servers, server };
        });
      },

      autoSwitch: (network) => {
        const state = get();
        const active = state.server;
        if (!active) return;
        const decision = decideServer(state.servers, active, network, state.fallbackKey);
        if (!decision) return;
        const target = state.servers.find(
          (item) => item.url === decision.url && item.username === decision.username,
        );
        if (!target) return;
        if (!isServerUsable(target)) {
          // Route to the unlock screen; the target is now active and missing
          // its secret, exactly like a non-remembered session after reload.
          set({ server: target, fallbackKey: decision.fallbackKey, error: null });
          return;
        }
        set({ server: target, fallbackKey: decision.fallbackKey });
        logger.info('Auto-switched server', {
          host: new URL(target.url).host,
          network: network.type,
        });
      },

      logout: () => {
        set({ server: null, servers: [], error: null, remember: false, fallbackKey: null });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'laila.auth',
      storage,
      partialize: (state) => ({
        remember: state.remember,
        fallbackKey: state.fallbackKey,
        server: state.server ? sanitise(state.server, state.remember) : null,
        servers: state.servers.map((server) => sanitise(server, state.remember)),
      }),
    },
  ),
);

export function currentServer(): ServerConfig | null {
  return useAuthStore.getState().server;
}
