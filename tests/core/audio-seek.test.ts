import { describe, expect, it } from 'vitest';
import { safeSeekTime } from '@/core/audio/seek';

describe('safeSeekTime', () => {
  it('never emits a non-finite currentTime target', () => {
    expect(safeSeekTime(Number.NaN, 100)).toBe(0);
    expect(safeSeekTime(Number.POSITIVE_INFINITY, 100)).toBe(0);
    expect(safeSeekTime(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(safeSeekTime(-12, 100)).toBe(0);
  });

  it('clamps to a known duration', () => {
    expect(safeSeekTime(42, 100)).toBe(42);
    expect(safeSeekTime(420, 100)).toBe(100);
  });

  it('allows a finite target while the duration is still unknown', () => {
    expect(safeSeekTime(15, Number.NaN)).toBe(15);
    expect(safeSeekTime(15, 0)).toBe(15);
    expect(safeSeekTime(15, Number.POSITIVE_INFINITY)).toBe(15);
  });
});
