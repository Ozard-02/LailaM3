import type { DlnaRenderer } from './types';

export type DlnaTransportState =
  | 'PLAYING'
  | 'PAUSED_PLAYBACK'
  | 'STOPPED'
  | 'TRANSITIONING'
  | 'NO_MEDIA_PRESENT'
  | 'UNKNOWN';

export interface DlnaSource {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  mimeType?: string;
}

export interface DlnaPlayback {
  state: DlnaTransportState;
  position: number;
  duration: number;
}

const AV_TRANSPORT = 'AVTransport';
const RENDERING_CONTROL = 'RenderingControl';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

export function formatDlnaTime(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '0:00:00';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`;
}

export function parseDlnaTime(value: string | undefined): number {
  if (!value) return 0;
  const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return 0;
  const [, h, m, s, fraction] = match;
  return (
    Number(h) * 3600 +
    Number(m) * 60 +
    Number(s) +
    (fraction ? Number(`0.${fraction}`) : 0)
  );
}

export function buildDidlLite(source: DlnaSource): string {
  const mime = source.mimeType ?? 'audio/mpeg';
  const parts = [
    '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ' xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">',
    `<item id="${escapeXml(source.id)}" parentID="0" restricted="1">`,
    `<dc:title>${escapeXml(source.title)}</dc:title>`,
    source.artist ? `<dc:creator>${escapeXml(source.artist)}</dc:creator>` : '',
    source.artist ? `<upnp:artist>${escapeXml(source.artist)}</upnp:artist>` : '',
    source.album ? `<upnp:album>${escapeXml(source.album)}</upnp:album>` : '',
    source.artwork ? `<upnp:albumArtURI>${escapeXml(source.artwork)}</upnp:albumArtURI>` : '',
    '<upnp:class>object.item.audioItem.musicTrack</upnp:class>',
    `<res protocolInfo="http-get:*:${escapeXml(mime)}:*"`,
    source.duration ? ` duration="${formatDlnaTime(source.duration)}.000"` : '',
    `>${escapeXml(source.url)}</res>`,
    '</item>',
    '</DIDL-Lite>',
  ];
  return parts.join('');
}

export function buildSoapEnvelope(
  service: typeof AV_TRANSPORT | typeof RENDERING_CONTROL,
  action: string,
  params: Record<string, string | number>,
): string {
  const body = Object.entries(params)
    .map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:${service}:1">` +
    body +
    `</u:${action}></s:Body></s:Envelope>`
  );
}

async function sendSoap(
  controlUrl: string,
  service: typeof AV_TRANSPORT | typeof RENDERING_CONTROL,
  action: string,
  params: Record<string, string | number>,
): Promise<string> {
  const response = await fetch(controlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPACTION: `"urn:schemas-upnp-org:service:${service}:1#${action}"`,
    },
    body: buildSoapEnvelope(service, action, params),
  });
  const text = await response.text();
  if (!response.ok) {
    // Never include the control URL or the SOAP body: it carries credentials.
    throw new Error(`DLNA ${action} failed (${response.status})`);
  }
  return text;
}

function tag(xml: string, name: string): string | undefined {
  // UPnP responses may or may not prefix tags (`<CurrentTransportState>` or
  // `<u:CurrentTransportState>`).
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`,
    'i',
  );
  const match = xml.match(pattern);
  return match?.[1] ? decodeXml(match[1].trim()) : undefined;
}

export function parseTransportState(value: string | undefined): DlnaTransportState {
  switch (value?.trim().toUpperCase()) {
    case 'PLAYING':
      return 'PLAYING';
    case 'PAUSED_PLAYBACK':
    case 'PAUSED':
      return 'PAUSED_PLAYBACK';
    case 'STOPPED':
      return 'STOPPED';
    case 'TRANSITIONING':
      return 'TRANSITIONING';
    case 'NO_MEDIA_PRESENT':
      return 'NO_MEDIA_PRESENT';
    default:
      return 'UNKNOWN';
  }
}

export async function setAvTransportUri(
  renderer: DlnaRenderer,
  source: DlnaSource,
): Promise<void> {
  await sendSoap(renderer.controlUrl, AV_TRANSPORT, 'SetAVTransportURI', {
    InstanceID: 0,
    CurrentURI: source.url,
    CurrentURIMetaData: buildDidlLite(source),
  });
}

export async function play(renderer: DlnaRenderer): Promise<void> {
  await sendSoap(renderer.controlUrl, AV_TRANSPORT, 'Play', { InstanceID: 0, Speed: 1 });
}

export async function pause(renderer: DlnaRenderer): Promise<void> {
  await sendSoap(renderer.controlUrl, AV_TRANSPORT, 'Pause', { InstanceID: 0 });
}

export async function stop(renderer: DlnaRenderer): Promise<void> {
  await sendSoap(renderer.controlUrl, AV_TRANSPORT, 'Stop', { InstanceID: 0 });
}

export async function seek(renderer: DlnaRenderer, position: number): Promise<void> {
  await sendSoap(renderer.controlUrl, AV_TRANSPORT, 'Seek', {
    InstanceID: 0,
    Unit: 'REL_TIME',
    Target: formatDlnaTime(position),
  });
}

export async function setVolume(renderer: DlnaRenderer, volume: number): Promise<void> {
  if (!renderer.renderingControlUrl) return;
  const desired = Math.round(Math.max(0, Math.min(1, volume)) * 100);
  await sendSoap(renderer.renderingControlUrl, RENDERING_CONTROL, 'SetVolume', {
    InstanceID: 0,
    Channel: 'Master',
    DesiredVolume: desired,
  });
}

export async function playSource(renderer: DlnaRenderer, source: DlnaSource): Promise<void> {
  await setAvTransportUri(renderer, source);
  await play(renderer);
}

export async function getPlayback(renderer: DlnaRenderer): Promise<DlnaPlayback> {
  const [transport, position] = await Promise.all([
    sendSoap(renderer.controlUrl, AV_TRANSPORT, 'GetTransportInfo', { InstanceID: 0 }),
    sendSoap(renderer.controlUrl, AV_TRANSPORT, 'GetPositionInfo', { InstanceID: 0 }),
  ]);
  return {
    state: parseTransportState(tag(transport, 'CurrentTransportState')),
    position: parseDlnaTime(tag(position, 'RelTime')),
    duration: parseDlnaTime(tag(position, 'TrackDuration')),
  };
}
