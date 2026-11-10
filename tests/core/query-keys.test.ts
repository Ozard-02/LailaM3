import { describe, expect, it } from 'vitest';
import type { ServerConfig } from '@/core/models';
import { queryKeys, serverKey } from '@/core/queryKeys';

const server = {
  url: 'https://music.example.test',
  username: 'laila',
  authMode: 'apiKey',
  apiKey: 'test',
} satisfies ServerConfig;

describe('query keys', () => {
  it('scopes album lists to the server and type', () => {
    const key = queryKeys.albums(server, 'recent', 12);
    expect(key).toEqual(['albums', serverKey(server), 'recent', 12]);
  });

  it('provides an album-type prefix for recent invalidation', () => {
    expect(queryKeys.albumList(server, 'recent')).toEqual([
      'albums',
      serverKey(server),
      'recent',
    ]);
    expect(queryKeys.albums(server, 'recent', 12).slice(0, 3)).toEqual(
      queryKeys.albumList(server, 'recent'),
    );
  });

  it('does not collide across servers', () => {
    const other = { ...server, url: 'https://other.example.test' };
    expect(queryKeys.albums(server, 'recent', 12)).not.toEqual(
      queryKeys.albums(other, 'recent', 12),
    );
  });
});
