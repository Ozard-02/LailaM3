export interface DlnaRenderer {
  /** UPnP UDN (usually `uuid:...`), or the description URL as fallback. */
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
