import { describe, expect, it } from 'vitest';
import { shouldPlayTransferredQueue } from '@/core/segue/commands';

describe('Segue setQueue play decision', () => {
  it('plays a transfer requested by a device', () => {
    expect(shouldPlayTransferredQueue(true, 'phone')).toBe(true);
    expect(shouldPlayTransferredQueue(true, 'tablet')).toBe(true);
  });

  it('keeps a hub-initiated restore paused', () => {
    expect(shouldPlayTransferredQueue(true, undefined)).toBe(false);
    expect(shouldPlayTransferredQueue(true, '')).toBe(false);
    expect(shouldPlayTransferredQueue(true, '   ')).toBe(false);
    expect(shouldPlayTransferredQueue(false, 'phone')).toBe(false);
  });
});
