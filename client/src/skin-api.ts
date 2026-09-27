export async function skinRequest<T>(path = '', body?: unknown, method: 'GET' | 'POST' | 'DELETE' = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`/api/skins${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? 'Cannot reach your wardrobe. Try again.');
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
