/**
 * Clamp a seek target before it reaches an audio engine. Guards against NaN,
 * Infinity and an unknown duration; those used to be assigned to
 * `HTMLMediaElement.currentTime` and threw.
 */
export function safeSeekTime(position: number, duration?: number): number {
  if (!Number.isFinite(position)) return 0;
  const target = Math.max(0, position);
  if (Number.isFinite(duration) && (duration as number) > 0) {
    return Math.min(target, duration as number);
  }
  return target;
}
