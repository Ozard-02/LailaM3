import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { isLowMemoryDevice } from '@/core/device-tier';

let cached: boolean | undefined;

/**
 * Total RAM is fixed for the app's lifetime, so read it once. On web the value
 * is not meaningful; the manual On/Off setting still works there.
 */
export function isLowMemoryRuntime(): boolean {
  if (cached !== undefined) return cached;
  cached = Platform.OS !== 'web' && isLowMemoryDevice(Device.totalMemory);
  return cached;
}
