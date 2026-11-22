import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDuration } from '@/core/audio/duration';
import { WebAudioEngine } from '@/adapters/web/audio.web';
import type { AudioSource } from '@/ports/audio';

const C_TIME_UNSET = -9223372036854776;

describe('resolveDuration', () => {
  it('keeps a valid reported duration', () => {
    expect(resolveDuration(244.8, 245)).toBe(244.8);
  });

  it.each([0, -1, C_TIME_UNSET, Number.NaN, Number.POSITIVE_INFINITY, null, undefined])(
    'falls back for an unusable reported duration (%s)',
    (reported) => {
      expect(resolveDuration(reported, 245)).toBe(245);
    },
  );

  it('uses a valid hint when the reported duration is missing', () => {
    expect(resolveDuration(undefined, 245)).toBe(245);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined])(
    'returns zero when neither value is usable (%s)',
    (hint) => {
      expect(resolveDuration(undefined, hint)).toBe(0);
      expect(resolveDuration(0, hint)).toBe(0);
    },
  );
});

let fakeDuration = Number.POSITIVE_INFINITY;
let lastAudio: FakeAudio | undefined;

class FakeAudio {
  preload = '';
  crossOrigin: string | null = null;
  src = '';
  duration = fakeDuration;
  currentTime = 0;
  paused = true;
  ended = false;
  readyState = 0;
  volume = 1;
  error: { message?: string } | null = null;
  buffered = { length: 0, end: () => 0 };
  load = vi.fn();
  play = vi.fn(async () => undefined);
  pause = vi.fn();
  removeAttribute = vi.fn();
  addEventListener = vi.fn();

  constructor() {
    lastAudio = this;
  }
}

function source(duration?: number): AudioSource {
  return {
    id: 'a',
    url: 'https://music.example.test/stream/a',
    title: 'A',
    duration,
  };
}

describe('WebAudioEngine duration fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    lastAudio = undefined;
  });

  it.each([Number.POSITIVE_INFINITY, Number.NaN])(
    'uses the source duration when the element reports %s',
    async (reported) => {
      fakeDuration = reported;
      vi.stubGlobal('Audio', FakeAudio);
      const engine = new WebAudioEngine();

      await engine.load(source(245));

      expect((await engine.getState()).duration).toBe(245);
      await engine.destroy();
    },
  );

  it('prefers a finite element duration over the hint', async () => {
    fakeDuration = 244.8;
    vi.stubGlobal('Audio', FakeAudio);
    const engine = new WebAudioEngine();

    await engine.load(source(245));

    expect((await engine.getState()).duration).toBe(244.8);
    await engine.destroy();
  });

  it('clamps seeks to the hinted duration while the element reports Infinity', async () => {
    fakeDuration = Number.POSITIVE_INFINITY;
    vi.stubGlobal('Audio', FakeAudio);
    const engine = new WebAudioEngine();

    await engine.load(source(245));
    await engine.seek(999);

    expect(lastAudio?.currentTime).toBe(245);
    await engine.destroy();
  });
});
