import type { SegueDevice, SegueLastPlayback } from './types';

export interface LocalPlayback {
  /** 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' */
  status: string;
}

/**
 * A handoff is only useful when another device is actually playing and this
 * device is not already playing. A restored paused/local queue is fine: the
 * pill is an explicit choice to replace it. It never appears for this same
 * device, for a paused remote player, or during local playback/loading.
 */
export function handoffCandidate(
  lastPlayback: SegueLastPlayback | undefined,
  deviceId: string,
  local: LocalPlayback,
  devices: Record<string, SegueDevice> = {},
): SegueLastPlayback | undefined {
  if (local.status === 'playing' || local.status === 'loading') return undefined;

  // lastPlayback is the hub's record, but a playing device's live state is the
  // stronger signal if the record is stale or a welcome arrived without it.
  const playing = Object.values(devices)
    .filter(
      (device) =>
        device.id !== deviceId &&
        device.online &&
        device.state?.status === 'playing' &&
        (device.state.queue?.length ?? 0) > 0,
    )
    .sort((a, b) => (b.state?.at ?? 0) - (a.state?.at ?? 0))[0];
  if (playing?.state) {
    return {
      deviceId: playing.id,
      deviceName: playing.name,
      state: playing.state,
    };
  }

  if (!lastPlayback) return undefined;
  if (lastPlayback.deviceId === deviceId) return undefined;
  const live = lastPlayback.deviceId ? devices[lastPlayback.deviceId] : undefined;
  if (live?.online && live.state) {
    if (live.state.status === 'stopped') return undefined;
    const queue = live.state.queue?.length ? live.state.queue : lastPlayback.state.queue;
    if ((live.state.status === 'playing' || live.state.status === 'paused') && queue?.length) {
      return {
        deviceId: lastPlayback.deviceId,
        deviceName: live.name || lastPlayback.deviceName,
        state: { ...lastPlayback.state, ...live.state, queue },
      };
    }
  }
  if (lastPlayback.state.status !== 'playing' && lastPlayback.state.status !== 'paused') {
    return undefined;
  }
  if (!(lastPlayback.state.queue?.length ?? 0)) return undefined;
  return lastPlayback;
}
