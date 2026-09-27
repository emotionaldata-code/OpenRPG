import { request } from '../../api/http';

export function skinRequest<T>(
  path = '',
  body?: unknown,
  method: 'GET' | 'POST' | 'DELETE' = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  return request<T>(`/api/skins${path}`, {
    method,
    body,
    fallback: 'Cannot reach your wardrobe. Try again.',
  });
}
