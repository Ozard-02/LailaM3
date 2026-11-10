import type { NetworkMonitor } from '@/ports/network';

export async function requestNetworkPermission(): Promise<boolean> {
  return true;
}

export const networkMonitor: NetworkMonitor = {
  async get() {
    return { type: 'none' };
  },
  subscribe() {
    return () => undefined;
  },
};
