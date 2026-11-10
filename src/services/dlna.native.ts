import { NativeDlnaDiscovery } from '@/adapters/native/dlna.native';
import type { DlnaDiscovery } from '@/ports/dlna';

export const dlnaDiscovery: DlnaDiscovery = new NativeDlnaDiscovery();
