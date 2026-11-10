import { describe, expect, it } from 'vitest';
import { activeLineIndex, isSynced, parseLrc } from '@/core/lyrics/lrc';

describe('LRC parser', () => {
  it('parses timestamps, fractions and multiple tags', () => {
    const lines = parseLrc('[00:12.50]First line\n[00:20]Second\n[00:30.25][00:40.25]Echo');
    expect(lines).toEqual([
      { start: 12.5, value: 'First line' },
      { start: 20, value: 'Second' },
      { start: 30.25, value: 'Echo' },
      { start: 40.25, value: 'Echo' },
    ]);
  });

  it('handles offsets and plain text', () => {
    const lines = parseLrc('[offset:-1000]\n[00:10]Ten\n[00:20]Twenty');
    expect(lines[0]?.start).toBe(9);
    expect(lines[1]?.start).toBe(19);
    expect(isSynced(parseLrc('just text'))).toBe(false);
  });

  it('finds the active line', () => {
    const lines = parseLrc('[00:10]A\n[00:20]B\n[00:30]C');
    expect(activeLineIndex(lines, 5)).toBe(-1);
    expect(activeLineIndex(lines, 10)).toBe(0);
    expect(activeLineIndex(lines, 25)).toBe(1);
    expect(activeLineIndex(lines, 99)).toBe(2);
  });
});
