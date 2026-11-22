import * as Device from 'expo-device';
import { isLowMemoryDevice } from '@/core/device-tier';

let cachedMemory: number | null | undefined;

/**
 * Total RAM in bytes. It is fixed for the app's lifetime, so read it once.
 * The web build resolves `device.web.ts` instead of this native module.
 */
export function getDeviceTotalMemoryBytes(): number | null {
  if (cachedMemory !== undefined) return cachedMemory;
  cachedMemory = Device.totalMemory ?? null;
  return cachedMemory;
}

export function isLowMemoryRuntime(): boolean {
  return isLowMemoryDevice(getDeviceTotalMemoryBytes());
}
