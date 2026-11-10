export const MAX_REQUEST_ATTEMPTS = 3;

/** Retry only transient failures; auth/validation errors are final. */
export function shouldRetryStatus(status: number, attempt: number): boolean {
  if (attempt >= MAX_REQUEST_ATTEMPTS - 1) return false;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** Exponential backoff with a small jitter, capped at 4 s. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  return Math.min(4000, 350 * 2 ** attempt + Math.floor(random() * 150));
}
