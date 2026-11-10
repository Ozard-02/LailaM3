import { describe, expect, it } from 'vitest';
import {
  headersToRows,
  parseHeaderRows,
  sanitiseHeaders,
} from '@/core/http/headers';

describe('reverse proxy headers', () => {
  it('parses names and values and ignores empty rows', () => {
    const result = parseHeaderRows([
      { name: ' X-Auth-Request-User ', value: ' me ' },
      { name: '', value: '' },
      { name: 'CF-Access-Client-Id', value: 'abc' },
    ]);
    expect(result.error).toBeNull();
    expect(result.headers).toEqual({
      'X-Auth-Request-User': 'me',
      'CF-Access-Client-Id': 'abc',
    });
    expect(headersToRows(result.headers)).toEqual([
      { name: 'X-Auth-Request-User', value: 'me' },
      { name: 'CF-Access-Client-Id', value: 'abc' },
    ]);
  });

  it('rejects framing and hop-by-hop headers', () => {
    const result = parseHeaderRows([
      { name: 'Host', value: 'evil.example' },
      { name: 'Content-Length', value: '10' },
      { name: 'Connection', value: 'close' },
    ]);
    expect(result.headers).toBeUndefined();
    expect(result.error).toContain('Host');
  });

  it('rejects invalid names, line breaks and duplicates', () => {
    expect(parseHeaderRows([{ name: 'bad header', value: 'x' }]).error).toContain(
      'not a valid header name',
    );
    expect(
      parseHeaderRows([{ name: 'X-Test', value: 'a\r\nInjected: yes' }]).error,
    ).toContain('line break');
    expect(
      parseHeaderRows([
        { name: 'X-Test', value: 'a' },
        { name: 'x-test', value: 'b' },
      ]).error,
    ).toContain('more than once');
  });

  it('drops invalid persisted entries instead of throwing', () => {
    expect(
      sanitiseHeaders({ 'X-Good': 'yes', Host: 'evil', 'Bad Name': 'x' }),
    ).toEqual({ 'X-Good': 'yes' });
    expect(sanitiseHeaders(undefined)).toBeUndefined();
    expect(sanitiseHeaders({})).toBeUndefined();
  });
});
