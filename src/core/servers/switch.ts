import { CELLULAR_NETWORK, type NetworkInfo } from '@/ports/network';

export interface ServerRef {
  url: string;
  username: string;
  network?: string;
}

export interface SwitchDecision {
  url: string;
  username: string;
  fallbackKey: string | null;
}

export function serverKey(server: Pick<ServerRef, 'url' | 'username'>): string {
  return `${server.url}|${server.username}`;
}

/**
 * Decide which server instance to use for the current network.
 *
 * Mirrors the previous prototype:
 * - a server bound to the current SSID (or cellular) wins;
 * - leaving a bound network falls back to the last unbound server, then any unbound one;
 * - unbound servers are never switched away from unless a bound one matches.
 */
export function decideServer(
  servers: ServerRef[],
  active: ServerRef,
  network: NetworkInfo,
  fallbackKey: string | null,
): SwitchDecision | null {
  if (network.type === 'none') return null;

  const bound =
    network.type === 'cellular'
      ? servers.find((server) => server.network === CELLULAR_NETWORK)
      : network.ssid
        ? servers.find(
            (server) =>
              server.network &&
              server.network !== CELLULAR_NETWORK &&
              server.network.toLowerCase() === network.ssid?.toLowerCase(),
          )
        : undefined;

  if (bound && serverKey(bound) !== serverKey(active)) {
    return {
      url: bound.url,
      username: bound.username,
      fallbackKey: active.network ? fallbackKey : serverKey(active),
    };
  }

  if (active.network) {
    const stillBound =
      active.network === CELLULAR_NETWORK
        ? network.type === 'cellular'
        : network.type === 'wifi' &&
          Boolean(network.ssid) &&
          active.network.toLowerCase() === network.ssid?.toLowerCase();

    if (!stillBound) {
      const fallback =
        servers.find((server) => serverKey(server) === fallbackKey && !server.network) ??
        servers.find((server) => !server.network);
      if (fallback && serverKey(fallback) !== serverKey(active)) {
        return { url: fallback.url, username: fallback.username, fallbackKey };
      }
    }
  }

  return null;
}
