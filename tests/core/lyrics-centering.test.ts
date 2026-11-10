import { describe, expect, it } from 'vitest';
import { lyricBottomPadding, lyricCenterPadding } from '@/core/lyrics/centering';

describe('lyrics centering', () => {
  it('centres in the full screen, not just the scroll area', () => {
    expect(lyricCenterPadding(800, 100)).toBe(350);
    expect(lyricCenterPadding(800, 0)).toBe(400);
  });

  it('never returns a negative or non-finite padding', () => {
    expect(lyricCenterPadding(0, 100)).toBe(0);
    expect(lyricCenterPadding(800, 900)).toBe(0);
    expect(lyricCenterPadding(Number.NaN, 100)).toBe(0);
    expect(lyricCenterPadding(800, Number.NaN)).toBe(400);
  });

  it('leaves enough bottom room for the last line', () => {
    expect(lyricBottomPadding(800, 350, 140)).toBe(450);
    expect(lyricBottomPadding(800, 700, 140)).toBe(140);
    expect(lyricBottomPadding(0, 350, 140)).toBe(140);
  });
});
