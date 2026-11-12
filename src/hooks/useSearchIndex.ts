import { useMemo } from 'react';
import { buildSearchIndex, type SearchEntry } from '@/core/search/text';
import { usePinyinReady } from './usePinyinReady';

/**
 * Builds a folded search index once per data change, so a keystroke is a plain
 * `includes` scan (1 ms for 20k items) instead of re-normalising the whole
 * library (53 ms). Pinyin arrives lazily and changes every CJK haystack, so the
 * index is rebuilt when romanisation becomes ready.
 *
 * `values` must be stable: define it at module scope, not inline.
 */
export function useSearchIndex<T>(
  items: readonly T[],
  values: (item: T) => (string | undefined)[],
): SearchEntry<T>[] {
  const pinyinReady = usePinyinReady();

  return useMemo(
    () => {
      // Invalidation key: the data is unchanged but CJK haystacks are not.
      void pinyinReady;
      return buildSearchIndex(items, values);
    },
    [items, values, pinyinReady],
  );
}
