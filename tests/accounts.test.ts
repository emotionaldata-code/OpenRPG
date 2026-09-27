import { Adventures } from '../server/src/adventure/store.js';
import { Skins } from '../server/src/skins/store.js';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';
import { WorldState } from '@openrpg/shared';
import { createGameServer } from '../server/src/app.config.js';
import { Accounts } from '../server/src/auth/accounts.js';
import { migrate } from '../server/src/db/migrate.js';
import { testDatabase } from './helpers/database.js';
let db: Awaited<ReturnType<typeof testDatabase>>;
let accounts: Accounts;
let server: ReturnType<typeof createGameServer>;
const origin = 'http://localhost:5173';
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) {
  return fetch(`http://localhost:2569/api/auth${path}`, {
    method,
    headers: {
      Origin: requestOrigin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function cookie(response: Response): string {
  return response.headers.get('set-cookie')!.split(';')[0]!;
}
const credentials = { username: 'Willow', password: 'my-long-password' };
before(async () => {
  db = await testDatabase();
  accounts = new Accounts(db.pool);
  server = createGameServer(accounts, new Skins(db.pool), new Adventures(db.pool), origin);
  await server.listen(2569);
});
after(async () => {
  await server?.gracefullyShutdown(false);
  await db?.cleanup();
});
test('class-removal migration preserves accounts and sessions, supports rollback and fresh installs', async () => {
  await migrate(db.url);
  assert.equal((await db.pool.query('SELECT * FROM pgmigrations')).rowCount, 5);
  for (let step = 0; step < 4; step++) {
    await migrate(db.url, 'down');
  }
  const row = await db.pool.query(
    "INSERT INTO accounts(username,password_hash,character_class) VALUES ('MigrationUser','hash','mage') RETURNING id",
  );
  const id = row.rows[0].id;
  await db.pool.query(
    "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '1 day')",
    ['a'.repeat(64), id],
  );
  await migrate(db.url);
  assert.equal(
    (
      await db.pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='accounts' AND column_name='character_class'",
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (await db.pool.query('SELECT username,password_hash FROM accounts WHERE id=$1', [id])).rows[0]
      .password_hash,
    'hash',
  );
  assert.equal(
    (await db.pool.query('SELECT * FROM sessions WHERE account_id=$1', [id])).rowCount,
    1,
  );
  for (let step = 0; step < 4; step++) {
    await migrate(db.url, 'down');
  }
  assert.equal(
    (await db.pool.query('SELECT character_class FROM accounts WHERE id=$1', [id])).rows[0]
      .character_class,
    'archer',
  );
  await migrate(db.url);
  await db.pool.query('DELETE FROM accounts WHERE id=$1', [id]);
});
test('registration, password hashing, private cookies, case-insensitive login, class-free profiles and logout', async () => {
  const registered = await request('/register', 'POST', credentials);
  assert.equal(registered.status, 201);
  const user = await registered.json();
  assert.equal(user.username, 'Willow');
  assert.equal(user.characterClass, undefined);
  assert.equal(user.password_hash, undefined);
  const header = registered.headers.get('set-cookie')!;
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  const row = (await db.pool.query('SELECT password_hash FROM accounts WHERE id=$1', [user.id]))
    .rows[0];
  assert.match(row.password_hash, /^\$argon2id\$/);
  assert.notEqual(row.password_hash, credentials.password);
  assert.equal(
    (await request('/register', 'POST', { ...credentials, username: 'wILLOW' })).status,
    409,
  );
  assert.equal(
    (await request('/login', 'POST', { ...credentials, password: 'wrong-password' })).status,
    401,
  );
  const logged = await request('/login', 'POST', { ...credentials, username: 'willow' });
  assert.equal(logged.status, 200);
  const session = cookie(logged);
  assert.equal(
    (await request('/class', 'PATCH', { characterClass: 'warrior' }, session)).status,
    404,
  );
  assert.equal(
    (await (await request('/me', 'GET', undefined, session)).json()).characterClass,
    undefined,
  );
  assert.equal((await request('/logout', 'POST', {}, session)).status, 204);
  assert.equal((await request('/me', 'GET', undefined, session)).status, 401);
});
test('invalid credentials, missing sessions, malformed JSON and CSRF requests reject', async () => {
  for (const patch of [{ username: '<script>' }, { password: 'short' }, { password: {} }]) {
    assert.equal((await request('/register', 'POST', { ...credentials, ...patch })).status, 400);
  }
  assert.equal((await request('/me')).status, 401);
  assert.equal((await request('/class', 'PATCH', { characterClass: 'warrior' })).status, 404);
  assert.equal(
    (await request('/register', 'POST', credentials, undefined, 'https://evil.example')).status,
    403,
  );
  const badJson = await fetch('http://localhost:2569/api/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{invalid',
  });
  assert.equal(badJson.status, 400);
  assert.equal(
    (await request('/register', 'POST', { ...credentials, password: 'x'.repeat(3000) })).status,
    400,
  );
});
test('server uses saved identity and room-selected class; logout revokes live room and reconnect; deletion cascades all sessions', async () => {
  const login = await request('/login', 'POST', credentials);
  const session = cookie(login);
  const sdk = new Client('ws://localhost:2569');
  sdk.http.options.headers = { Cookie: session };
  await assert.rejects(
    sdk.create('expedition', { visibility: 'public', characterClass: 'rogue' }),
    /Choose Archer/,
  );
  await assert.rejects(sdk.create('expedition', { visibility: 'public' }), /Choose Archer/);
  const room = await sdk.create(
    'expedition',
    { visibility: 'public', name: 'Impostor', characterClass: 'warrior' },
    WorldState,
  );
  await new Promise<void>((resolve) => {
    const check = () => {
      if (room.state?.players?.has(room.sessionId)) {
        room.onStateChange.remove(check);
        resolve();
      }
    };
    room.onStateChange(check);
    check();
  });
  assert.equal(room.state.players.get(room.sessionId)!.name, 'Willow');
  assert.equal(room.state.players.get(room.sessionId)!.characterClass, 'warrior');
  await assert.rejects(sdk.joinById(room.roomId, { characterClass: 'rogue' }), /Choose Archer/);
  await assert.rejects(
    sdk.joinById(room.roomId, { characterClass: 'mage' }),
    /already have a seat/,
  );
  const other = await sdk.create(
    'expedition',
    { visibility: 'public', characterClass: 'mage' },
    WorldState,
  );
  await new Promise<void>((resolve) => {
    const check = () => {
      if (other.state?.players?.has(other.sessionId)) {
        other.onStateChange.remove(check);
        resolve();
      }
    };
    other.onStateChange(check);
    check();
  });
  assert.equal(other.state.players.get(other.sessionId)!.characterClass, 'mage');
  await other.leave();
  room.reconnection.minUptime = 0;
  const recovered = new Promise<void>((resolve) => room.onReconnect(() => resolve()));
  room.connection.close();
  await recovered;
  assert.equal(room.state.players.get(room.sessionId)!.characterClass, 'warrior');
  room.onMessage('account-ended', () => {});
  const token = room.reconnectionToken;
  const left = new Promise<void>((resolve) => room.onLeave(() => resolve()));
  await request('/logout', 'POST', {}, session);
  await left;
  await assert.rejects(sdk.reconnect(token));
  const first = cookie(await request('/login', 'POST', credentials));
  const second = cookie(await request('/login', 'POST', credentials));
  assert.equal(
    (await request('/account', 'DELETE', { password: 'wrong-password' }, first)).status,
    401,
  );
  assert.equal(
    (await request('/account', 'DELETE', { password: credentials.password }, first)).status,
    204,
  );
  assert.equal((await request('/me', 'GET', undefined, second)).status, 401);
  assert.equal((await db.pool.query('SELECT * FROM accounts')).rowCount, 0);
  assert.equal((await db.pool.query('SELECT * FROM sessions')).rowCount, 0);
});
test('expired sessions reject and cleanup removes them; dropped rooms cannot recover after account deletion', async () => {
  const result = await accounts.register({ ...credentials, username: 'Expired' });
  await db.pool.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
  await assert.rejects(accounts.authenticate(result.token));
  await accounts.prune();
  assert.equal((await db.pool.query('SELECT * FROM sessions')).rowCount, 0);
  const active = await accounts.login({ ...credentials, username: 'Expired' });
  const session = await accounts.authenticate(active.token);
  const sdk = new Client('ws://localhost:2569');
  sdk.http.options.headers = { Cookie: `openrpg_session=${active.token}` };
  const room = await sdk.create(
    'expedition',
    { visibility: 'public', characterClass: 'archer' },
    WorldState,
  );
  room.reconnection.enabled = false;
  const token = room.reconnectionToken;
  room.connection.close();
  await sleep(100);
  await accounts.delete(session, credentials.password);
  await assert.rejects(sdk.reconnect(token));
});
test('account endpoints rate limit repeated attempts', async () => {
  let response: Response | undefined;
  for (let i = 0; i < 45; i++) {
    response = await request('/login', 'POST', { ...credentials, username: 'Nobody' });
    if (response.status === 429) {
      break;
    }
  }
  assert.equal(response?.status, 429);
});
