import { describe, expect, it } from 'vitest';
import { decideServer, serverKey, type ServerRef } from '@/core/servers/switch';
import { CELLULAR_NETWORK } from '@/ports/network';

const home: ServerRef = {
  url: 'http://192.0.2.14:4533',
  username: 'laila',
  network: 'HomeWiFi',
};
const away: ServerRef = {
  url: 'https://music.example.com',
  username: 'laila',
  network: CELLULAR_NETWORK,
};
const unbound: ServerRef = {
  url: 'https://fallback.example.com',
  username: 'laila',
};
const servers = [home, away, unbound];

describe('server auto-switch', () => {
  it('switches to the instance bound to the current Wi-Fi', () => {
    const decision = decideServer(servers, unbound, { type: 'wifi', ssid: 'HomeWiFi' }, null);
    expect(decision).toEqual({
      url: home.url,
      username: home.username,
      fallbackKey: serverKey(unbound),
    });
  });

  it('switches to the cellular instance', () => {
    const decision = decideServer(servers, unbound, { type: 'cellular' }, null);
    expect(decision?.url).toBe(away.url);
  });

  it('does not switch when no instance is bound to this network', () => {
    expect(decideServer(servers, unbound, { type: 'wifi', ssid: 'OtherWiFi' }, null)).toBeNull();
  });

  it('falls back to the remembered unbound instance when leaving a bound network', () => {
    const decision = decideServer(
      servers,
      home,
      { type: 'wifi', ssid: 'OtherWiFi' },
      serverKey(unbound),
    );
    expect(decision?.url).toBe(unbound.url);
    expect(decision?.fallbackKey).toBe(serverKey(unbound));
  });

  it('falls back to any unbound instance when the remembered one is gone', () => {
    const decision = decideServer(servers, away, { type: 'wifi', ssid: 'NoMatch' }, 'gone');
    expect(decision?.url).toBe(unbound.url);
  });

  it('does nothing on an unknown network', () => {
    expect(decideServer(servers, home, { type: 'none' }, null)).toBeNull();
  });

  it('keeps the active server when it is already bound to this network', () => {
    expect(decideServer(servers, home, { type: 'wifi', ssid: 'HomeWiFi' }, null)).toBeNull();
  });
});
