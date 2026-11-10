type Pinyin = typeof import('pinyin-pro').pinyin;

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const cache = new Map<string, string>();
const MAX_CACHE = 2000;

// pinyin-pro is ~480 KB of web JS that only CJK metadata needs, so it is
// loaded on demand the first time a filter meets CJK text. Until it arrives,
// CJK text still matches by its characters; screens re-render through
// `subscribePinyin` once romanisation is available.
let pinyinFn: Pinyin | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadPinyin(): Promise<void> {
  loading ??= import('pinyin-pro').then(
    (module) => {
      pinyinFn = module.pinyin;
      cache.clear();
      listeners.forEach((listener) => listener());
    },
    () => {
      loading = null; // allow a later retry
    },
  );
  return loading;
}

export function isPinyinReady(): boolean {
  return pinyinFn !== null;
}

export function subscribePinyin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Case/diacritic folding for local metadata filters. It also expands Latin
 * ligatures and letters that NFKD does not decompose (ß, æ, ø, ł, …).
 */
export function foldSearchText(value: string | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    // Combining marks (not \p{M}: Hermes support varies by build).
    .replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l')
    .replace(/đ|ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/ı/g, 'i')
    .replace(/['’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pinyin without tones plus the initials, kept only when the text contains
 * CJK. The result is cached because Library filters run on every keystroke.
 */
function pinyinForms(value: string): string[] {
  if (!CJK.test(value)) return [];
  const pinyin = pinyinFn;
  if (!pinyin) {
    void loadPinyin();
    return [];
  }
  const cached = cache.get(value);
  if (cached !== undefined) return cached ? [cached] : [];
  const full = pinyin(value, { toneType: 'none', type: 'array' }).join(' ');
  const initials = pinyin(value, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
  const spaced = foldSearchText(full);
  const combined = `${spaced} ${spaced.replace(/\s+/g, '')} ${foldSearchText(initials)}`;
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(value, combined);
  return [combined];
}

/** Haystack with both the folded text and its pinyin/initials forms. */
export function searchHaystack(values: (string | undefined)[]): string {
  const text = values.filter(Boolean).join(' ');
  return [foldSearchText(text), ...pinyinForms(text)].join(' ').trim();
}

/**
 * Token-based match: every whitespace-separated token must be present. This
 * makes "quiet place" match "A Quiet Place" and "zjl" match 周杰伦精选.
 */
export function matchesSearch(
  values: (string | undefined)[],
  query: string,
): boolean {
  const folded = foldSearchText(query);
  if (!folded) return true;
  const haystack = searchHaystack(values);
  const tokens = folded.split(' ').filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

export function hasCjk(value: string): boolean {
  return CJK.test(value);
}
