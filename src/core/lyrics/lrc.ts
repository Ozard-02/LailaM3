export interface LyricsLine {
  /** Seconds from the start, when the line is synced. */
  start?: number;
  value: string;
}

export interface Lyrics {
  lines: LyricsLine[];
  synced: boolean;
  source: 'structured' | 'legacy';
  artist?: string;
  title?: string;
}

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\]/g;

/**
 * Parses LRC into lines. Handles multiple timestamps on one line, offsets and
 * plain text. Returns synced=false when no timestamp was found.
 */
export function parseLrc(input: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  let offsetSeconds = 0;

  for (const raw of input.split(/\r?\n/)) {
    const offsetMatch = /^\[offset:([+-]?\d+)\]/i.exec(raw.trim());
    if (offsetMatch?.[1]) {
      offsetSeconds = Number(offsetMatch[1]) / 1000;
      continue;
    }

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    TIME_TAG.lastIndex = 0;
    while ((match = TIME_TAG.exec(raw)) !== null) {
      const minutes = Number(match[1] ?? 0);
      const seconds = Number(match[2] ?? 0);
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      timestamps.push(minutes * 60 + seconds + fraction);
    }

    const value = raw.replace(TIME_TAG, '').trim();
    if (!value) continue;

    if (timestamps.length === 0) {
      lines.push({ value });
    } else {
      for (const start of timestamps) {
        lines.push({ start: Math.max(0, start + offsetSeconds), value });
      }
    }
  }

  return lines.sort((a, b) => (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER));
}

export function isSynced(lines: LyricsLine[]): boolean {
  return lines.some((line) => typeof line.start === 'number');
}

export function activeLineIndex(lines: LyricsLine[], positionSeconds: number): number {
  if (!lines.length) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i]?.start;
    if (typeof start !== 'number') continue;
    if (start <= positionSeconds) active = i;
    else break;
  }
  return active;
}
