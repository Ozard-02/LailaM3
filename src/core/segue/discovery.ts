import type { SegueConnectionInfo } from './types';

const PROBE_TIMEOUT_MS = 3000;

function trim(url: string): string {
  return url.replace(/\/+$/, '');
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // A browser drops a wildcard answer to a credentialed request.
      credentials: 'omit',
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { protocol?: string; versions?: number[] };
    return data.protocol === 'segue' && Array.isArray(data.versions) && data.versions.includes(1);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function wsFromHttp(httpUrl: string): string {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = url.pathname.replace(/\/info\/?$/, '/ws');
    return url.toString();
  } catch {
    return httpUrl.replace(/^http/, 'ws').replace(/\/info\/?$/, '/ws');
  }
}

/**
 * Find the hub at the media server base URL, then at its origin.
 * A manual hub URL is tried before the conventional locations.
 */
export async function discoverSegue(
  serverUrl: string,
  manualHubUrl?: string,
): Promise<SegueConnectionInfo | null> {
  const base = trim(serverUrl);
  const candidates: { url: string; manual: boolean }[] = [];

  if (manualHubUrl) {
    const manual = trim(manualHubUrl);
    candidates.push({ url: manual.endsWith('/info') ? manual : `${manual}/connect/v1/info`, manual: true });
    candidates.push({ url: `${manual}/v1/info`, manual: true });
    candidates.push({ url: manual, manual: true });
  }

  candidates.push({ url: `${base}/connect/v1/info`, manual: false });
  const origin = originOf(base);
  if (origin !== base) {
    candidates.push({ url: `${origin}/connect/v1/info`, manual: false });
  }

  for (const candidate of candidates) {
    if (await probe(candidate.url)) {
      return {
        httpUrl: candidate.url,
        wsUrl: wsFromHttp(candidate.url),
        manual: candidate.manual,
      };
    }
  }

  return null;
}
