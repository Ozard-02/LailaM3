import { requireOptionalNativeModule } from 'expo-modules-core';

export interface DlnaRenderer {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  /** URL of the UPnP device description. */
  location: string;
  /** Absolute AVTransport control URL. */
  controlUrl: string;
  /** Absolute RenderingControl control URL, when the renderer exposes volume. */
  renderingControlUrl?: string;
}

interface DlnaNativeModule {
  discover(timeoutMs: number): Promise<DlnaRenderer[]>;
}

const nativeModule = requireOptionalNativeModule<DlnaNativeModule>('Dlna');

/** Android-only; returns an empty list on web and in Expo Go. */
export async function discoverRenderers(timeoutMs = 3500): Promise<DlnaRenderer[]> {
  if (!nativeModule) return [];
  const devices = await nativeModule.discover(timeoutMs);
  return devices.filter((device) => Boolean(device.id && device.controlUrl));
}
