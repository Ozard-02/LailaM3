export type PerformanceModeSetting = 'auto' | 'on' | 'off';

/**
 * Devices at or below 2 GiB of total RAM are treated as low-memory. The Lenovo
 * TB-7305X reports ~0.9 GiB; phones and the larger tablet are well above it.
 */
export const LOW_MEMORY_THRESHOLD_BYTES = 2 * 1024 ** 3;

export function isLowMemoryDevice(
  totalMemoryBytes: number | null | undefined,
): boolean {
  return (
    typeof totalMemoryBytes === 'number' &&
    Number.isFinite(totalMemoryBytes) &&
    totalMemoryBytes > 0 &&
    totalMemoryBytes <= LOW_MEMORY_THRESHOLD_BYTES
  );
}

/** Resolve the Auto setting against the current device. */
export function resolvePerformanceMode(
  setting: PerformanceModeSetting,
  lowMemoryDevice: boolean,
): boolean {
  return setting === 'on' || (setting === 'auto' && lowMemoryDevice);
}
