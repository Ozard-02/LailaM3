import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  filterSearch,
  foldSearchText,
  hasCjk,
  isPinyinReady,
  loadPinyin,
  matchesSearch,
  subscribePinyin,
} from '@/core/search/text';

describe('search text folding', () => {
  // Runs first: pinyin-pro is loaded on demand, not at import time.
  it('loads pinyin on first CJK filter and notifies subscribers', async () => {
    expect(isPinyinReady()).toBe(false);
    let notified = 0;
    const unsubscribe = subscribePinyin(() => {
      notified += 1;
    });
    // Before the module arrives, CJK text still matches by its characters.
    expect(matchesSearch(['周杰伦精选'], '周杰伦')).toBe(true);
    expect(matchesSearch(['周杰伦精选'], 'zjl')).toBe(false);
    await loadPinyin();
    unsubscribe();
    expect(isPinyinReady()).toBe(true);
    expect(notified).toBe(1);
    expect(matchesSearch(['周杰伦精选'], 'zjl')).toBe(true);
  });

  it('folds case, accents and Latin ligatures', () => {
    expect(foldSearchText('  BLÅHAJ  ')).toBe('blahaj');
    expect(foldSearchText('Sigur Rós')).toBe('sigur ros');
    expect(foldSearchText('Straße')).toBe('strasse');
    expect(foldSearchText('Æther')).toBe('aether');
  });

  it('matches every token, not just the whole phrase', () => {
    expect(matchesSearch(['A Quiet Place'], 'quiet place')).toBe(true);
    expect(matchesSearch(['A Quiet Place'], 'quiet loud')).toBe(false);
    expect(matchesSearch(['Sigur Rós'], 'ros')).toBe(true);
  });

  it('matches pinyin and initials for CJK metadata', async () => {
    await loadPinyin();
    expect(hasCjk('周杰伦精选')).toBe(true);
    expect(matchesSearch(['周杰伦精选'], 'zhoujielun')).toBe(true);
    expect(matchesSearch(['周杰伦精选'], 'zjl')).toBe(true);
    expect(matchesSearch(['周杰伦精选'], '周杰伦')).toBe(true);
    expect(matchesSearch(['周杰伦精选'], 'lun jie')).toBe(true);
    expect(matchesSearch(['周杰伦精选'], 'beatles')).toBe(false);
  });

  it('does not try to romanise plain Latin text', () => {
    expect(matchesSearch(['Blue Hour'], 'blue')).toBe(true);
    expect(matchesSearch(['Blue Hour'], 'blu')).toBe(true);
  });
});

describe('precomputed search index', () => {
  // Built inside the tests: CJK values must not load pinyin at import time.
  const albums = () => [
    { name: 'A Quiet Place', artist: 'Sigur Rós' },
    { name: 'Blue Hour', artist: '周杰伦' },
    { name: 'Straße', artist: 'Neu!' },
  ];
  const build = () => buildSearchIndex(albums(), (album) => [album.name, album.artist]);

  it('matches the same tokens as matchesSearch', () => {
    const index = build();
    expect(filterSearch(index, 'quiet place').map((album) => album.name)).toEqual([
      'A Quiet Place',
    ]);
    expect(filterSearch(index, 'ros').map((album) => album.name)).toEqual(['A Quiet Place']);
    expect(filterSearch(index, 'strasse').map((album) => album.name)).toEqual(['Straße']);
    expect(filterSearch(index, 'beatles')).toEqual([]);
    expect(filterSearch(index, '')).toEqual(albums());
  });

  it('reuses the folded haystack across queries', () => {
    const index = build();
    const haystack = index[1]?.haystack;
    filterSearch(index, 'blue');
    filterSearch(index, 'zhou');
    expect(index[1]?.haystack).toBe(haystack);
  });

  it('includes pinyin forms once the index is built after loading', async () => {
    await loadPinyin();
    expect(filterSearch(build(), 'zjl').map((album) => album.name)).toEqual(['Blue Hour']);
  });
});
