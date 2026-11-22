/**
 * Cover request size. Normal mode keeps the existing 2x request; performance
 * mode asks for exactly the laid-out size to cut decode work and memory.
 */
export function coverRequestSize(size: number, performanceMode: boolean): number {
  return Math.max(1, Math.round(size * (performanceMode ? 1 : 2)));
}
