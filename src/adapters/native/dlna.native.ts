import type { DlnaRenderer } from '@/core/dlna/types';
import type { DlnaDiscovery } from '@/ports/dlna';
import { discoverRenderers } from '../../../modules/dlna';

export class NativeDlnaDiscovery implements DlnaDiscovery {
  async discover(timeoutMs = 3500): Promise<DlnaRenderer[]> {
    return discoverRenderers(timeoutMs);
  }
}
