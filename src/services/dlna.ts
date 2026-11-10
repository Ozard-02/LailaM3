// TypeScript fallback. Metro resolves dlna.web.ts / dlna.native.ts at runtime.
import { WebDlnaDiscovery } from '@/adapters/web/dlna.web';
import type { DlnaDiscovery } from '@/ports/dlna';

export const dlnaDiscovery: DlnaDiscovery = new WebDlnaDiscovery();
