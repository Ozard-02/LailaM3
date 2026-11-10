import { useSyncExternalStore } from 'react';
import { isPinyinReady, subscribePinyin } from '@/core/search/text';

/**
 * Re-renders the caller once the lazily loaded pinyin romanisation is ready,
 * so local filters that already ran on CJK text pick up pinyin matches.
 */
export function usePinyinReady(): boolean {
  return useSyncExternalStore(subscribePinyin, isPinyinReady, isPinyinReady);
}
