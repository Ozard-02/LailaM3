import { describe, expect, it } from 'vitest';
import { safeParse } from 'valibot';
import {
  AlbumSchema,
  SubsonicEnvelopeSchema,
  TrackSchema,
} from '@/core/subsonic/schemas';

describe('Subsonic response schemas', () => {
  it('accepts a normal envelope and a failed envelope with an error', () => {
    expect(
      safeParse(SubsonicEnvelopeSchema, { status: 'ok', version: '1.16.1' }).success,
    ).toBe(true);
    const failed = safeParse(SubsonicEnvelopeSchema, {
      status: 'failed',
      error: { code: 40, message: 'Wrong credentials' },
    });
    expect(failed.success).toBe(true);
  });

  it('rejects an envelope with an invalid error shape', () => {
    const result = safeParse(SubsonicEnvelopeSchema, {
      status: 'failed',
      error: { code: { nested: true }, message: 42 },
    });
    expect(result.success).toBe(false);
  });

  it('validates tracks and albums without requiring optional metadata', () => {
    expect(safeParse(TrackSchema, { id: 'song-1', title: 'A' }).success).toBe(true);
    expect(safeParse(TrackSchema, { title: 'Missing id' }).success).toBe(false);
    expect(
      safeParse(AlbumSchema, {
        id: 'al-1',
        name: 'Album',
        song: [{ id: 'song-1' }],
      }).success,
    ).toBe(true);
  });
});
