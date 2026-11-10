import type { Track } from '../models';

const BY_SUFFIX: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  wma: 'audio/x-ms-wma',
  ape: 'audio/x-ape',
  dsf: 'audio/dsf',
  dff: 'audio/dff',
};

export function mimeForTrack(track: Track): string | undefined {
  const contentType = track.contentType?.toLowerCase();
  if (contentType?.startsWith('audio/')) return contentType;
  const suffix = track.suffix?.toLowerCase();
  return suffix ? BY_SUFFIX[suffix] : undefined;
}

export function mimeForTranscode(quality: 'opus' | 'mp3'): string {
  return quality === 'mp3' ? 'audio/mpeg' : 'audio/ogg';
}
