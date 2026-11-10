import { md5 } from 'js-md5';
import { describe, expect, it } from 'vitest';
import {
  buildAuthParams,
  buildCoverUrl,
  buildDownloadUrl,
  buildStreamUrl,
  buildUrl,
  normalizeBaseUrl,
} from '@/core/subsonic/params';
import { redactString } from '@/core/utils/redact';
import type { ServerConfig } from '@/core/models';

const apiKeyServer: ServerConfig = {
  url: 'https://music.example.com',
  username: 'me',
  authMode: 'apiKey',
  apiKey: 'secret-key',
};

const tokenServer: ServerConfig = {
  url: 'https://music.example.com/',
  username: 'me',
  authMode: 'token',
  password: 'hunter2',
};

describe('subsonic params', () => {
  it('normalizes base URLs', () => {
    expect(normalizeBaseUrl('music.example.com/')).toBe('https://music.example.com');
    expect(normalizeBaseUrl('http://localhost:4533///')).toBe('http://localhost:4533');
  });

  it('uses an API key without a username', () => {
    const params = buildAuthParams(apiKeyServer, 'salt');
    expect(params).toEqual({ apiKey: 'secret-key' });
    expect(params.u).toBeUndefined();
  });

  it('derives a token from password and salt', () => {
    const params = buildAuthParams(tokenServer, 'abcd1234');
    expect(params.u).toBe('me');
    expect(params.s).toBe('abcd1234');
    expect(params.t).toBe(md5('hunter2abcd1234'));
  });

  it('builds a JSON URL with common params', () => {
    const url = buildUrl(apiKeyServer, 'ping');
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/rest/ping.view');
    expect(parsed.searchParams.get('f')).toBe('json');
    expect(parsed.searchParams.get('v')).toBe('1.16.1');
    expect(parsed.searchParams.get('c')).toBe('laila');
    expect(parsed.searchParams.get('apiKey')).toBe('secret-key');
  });

  it('appends repeated query params for arrays', () => {
    const url = buildUrl(apiKeyServer, 'savePlayQueue', { id: ['a', 'b', 'c'] });
    const parsed = new URL(url);
    expect(parsed.searchParams.getAll('id')).toEqual(['a', 'b', 'c']);
  });

  it('builds cover and stream URLs', () => {
    expect(buildCoverUrl(apiKeyServer, 'cover1', 300)).toContain('getCoverArt.view');
    expect(buildCoverUrl(apiKeyServer, 'cover1', 300)).toContain('size=300');
    const stream = buildStreamUrl(apiKeyServer, 'track1');
    expect(stream).toContain('stream.view');
    expect(stream).toContain('format=raw');
  });

  it('uses download for originals and stream for transcoded downloads', () => {
    const original = new URL(buildDownloadUrl(apiKeyServer, 'track1'));
    expect(original.pathname).toBe('/rest/download.view');
    expect(original.searchParams.get('format')).toBeNull();

    const opus = new URL(
      buildDownloadUrl(apiKeyServer, 'track1', { format: 'opus', maxBitRate: 128 }),
    );
    expect(opus.pathname).toBe('/rest/stream.view');
    expect(opus.searchParams.get('format')).toBe('opus');
    expect(opus.searchParams.get('maxBitRate')).toBe('128');
  });

  it('redacts credentials in URLs and messages', () => {
    const url = 'https://x/rest/ping.view?u=me&t=deadbeef&s=abc&apiKey=secret';
    const redacted = redactString(url);
    expect(redacted).not.toContain('deadbeef');
    expect(redacted).not.toContain('abc&');
    expect(redacted).not.toContain('secret');
    expect(redacted).toContain('[redacted]');
  });
});

describe('updatePlaylist params', () => {
  it('keeps an empty comment so the server can clear it', () => {
    const url = buildUrl(apiKeyServer, 'updatePlaylist', {
      playlistId: 'pl-1',
      comment: '',
    });
    expect(new URL(url).searchParams.get('comment')).toBe('');
  });

  it('still omits other empty optional values', () => {
    const url = buildUrl(apiKeyServer, 'search3', { query: '', songCount: 20 });
    expect(new URL(url).searchParams.has('query')).toBe(false);
  });
});
