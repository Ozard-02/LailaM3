import { describe, expect, it } from 'vitest';
import {
  buildDidlLite,
  buildSoapEnvelope,
  formatDlnaTime,
  parseDlnaTime,
  parseTransportState,
} from '@/core/dlna/control';

describe('DLNA metadata', () => {
  it('escapes text and keeps the stream URL intact', () => {
    const didl = buildDidlLite({
      id: 'song-1',
      url: 'http://nav.local/rest/stream?id=song-1&t=token&s=salt',
      title: 'Rock & Roll <Live>',
      artist: 'A "Quoted" Artist',
      album: "It's Fine",
      artwork: 'http://nav.local/rest/getCoverArt?id=cover-1&t=token',
      duration: 245,
      mimeType: 'audio/flac',
    });

    expect(didl).toContain('Rock &amp; Roll &lt;Live&gt;');
    expect(didl).toContain('A &quot;Quoted&quot; Artist');
    expect(didl).toContain('It&apos;s Fine');
    expect(didl).toContain('audio/flac');
    expect(didl).toContain('duration="0:04:05.000"');
    expect(didl).toContain('id=song-1&amp;t=token&amp;s=salt');
    expect(didl).toContain('object.item.audioItem.musicTrack');
  });

  it('omits optional fields without leaving empty tags', () => {
    const didl = buildDidlLite({ id: 'song-2', url: 'http://nav.local/a', title: 'Untitled' });
    expect(didl).not.toContain('<upnp:artist>');
    expect(didl).not.toContain('<upnp:album>');
    expect(didl).not.toContain('<upnp:albumArtURI>');
    expect(didl).toContain('http-get:*:audio/mpeg:*');
  });
});

describe('DLNA SOAP', () => {
  it('wraps actions in the correct service namespace and escapes params', () => {
    const envelope = buildSoapEnvelope('AVTransport', 'Seek', {
      InstanceID: 0,
      Unit: 'REL_TIME',
      Target: '0:01:05',
      Note: 'a & b',
    });
    expect(envelope).toContain('urn:schemas-upnp-org:service:AVTransport:1');
    expect(envelope).toContain('<u:Seek');
    expect(envelope).toContain('<Target>0:01:05</Target>');
    expect(envelope).toContain('<Note>a &amp; b</Note>');
  });
});

describe('DLNA time and state parsing', () => {
  it('formats and parses UPnP time values', () => {
    expect(formatDlnaTime(0)).toBe('0:00:00');
    expect(formatDlnaTime(65)).toBe('0:01:05');
    expect(formatDlnaTime(3725)).toBe('1:02:05');
    expect(parseDlnaTime('0:01:05')).toBe(65);
    expect(parseDlnaTime('1:02:05.500')).toBe(3725.5);
    expect(parseDlnaTime('NOT_IMPLEMENTED')).toBe(0);
    expect(parseDlnaTime(undefined)).toBe(0);
  });

  it('maps renderer transport states', () => {
    expect(parseTransportState('PLAYING')).toBe('PLAYING');
    expect(parseTransportState('PAUSED_PLAYBACK')).toBe('PAUSED_PLAYBACK');
    expect(parseTransportState('STOPPED')).toBe('STOPPED');
    expect(parseTransportState('NO_MEDIA_PRESENT')).toBe('NO_MEDIA_PRESENT');
    expect(parseTransportState('something-else')).toBe('UNKNOWN');
    expect(parseTransportState(undefined)).toBe('UNKNOWN');
  });
});
