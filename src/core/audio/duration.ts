/**
 * Pick a usable playback duration. Streams (especially transcoded ones) can
 * report `Infinity`, `NaN`, `0` or Media3's `C.TIME_UNSET` until the decoder
 * knows the real length; the track metadata is a better answer until then.
 */
export function resolveDuration(
  reported: number | null | undefined,
  hint?: number | null,
): number {
  if (typeof reported === 'number' && Number.isFinite(reported) && reported > 0) {
    return reported;
  }
  if (typeof hint === 'number' && Number.isFinite(hint) && hint > 0) {
    return hint;
  }
  return 0;
}
