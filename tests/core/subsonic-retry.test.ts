import { describe, expect, it } from 'vitest';
import { retryDelayMs, shouldRetryStatus } from '@/core/subsonic/retry';

describe('Subsonic retry policy', () => {
  it('retries transient statuses and stops after the budget', () => {
    expect(shouldRetryStatus(0, 0)).toBe(true);
    expect(shouldRetryStatus(503, 1)).toBe(true);
    expect(shouldRetryStatus(429, 0)).toBe(true);
    expect(shouldRetryStatus(503, 2)).toBe(false);
    expect(shouldRetryStatus(401, 0)).toBe(false);
    expect(shouldRetryStatus(40, 0)).toBe(false);
  });

  it('backs off exponentially with a cap', () => {
    expect(retryDelayMs(0, () => 0)).toBe(350);
    expect(retryDelayMs(1, () => 0)).toBe(700);
    expect(retryDelayMs(2, () => 0)).toBe(1400);
    expect(retryDelayMs(10, () => 0)).toBe(4000);
    expect(retryDelayMs(0, () => 0.999)).toBe(499);
  });
});
