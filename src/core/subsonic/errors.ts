export class SubsonicError extends Error {
  readonly code: number;
  readonly helpUrl?: string;
  readonly endpoint?: string;

  constructor(
    code: number,
    message: string,
    options?: { helpUrl?: string; endpoint?: string },
  ) {
    super(message);
    this.name = 'SubsonicError';
    this.code = code;
    this.helpUrl = options?.helpUrl;
    this.endpoint = options?.endpoint;
  }
}

export class AuthError extends SubsonicError {
  constructor(message = 'Authentication failed', options?: { endpoint?: string }) {
    super(40, message, options);
    this.name = 'AuthError';
  }
}

export function isAuthError(error: unknown): boolean {
  return (
    error instanceof AuthError ||
    (error instanceof SubsonicError && (error.code === 40 || error.code === 41 || error.code === 43))
  );
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof SubsonicError) return false;
  return error instanceof Error;
}
