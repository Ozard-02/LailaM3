export const CELLULAR_NETWORK = '__cellular__';

export type NetworkType = 'wifi' | 'cellular' | 'none';

export interface NetworkInfo {
  type: NetworkType;
  /** Wi-Fi SSID, when the platform exposes it. */
  ssid?: string;
}

export interface NetworkMonitor {
  get(): Promise<NetworkInfo>;
  subscribe(listener: (info: NetworkInfo) => void): () => void;
}
