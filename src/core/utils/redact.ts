const SECRET_PARAMS = ['t', 's', 'apiKey', 'p', 'password', 'token', 'salt'];

/**
 * Removes credentials from URLs, query strings, objects and error messages.
 * Keep this conservative: when in doubt, replace the value.
 */
export function redactString(input: string): string {
  let out = input;

  // URL query parameters: t=..., s=..., apiKey=..., p=...
  for (const key of SECRET_PARAMS) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
      new RegExp(`([?&]${escaped}=)[^&#\\s]*`, 'gi'),
      `$1[redacted]`,
    );
  }

  // JSON-ish key/value pairs: "apiKey":"...", 't': '...'
  for (const key of SECRET_PARAMS) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
      new RegExp(`(["']?${escaped}["']?\\s*[:=]\\s*["'])([^"']*)(["'])`, 'gi'),
      `$1[redacted]$3`,
    );
  }

  return out;
}

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_PARAMS.includes(key) ? '[redacted]' : redactValue(child);
    }
    return out;
  }
  return value;
}
