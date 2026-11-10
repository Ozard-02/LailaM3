import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { PermissionsAndroid, Platform } from 'react-native';
import type { NetworkInfo, NetworkMonitor } from '@/ports/network';

function cleanSsid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const ssid = value.replace(/^"|"$/g, '').trim();
  if (!ssid || ssid.startsWith('<')) return undefined;
  return ssid;
}

function mapState(state: NetInfoState): NetworkInfo {
  if (state.type === 'cellular') return { type: 'cellular' };
  if (state.type === 'wifi') {
    const details = state.details as { ssid?: string | null } | null;
    return { type: 'wifi', ssid: cleanSsid(details?.ssid) };
  }
  return { type: 'none' };
}

export async function requestNetworkPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export const networkMonitor: NetworkMonitor = {
  async get() {
    try {
      return mapState(await NetInfo.fetch());
    } catch {
      return { type: 'none' };
    }
  },
  subscribe(listener) {
    return NetInfo.addEventListener((state) => listener(mapState(state)));
  },
};
