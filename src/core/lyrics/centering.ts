/**
 * Vertical padding that puts the active lyric line at the centre of the full
 * screen, not at the centre of the scroll view. `topOffset` is the distance
 * from the top of the screen to the scroll container (header + meta row).
 */
export function lyricCenterPadding(viewportHeight: number, topOffset: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  const offset = Number.isFinite(topOffset) ? Math.max(0, topOffset) : 0;
  return Math.max(0, (viewportHeight - offset) / 2);
}

/** Bottom padding required for the last line to reach the same centre. */
export function lyricBottomPadding(
  viewportHeight: number,
  paddingTop: number,
  minimum: number,
): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return Math.max(0, minimum);
  return Math.max(viewportHeight - Math.max(0, paddingTop), Math.max(0, minimum));
}
