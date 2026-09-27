export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  fallback: string;
}

/** Same-origin cookies carry identity; no password or session token lives in UI state. */
export async function request<T = void>(path: string, options: RequestOptions): Promise<T> {
  const { method = 'GET', body, fallback } = options;
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : fallback;
    throw new RequestError(response.status, message);
  }
  // DELETE/logout respond with no body; do not try to parse them as JSON.
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
