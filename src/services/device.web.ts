/**
 * Web has no meaningful total-memory reading; the manual Performance mode
 * On/Off setting still works. This platform stub also keeps `expo-device` (and
 * its `ua-parser-js` dependency) out of the web bundle.
 */
export function getDeviceTotalMemoryBytes(): number | null {
  return null;
}

export function isLowMemoryRuntime(): boolean {
  return false;
}
