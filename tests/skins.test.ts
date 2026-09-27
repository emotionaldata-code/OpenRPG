import { Adventures } from '../server/src/adventure/store.js';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { SKIN, WorldState, parseSkin, parseJoinOptions, type Skin, type SkinDraft } from '@openrpg/shared';
import { Accounts } from '../server/src/auth/accounts.js';
import { Skins } from '../server/src/skins/store.js';
import { createGameServer } from '../server/src/app.config.js';
import { testDatabase } from './helpers/database.js';
import { fillPixels, pencilLine } from '../client/src/pixel-tools.js';
let db: Awaited<ReturnType<typeof testDatabase>>;
let accounts: Accounts;
let skins: Skins;
let server: ReturnType<typeof createGameServer>;
const origin = 'http://localhost:5173';
const password = 'skin-test-password';
function draft(): SkinDraft {
  return { name: 'Copper Hood', characterClass: 'archer', templateVersion: 1, palette: ['transparent', '#c09060'], frames: Array.from({ length: 12 }, () => Array.from({ length: 672 }, (_, i) => i % 24 > 5 && i % 24 < 18 ? 1 : 0)) };
}
async function request(path: string, token?: string, body?: unknown, requestOrigin = origin, method = body === undefined ? 'GET' : 'POST') {
  return fetch(`http://localhost:2570/api/skins${path}`, { method, headers: { Origin: requestOrigin, ...(token ? { Cookie: `openrpg_session=${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function ready(room: Room<WorldState>): Promise<void> {
  if (room.state?.players?.has(room.sessionId)) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Room snapshot timed out')), 5000);
    const check = () => { if (room.state.players.has(room.sessionId)) { clearTimeout(timeout); room.onStateChange.remove(check); resolve(); } };
    room.onStateChange(check); check();
  });
}
before(async () => { db = await testDatabase(); accounts = new Accounts(db.pool); skins = new Skins(db.pool); server = createGameServer(accounts, skins, new Adventures(db.pool), origin); await server.listen(2570); });
after(async () => { await server?.gracefullyShutdown(false); await db?.cleanup(); });

test('skin parser bounds dimensions, palette, pixels, names and template versions', () => {
  assert.deepEqual(parseSkin(draft()), draft());
  const bad = [null, [], { name: '' }, { name: '\nname' }, { name: 'x'.repeat(33) }, { characterClass: 'rogue' }, { templateVersion: 2 }, { palette: ['transparent', 'url(evil)'] }, { palette: Array(65).fill('#ffffff') }, { frames: [] }, { frames: Array(12).fill([1]) }, { frames: Array(12).fill(Array(672).fill(2)) }, { frames: Array(12).fill(Array(672).fill(0.5)) }, { frames: Array(12).fill(Array(672).fill(0)) }];
  for (const patch of bad) assert.throws(() => parseSkin(patch === null || Array.isArray(patch) ? patch : { ...draft(), ...patch }));
  assert.throws(() => parseJoinOptions({ characterClass: 'archer', skinId: '../other' }));
  assert.deepEqual(parseJoinOptions({ characterClass: 'mage' }), { characterClass: 'mage' });
});

test('pixel fill respects edges and enclosed regions; fast pencil strokes have no gaps', () => {
  const pixels = Array(672).fill(0) as number[];
  for (let y = 0; y < 28; y++) pixels[y * 24 + 12] = 1;
  fillPixels(pixels, 0, 2);
  assert.equal(pixels[11], 2); assert.equal(pixels[12], 1); assert.equal(pixels[13], 0); assert.equal(pixels[671], 0);
  fillPixels(pixels, 13, 3); assert.equal(pixels[671], 3); assert.equal(pixels[648], 2);
  pencilLine(pixels, 24, 47, 4); assert.ok(pixels.slice(24, 48).every(p => p === 4));
  pencilLine(pixels, 0, 25, 5); assert.equal(pixels[0], 5); assert.equal(pixels[25], 5);
  fillPixels(pixels, -1, 4); assert.equal(pixels.length, 672);
});

test('authenticated skins persist, list only their owner, save copies and delete with account', async () => {
  const owner = await accounts.register({ username: 'SkinOwner', password });
  const other = await accounts.register({ username: 'SkinViewer', password });
  const created = await request('', owner.token, draft()); assert.equal(created.status, 201);
  const skin = await created.json() as Skin;
  assert.deepEqual(await (await request(`/${skin.id}`, other.token)).json(), skin);
  const list = await (await request('', owner.token)).json(); assert.equal(list.length, 1); assert.equal(list[0].frames, undefined);
  assert.equal((await (await request('', other.token)).json()).length, 0);
  const copy = await skins.create(owner.profile.id, { ...draft(), name: 'Another hood' });
  assert.notEqual(copy.id, skin.id); assert.equal((await skins.get(skin.id)).name, 'Copper Hood');
  await accounts.delete(await accounts.authenticate(owner.token), password);
  assert.equal((await db.pool.query('SELECT * FROM skins WHERE account_id=$1', [owner.profile.id])).rowCount, 0);
  assert.equal((await request(`/${skin.id}`, other.token)).status, 404);
});

test('skin HTTP rejects missing auth, bad origins, oversized and malformed artwork', async () => {
  const user = await accounts.register({ username: 'SkinValidation', password });
  assert.equal((await request('')).status, 401);
  assert.equal((await request('', undefined, draft())).status, 401);
  assert.equal((await request('', user.token, draft(), 'https://evil.example')).status, 403);
  assert.equal((await request('', user.token, { ...draft(), frames: [] })).status, 400);
  assert.equal((await request('', user.token, { data: 'x'.repeat(42000) })).status, 400);
  assert.equal((await request('/not-an-id', user.token)).status, 400);
  const result = await fetch('http://localhost:2570/api/skins', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `openrpg_session=${user.token}` }, body: '{no' });
  assert.equal(result.status, 400);
});

test('deleting a skin requires its owner and a same-origin session, removes artwork and frees capacity', async () => {
  const owner = await accounts.register({ username: 'SkinDeleteOwner', password });
  const other = await accounts.register({ username: 'SkinDeleteOther', password });
  const skin = await skins.create(owner.profile.id, draft());
  const remove = (token?: string, requestOrigin = origin, id = skin.id) => request(`/${id}`, token, {}, requestOrigin, 'DELETE');
  assert.equal((await remove()).status, 401);
  assert.equal((await remove(other.token)).status, 404);
  assert.equal((await remove(owner.token, 'https://evil.example')).status, 403);
  assert.equal((await remove(owner.token, origin, 'bad-id')).status, 400);
  assert.equal((await skins.get(skin.id)).name, skin.name);
  await db.pool.query('INSERT INTO skins(account_id,name,character_class,template_version,artwork) SELECT account_id,name,character_class,template_version,artwork FROM skins CROSS JOIN generate_series(1,$2) WHERE id=$1', [skin.id, SKIN.maxSaved - 1]);
  await assert.rejects(skins.create(owner.profile.id, draft()), /wardrobe is full/);
  assert.equal((await remove(owner.token)).status, 204);
  assert.equal((await request(`/${skin.id}`, other.token)).status, 404);
  assert.equal((await skins.list(owner.profile.id)).length, SKIN.maxSaved - 1);
  assert.equal((await remove(owner.token)).status, 404);
  await skins.create(owner.profile.id, draft());
  assert.equal((await skins.list(owner.profile.id)).length, SKIN.maxSaved);
});

test('concurrent saves cannot bypass the per-account wardrobe limit', async () => {
  const user = await accounts.register({ username: 'SkinLimit', password });
  const sample = await skins.create(user.profile.id, draft());
  await db.pool.query('INSERT INTO skins(account_id,name,character_class,template_version,artwork) SELECT account_id,name,character_class,template_version,artwork FROM skins CROSS JOIN generate_series(1,$2) WHERE id=$1', [sample.id, SKIN.maxSaved - 2]);
  const result = await Promise.allSettled([skins.create(user.profile.id, draft()), skins.create(user.profile.id, draft())]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await skins.list(user.profile.id)).length, SKIN.maxSaved);
});

test('rooms enforce skin ownership and class; teammates and reconnect see the immutable skin ID', async () => {
  const owner = await accounts.register({ username: 'SkinPlayer', password });
  const guest = await accounts.register({ username: 'SkinGuest', password });
  const skin = await skins.create(owner.profile.id, draft());
  const sdk = new Client('ws://localhost:2570'); sdk.http.options.headers = { Cookie: `openrpg_session=${owner.token}` };
  const other = new Client('ws://localhost:2570'); other.http.options.headers = { Cookie: `openrpg_session=${guest.token}` };
  await assert.rejects(sdk.create('expedition', { visibility: 'public', characterClass: 'mage', skinId: skin.id }), /skin for this class/);
  await assert.rejects(other.create('expedition', { visibility: 'public', characterClass: 'archer', skinId: skin.id }), /Skin not found/);
  const room = await sdk.create<WorldState>('expedition', { visibility: 'public', characterClass: 'archer', skinId: skin.id }, WorldState);
  const teammate = await other.joinById<WorldState>(room.roomId, { characterClass: 'warrior' }, WorldState);
  try {
    await ready(room); await ready(teammate);
    assert.equal(room.state.players.get(room.sessionId)!.skinId, skin.id);
    assert.equal(teammate.state.players.get(room.sessionId)!.skinId, skin.id);
    assert.equal(teammate.state.players.get(teammate.sessionId)!.skinId, '');
    assert.equal(room.state.players.get(room.sessionId)!.hp, 100);
    room.reconnection.minUptime = 0;
    const recovered = new Promise<void>(resolve => room.onReconnect(() => resolve()));
    room.connection.close(); await recovered;
    assert.equal(room.state.players.get(room.sessionId)!.skinId, skin.id);
    const nextSkin = await skins.create(owner.profile.id, { ...draft(), name: 'A new version' });
    assert.notEqual(nextSkin.id, skin.id); assert.equal(room.state.players.get(room.sessionId)!.skinId, skin.id);
  } finally { await teammate.leave(); await room.leave(); }
});
