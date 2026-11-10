/**
 * A received `setQueue` may ask to play. Only honour that when the hub names a
 * requesting device: a hub-initiated restore of the last playback arrives
 * without a requester and must be loaded paused, or the app starts a track on
 * open with no input.
 */
export function shouldPlayTransferredQueue(
  play: unknown,
  from: string | undefined,
): boolean {
  return Boolean(play) && Boolean(from?.trim());
}
