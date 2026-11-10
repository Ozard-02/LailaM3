import { useEffect, useRef } from 'react';
import type { ServerConfig } from '@/core/models';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';

function sourceKey(server: ServerConfig | null): string {
  if (!server) return '';
  return JSON.stringify({
    url: server.url,
    username: server.username,
    authMode: server.authMode,
    apiKey: server.apiKey ?? '',
    password: server.password ?? '',
    token: server.token ?? '',
    salt: server.salt ?? '',
    headers: server.headers
      ? Object.keys(server.headers)
          .sort()
          .map((name) => [name, server.headers?.[name]])
      : null,
  });
}

/**
 * The native audio queue stores absolute stream URLs. When network auto-switch
 * changes the server address (or proxy headers/credentials change), those
 * URLs become stale and the next track fails. Rebuild them once the server
 * change has landed, keeping the current index, position and play state.
 */
export function PlayerSourceBridge() {
  const server = useAuthStore((state) => state.server);
  const key = sourceKey(server);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void usePlayerStore.getState().refreshSources();
  }, [key]);

  return null;
}
