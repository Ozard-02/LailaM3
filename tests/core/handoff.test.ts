import { describe, expect, it } from 'vitest';
import { handoffCandidate } from '@/core/segue/handoff';
import type { SegueLastPlayback } from '@/core/segue/types';

const playback: SegueLastPlayback = {
  deviceId: 'tv',
  deviceName: 'Living room TV',
  state: {
    status: 'playing',
    positionMs: 12_000,
    index: 0,
    queue: [{ id: 'song-1', title: 'First Light' }],
  },
};

describe('handoff suggestion', () => {
  it('offers another device while this one is idle or paused, even if the remote is paused', () => {
    expect(handoffCandidate(playback, 'phone', { status: 'idle' })).toBe(playback);
    expect(handoffCandidate(playback, 'phone', { status: 'paused' })).toBe(playback);
    expect(
      handoffCandidate(
        { ...playback, state: { ...playback.state, status: 'paused' } },
        'phone',
        { status: 'idle' },
      ),
    ).toBeDefined();
  });

  it('falls back to a live playing device when lastPlayback is stale or missing', () => {
    const devices = {
      tv: {
        id: 'tv',
        name: 'Living room TV',
        online: true,
        state: {
          status: 'playing' as const,
          positionMs: 5000,
          at: 10,
          queue: [{ id: 'song-1', title: 'First Light' }],
        },
      },
    };
    expect(
      handoffCandidate(
        { ...playback, state: { ...playback.state, status: 'paused' } },
        'phone',
        { status: 'idle' },
        devices,
      )?.state.status,
    ).toBe('playing');
    expect(handoffCandidate(undefined, 'phone', { status: 'idle' }, devices)).toBeDefined();
  });

  it('ignores the same device, stopped playback and an empty remote queue', () => {
    expect(handoffCandidate(playback, 'tv', { status: 'idle' })).toBeUndefined();
    expect(
      handoffCandidate(
        { ...playback, state: { ...playback.state, status: 'stopped' } },
        'phone',
        { status: 'idle' },
      ),
    ).toBeUndefined();
    expect(
      handoffCandidate(
        { ...playback, state: { ...playback.state, queue: [] } },
        'phone',
        { status: 'idle' },
      ),
    ).toBeUndefined();
  });

  it('uses the live paused state when it has moved to another track', () => {
    const devices = {
      tv: {
        id: 'tv',
        name: 'Living room TV',
        online: true,
        state: {
          status: 'paused' as const,
          positionMs: 42_000,
          index: 1,
          queue: [
            { id: 'song-1', title: 'First Light' },
            { id: 'song-2', title: 'Slow Motion' },
          ],
        },
      },
    };
    const candidate = handoffCandidate(playback, 'phone', { status: 'idle' }, devices);
    expect(candidate?.state.queue?.[1]?.title).toBe('Slow Motion');
    expect(candidate?.state.positionMs).toBe(42_000);
  });

  it('drops a stale record once the live device has stopped', () => {
    const devices = {
      tv: {
        id: 'tv',
        name: 'Living room TV',
        online: true,
        state: {
          status: 'stopped' as const,
          positionMs: 0,
          queue: [{ id: 'song-1', title: 'First Light' }],
        },
      },
    };
    expect(handoffCandidate(playback, 'phone', { status: 'idle' }, devices)).toBeUndefined();
  });

  it('never covers local playback or loading', () => {
    expect(handoffCandidate(playback, 'phone', { status: 'playing' })).toBeUndefined();
    expect(handoffCandidate(playback, 'phone', { status: 'loading' })).toBeUndefined();
  });
});
