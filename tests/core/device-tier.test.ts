import { describe, expect, it } from 'vitest';
import {
  LOW_MEMORY_THRESHOLD_BYTES,
  isLowMemoryDevice,
  resolvePerformanceMode,
} from '@/core/device-tier';

describe('isLowMemoryDevice', () => {
  it('accepts devices at or below 2 GiB', () => {
    expect(isLowMemoryDevice(LOW_MEMORY_THRESHOLD_BYTES)).toBe(true);
    expect(isLowMemoryDevice(927_608 * 1024)).toBe(true);
  });

  it('rejects larger devices and unusable values', () => {
    expect(isLowMemoryDevice(LOW_MEMORY_THRESHOLD_BYTES + 1)).toBe(false);
    expect(isLowMemoryDevice(null)).toBe(false);
    expect(isLowMemoryDevice(undefined)).toBe(false);
    expect(isLowMemoryDevice(0)).toBe(false);
    expect(isLowMemoryDevice(-1)).toBe(false);
    expect(isLowMemoryDevice(Number.NaN)).toBe(false);
    expect(isLowMemoryDevice(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('resolvePerformanceMode', () => {
  it('follows the device only on Auto', () => {
    expect(resolvePerformanceMode('auto', true)).toBe(true);
    expect(resolvePerformanceMode('auto', false)).toBe(false);
  });

  it('honours manual overrides', () => {
    expect(resolvePerformanceMode('on', false)).toBe(true);
    expect(resolvePerformanceMode('off', true)).toBe(false);
  });
});
