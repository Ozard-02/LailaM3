export interface HeaderRow {
  name: string;
  value: string;
}

export interface HeaderParseResult {
  headers?: Record<string, string>;
  error: string | null;
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const MAX_HEADERS = 32;
const MAX_NAME = 128;
const MAX_VALUE = 4096;

/**
 * Hop-by-hop / framing headers cannot be set by a browser fetch and would
 * either be ignored or make the request ambiguous. Cookies and Authorization
 * stay allowed: proxies such as Authelia and Cloudflare Access need them.
 */
const FORBIDDEN = new Set([
  'connection',
  'content-length',
  'host',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function headersToRows(headers?: Record<string, string>): HeaderRow[] {
  if (!headers) return [];
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

/** Validate edited rows and reject header-injection and framing headers. */
export function parseHeaderRows(rows: HeaderRow[]): HeaderParseResult {
  const headers: Record<string, string> = {};
  const seen = new Set<string>();
  let error: string | null = null;

  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name && !value) continue;
    if (!name) {
      error ??= 'A header value needs a name.';
      continue;
    }
    if (!TOKEN.test(name)) {
      error ??= `“${name}” is not a valid header name.`;
      continue;
    }
    if (name.length > MAX_NAME) {
      error ??= `“${name.slice(0, 24)}…” is too long.`;
      continue;
    }
    if (/[\r\n\0]/.test(value)) {
      error ??= `“${name}” contains a line break.`;
      continue;
    }
    if (value.length > MAX_VALUE) {
      error ??= `“${name}” is longer than ${MAX_VALUE} characters.`;
      continue;
    }
    if (FORBIDDEN.has(name.toLowerCase())) {
      error ??= `“${name}” is managed by the network stack and cannot be set here.`;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      error ??= `“${name}” is listed more than once.`;
      continue;
    }
    if (Object.keys(headers).length >= MAX_HEADERS) {
      error ??= `Use at most ${MAX_HEADERS} headers.`;
      continue;
    }
    seen.add(key);
    headers[name] = value;
  }

  if (Object.keys(headers).length > MAX_HEADERS) {
    error ??= `Use at most ${MAX_HEADERS} headers.`;
  }

  return {
    headers: Object.keys(headers).length ? headers : undefined,
    error,
  };
}

/** Clean a value coming from persistence before it reaches fetch(). */
export function sanitiseHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const { headers: clean } = parseHeaderRows(headersToRows(headers));
  return clean;
}
