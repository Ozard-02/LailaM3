import { describe, expect, it, vi } from 'vitest';
import { shuffled } from '@/core/queue/reducer';

describe('shuffled', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const result = shuffled(input);
    expect(input).toEqual(copy);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('is uniform for a swap of two items (no sort bias)', () => {
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0).mockReturnValueOnce(0);
    // Fisher–Yates: i=1 swaps with j=0.
    expect(shuffled(['a', 'b'])).toEqual(['b', 'a']);
    random.mockRestore();
  });
});
