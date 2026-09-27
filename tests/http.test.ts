import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request, RequestError } from '../client/src/api/http.ts';

const fallback = 'Please try again.';

test('API requests send same-origin credentials, JSON and a timeout signal', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    assert.equal(options.body, '{"username":"Willow"}');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ username: 'Willow' });
  });
  const result = await request<{ username: string }>('/api/auth/login', {
    method: 'POST',
    body: { username: 'Willow' },
    fallback,
  });
  assert.deepEqual(result, { username: 'Willow' });
  assert.equal(fetch.mock.calls[0]?.arguments[0], '/api/auth/login');
});

test('API logout/deletion accepts 204 without attempting JSON parsing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal(await request('/api/auth/account', { method: 'DELETE', fallback }), undefined);
});

test('API failures retain HTTP status so expired sessions can return to login', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Please log in.' }, { status: 401 }),
  );
  await assert.rejects(request('/api/auth/me', { fallback }), (error: unknown) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Please log in.');
    return true;
  });
});

test('API failures use readable fallback messages for non-JSON or malformed error bodies', async (t) => {
  for (const body of ['Service unavailable', '{"error":42}', 'null']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 503 }));
    await assert.rejects(request('/api/skins', { fallback }), { message: fallback, status: 503 });
  }
});

test('API transport failures propagate to the feature error handler', async (t) => {
  const offline = new TypeError('Failed to fetch');
  t.mock.method(globalThis, 'fetch', async () => {
    throw offline;
  });
  await assert.rejects(request('/api/adventure', { fallback }), (error) => error === offline);
});
