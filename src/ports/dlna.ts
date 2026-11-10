import type { DlnaRenderer } from '@/core/dlna/types';

export interface DlnaDiscovery {
  /** Best-effort SSDP scan; resolves with an empty list when unsupported. */
  discover(timeoutMs?: number): Promise<DlnaRenderer[]>;
}
