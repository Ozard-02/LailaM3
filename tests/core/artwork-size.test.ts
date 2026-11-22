import { describe, expect, it } from 'vitest';
import { coverRequestSize } from '@/ui/artwork-size';

describe('coverRequestSize', () => {
  it('keeps the existing 2x request outside performance mode', () => {
    expect(coverRequestSize(56, false)).toBe(112);
    expect(coverRequestSize(347.5, false)).toBe(695);
  });

  it('asks for the laid-out size in performance mode', () => {
    expect(coverRequestSize(56, true)).toBe(56);
    expect(coverRequestSize(347.5, true)).toBe(348);
  });

  it('never requests a zero-pixel cover', () => {
    expect(coverRequestSize(0, false)).toBe(1);
    expect(coverRequestSize(0, true)).toBe(1);
  });
});
