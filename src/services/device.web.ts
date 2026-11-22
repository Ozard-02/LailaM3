/**
 * Web has no meaningful total-memory signal, and importing expo-device here
 * would pull ua-parser-js into the web bundle. Auto therefore resolves to off;
 * the manual On/Off setting still works.
 */
export function isLowMemoryRuntime(): boolean {
  return false;
}
