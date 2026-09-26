import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client, Predict, type Room, type RoomAvailable } from '@colyseus/sdk';
import { matchMaker } from 'colyseus';
import { WorldState, MoveInput, movePlayer, RULES, type Intent } from '@openrpg/shared';
import { createGameServer } from '../server/src/app.config.js';
import type { Expedition } from '../server/src/rooms/Expedition.js';
const server = createGameServer();
const client = new Client('ws://localhost:2568');
const connected: Room[] = [];
async function until(predicate: () => boolean, timeout = 3000): Promise<void> {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > end) throw new Error('Timed out waiting for condition'); await sleep(15); }
}
async function create(name = 'Archer', visibility = 'public') {
  const room = await client.create<WorldState>('expedition', { name, visibility }, WorldState); connected.push(room);
  room.reconnection.minUptime = 0;
  await until(() => !!room.state?.players?.has(room.sessionId)); return room;
}
async function join(id: string, name: string) {
  const room = await client.joinById<WorldState>(id, { name }, WorldState); connected.push(room);
  await until(() => !!room.state?.players?.has(room.sessionId)); return room;
}
const authoritative = (room: Room<WorldState>): Expedition => matchMaker.getLocalRoomById(room.roomId) as Expedition;
async function leave(...rooms: Room[]) { await Promise.all(rooms.map(r => r.leave())); }
before(async () => { await server.listen(2568); });
after(async () => { for (const r of connected) { r.reconnection.enabled = false; r.connection.close(); } await server.gracefullyShutdown(false); });
test('built-in lobby discovers public rooms, hides invite rooms, and updates on disposal', async () => {
  const lobby = await client.joinOrCreate('lobby', { filter: { name: 'expedition' } }); connected.push(lobby);
  const listings = new Map<string, RoomAvailable>();
  lobby.onMessage<RoomAvailable[]>('rooms', list => { for (const r of list) listings.set(r.roomId, r); });
  lobby.onMessage<[string, RoomAvailable]>('+', ([id, r]) => listings.set(id, r));
  lobby.onMessage<string>('-', id => listings.delete(id));
  const publicRoom = await create('Public'); const privateRoom = await create('Private', 'invite');
  await until(() => listings.has(publicRoom.roomId)); assert.ok(!listings.has(privateRoom.roomId));
  const friend = await join(privateRoom.roomId, 'Friend'); assert.equal(friend.roomId, privateRoom.roomId);
  await leave(publicRoom, privateRoom, friend);
  await until(() => !listings.has(publicRoom.roomId));
  await until(() => !matchMaker.getLocalRoomById(privateRoom.roomId)); await lobby.leave();
});
test('rooms are isolated; fourth join rejects; leaving frees a seat', async () => {
  const a = await create(), b = await create();
  const two = await join(a.roomId, 'Second'), three = await join(a.roomId, 'Third');
  assert.equal(authoritative(a).state.players.size, 3); assert.equal(authoritative(b).state.players.size, 1);
  await assert.rejects(client.joinById(a.roomId, { name: 'Fourth' }));
  await two.leave(); await until(() => authoritative(a).state.players.size === 2);
  const replacement = await join(a.roomId, 'Replacement');
  await leave(a, b, three, replacement);
});
test('invalid options and player names are rejected by the server', async () => {
  await assert.rejects(client.create('expedition', { name: '<img>', visibility: 'public' }));
  await assert.rejects(client.create('expedition', { name: 'Valid', visibility: 'wrong' }));
  const room = await create(); await assert.rejects(client.joinById(room.roomId, { name: '' }));
  assert.equal(authoritative(room).state.players.size, 1); await room.leave();
});
test('malformed values are sanitized and excess inputs cannot accelerate movement or firing', async () => {
  const room = await create(); const serverRoom = authoritative(room); const p = serverRoom.state.players.get(room.sessionId)!;
  const input = room.input({ type: MoveInput });
  Object.assign(input.data, { moveX: NaN, moveY: Infinity, aim: NaN, fire: false }); input.send(); await sleep(70);
  assert.equal(p.x, 250); assert.equal(p.y, 790); assert.equal(p.aim, 0);
  Object.assign(input.data, { moveX: 999, moveY: 0, aim: 0, fire: true });
  const start = p.x, at = performance.now();
  for (let i = 0; i < 80; i++) input.send();
  await sleep(160);
  assert.ok(p.x - start <= RULES.playerSpeed * ((performance.now() - at) / 1000 + 1 / 30));
  assert.ok(serverRoom.inputs.get(room.sessionId).size <= RULES.inputBuffer);
  assert.equal(serverRoom.state.projectiles.size, 1);
  await room.leave();
});
test('the flood cap disconnects an abusive sender without simulating the burst', async () => {
  const room = await create(); room.reconnection.enabled = false;
  const p = authoritative(room).state.players.get(room.sessionId)!;
  const input = room.input({ type: MoveInput }); input.data.moveX = 1; input.data.fire = true;
  const dropped = new Promise<void>(resolve => room.onLeave(() => resolve()));
  for (let i = 0; i < 250; i++) input.send();
  await dropped; assert.ok(p.x - 250 <= 18);
});
test('authoritative projectile combat is synchronized to teammates', async () => {
  const room = await create(), friend = await join(room.roomId, 'Friend'); const sim = authoritative(room);
  const player = sim.state.players.get(room.sessionId)!; Object.assign(player, { x: 510, y: 750 });
  const mob = sim.state.mobs.get('mage-0')!; Object.assign(mob, { x: 650, y: 750 });
  const input = room.input({ type: MoveInput }); input.data.aim = 0; input.data.fire = true;
  const timer = setInterval(() => input.send(), 1000 / 30);
  try {
    await until(() => mob.hp <= 0, 3000);
    await until(() => friend.state.mobs.get('mage-0')!.hp === 0);
    assert.equal(player.kills, 1); assert.equal(sim.state.players.get(friend.sessionId)!.hp, 100);
  } finally { clearInterval(timer); await leave(room, friend); }
});
test('automatic reconnection preserves session, pauses movement, and resets input epoch', async () => {
  const room = await create(); const sid = room.sessionId; const sr = authoritative(room);
  const input = room.input({ type: MoveInput }); const epoch = input.epoch;
  room.reconnection.minDelay = 200; room.reconnection.delay = 200;
  const dropped = new Promise<void>(resolve => room.onDrop(() => resolve()));
  const recovered = new Promise<void>(resolve => room.onReconnect(() => resolve()));
  room.connection.close(); await dropped; await sleep(50);
  assert.equal(sr.state.players.get(sid)!.connected, false);
  const x = sr.state.players.get(sid)!.x; await recovered;
  await until(() => sr.state.players.get(sid)!.connected);
  assert.equal(sr.state.players.get(sid)!.x, x); assert.equal(room.sessionId, sid); assert.ok(input.epoch > epoch);
  input.data.moveX = 1; input.send(); await until(() => sr.state.players.get(sid)!.x > x); await room.leave();
});
test('unrecovered seats expire after 15 seconds and empty rooms dispose', { timeout: 20000 }, async () => {
  const room = await create(); const id = room.roomId;
  room.reconnection.enabled = false; room.connection.close();
  await sleep(100); assert.ok(matchMaker.getLocalRoomById(id));
  await until(() => !matchMaker.getLocalRoomById(id), 16500);
});
test('SDK reconciliation replays pending input against server corrections and terrain; respawn reset discards old life', async () => {
  const room = await create(); const sr = authoritative(room); const input = room.input({ type: MoveInput });
  const predict = Predict.get(room, { delay: 100 }); const self = room.state.players.get(room.sessionId)!;
  let replayCount = 0;
  const me = predict.reconciler(self, { input, smoothMs: 0, step: (ctx, state, cmd: Intent) => { if (ctx.isReplay) replayCount++; movePlayer(state, cmd, ctx.dt); } });
  try {
    const start = me.state.x; input.data.moveX = 1; input.send(); assert.equal(me.state.x, start + 6);
    // Authoritative correction places the player against a wall while several commands remain pending.
    Object.assign(sr.state.players.get(room.sessionId)!, { x: 452, y: 520 });
    input.data.moveY = 1;
    for (let i = 0; i < 6; i++) input.send();
    for (let i = 0; i < 30; i++) { predict.tick(performance.now()); await sleep(16); }
    assert.ok(replayCount > 0); assert.equal(input.pendingCount, 0);
    assert.ok(Math.abs(me.state.x - self.x) < .00001); assert.ok(Math.abs(me.state.y - self.y) < .00001);
    assert.ok(me.state.x <= 460);
    Object.assign(sr.state.players.get(room.sessionId)!, { hp: 0, respawnAt: sr.state.elapsed + 100 });
    await until(() => self.generation === 1); me.reset();
    assert.equal(me.state.x, self.x); assert.equal(me.state.y, self.y);
    input.data.moveX = 0; input.data.moveY = 0; input.send();
    await sleep(100); predict.tick(performance.now()); assert.equal(me.state.x, self.x);
  } finally { predict.dispose(); await room.leave(); }
});
