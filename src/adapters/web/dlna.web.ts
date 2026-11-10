import type { DlnaRenderer } from '@/core/dlna/types';
import type { DlnaDiscovery } from '@/ports/dlna';

/** SSDP needs raw multicast sockets, which browsers do not expose. */
export class WebDlnaDiscovery implements DlnaDiscovery {
  async discover(): Promise<DlnaRenderer[]> {
    return [];
  }
}
