import { Adventures } from '../server/src/adventure/store.js';
import { Skins } from '../server/src/skins/store.js';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client, Predict, type Room, type RoomAvailable } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import {
  VillageState,
  VILLAGE,
  WorldState,
  MoveInput,
  movePlayer,
  RULES,
  CLASS_COMBAT,
  MAP_IDS,
  MAPS,
  type CharacterClass,
  type Intent,
} from '@openrpg/shared';
import { createGameServer } from '../server/src/app.config.js';
import type { Village } from '../server/src/rooms/Village.js';
import type { Expedition } from '../server/src/rooms/Expedition.js';
import { Accounts } from '../server/src/auth/accounts.js';
import { testDatabase } from './helpers/database.js';
let database: Awaited<ReturnType<typeof testDatabase>>;
let accounts: Accounts;
let server: ReturnType<typeof createGameServer>;
let userCounter = 0;
async function authenticated(name: string): Promise<Client> {
  const { token } = await accounts.register({
    username: `${name}${++userCounter}`,
    password: 'integration-password',
  });
  const sdk = new Client('ws://localhost:2568');
  sdk.http.options.headers = { Cookie: `openrpg_session=${token}` };
  return sdk;
}
const client = new Client('ws://localhost:2568');
const connected: Room[] = [];
async function until(predicate: () => boolean, timeout = 3000): Promise<void> {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) {
      throw new Error('Timed out waiting for condition');
    }
    await sleep(15);
  }
}
async function create(
  name = 'Archer',
  visibility = 'public',
  characterClass: CharacterClass = 'archer',
) {
  const room = await (
    await authenticated(name)
  ).create<WorldState>('expedition', { name, visibility, characterClass }, WorldState);
  connected.push(room);
  room.reconnection.minUptime = 0;
  await until(() => !!room.state?.players?.has(room.sessionId));
  return room;
}
async function join(id: string, name: string, characterClass: CharacterClass = 'archer') {
  const room = await (
    await authenticated(name)
  ).joinById<WorldState>(id, { name, characterClass }, WorldState);
  connected.push(room);
  await until(() => !!room.state?.players?.has(room.sessionId));
  return room;
}
const authoritative = (room: Room<WorldState>): Expedition =>
  matchMaker.getLocalRoomById(room.roomId) as Expedition;
async function leave(...rooms: Room[]) {
  await Promise.all(rooms.map((r) => r.leave()));
}
before(async () => {
  database = await testDatabase();
  accounts = new Accounts(database.pool);
  server = createGameServer(
    accounts,
    new Skins(database.pool),
    new Adventures(database.pool),
    'http://localhost:5173',
  );
  await server.listen(2568);
});
after(async () => {
  for (const r of connected) {
    r.reconnection.enabled = false;
    r.connection.close();
  }
  await server?.gracefullyShutdown(false);
  await database?.cleanup();
});
test('built-in lobby discovers public rooms, hides invite rooms, and updates on disposal', async () => {
  const lobby = await client.joinOrCreate('lobby', { filter: { name: 'expedition' } });
  connected.push(lobby);
  const listings = new Map<string, RoomAvailable>();
  lobby.onMessage<RoomAvailable[]>('rooms', (list) => {
    for (const r of list) {
      listings.set(r.roomId, r);
    }
  });
  lobby.onMessage<[string, RoomAvailable]>('+', ([id, r]) => listings.set(id, r));
  lobby.onMessage<string>('-', (id) => listings.delete(id));
  const publicRoom = await create('Public');
  const privateRoom = await create('Private', 'invite');
  await until(() => listings.has(publicRoom.roomId));
  assert.ok(!listings.has(privateRoom.roomId));
  const friend = await join(privateRoom.roomId, 'Friend');
  assert.equal(friend.roomId, privateRoom.roomId);
  await leave(publicRoom, privateRoom, friend);
  await until(() => !listings.has(publicRoom.roomId));
  await until(() => !matchMaker.getLocalRoomById(privateRoom.roomId));
  await lobby.leave();
});
test('rooms are isolated; fourth join rejects; leaving frees a seat', async () => {
  const a = await create(),
    b = await create();
  const two = await join(a.roomId, 'Second'),
    three = await join(a.roomId, 'Third');
  assert.equal(authoritative(a).state.players.size, 3);
  assert.equal(authoritative(b).state.players.size, 1);
  await assert.rejects((await authenticated('Fourth')).joinById(a.roomId, {}));
  await two.leave();
  await until(() => authoritative(a).state.players.size === 2);
  const replacement = await join(a.roomId, 'Replacement');
  await leave(a, b, three, replacement);
});
test('authentication is required and room options remain validated', async () => {
  await assert.rejects(client.create('expedition', { name: 'Forged', visibility: 'public' }));
  await assert.rejects(
    (await authenticated('Valid')).create('expedition', {
      visibility: 'wrong',
      characterClass: 'archer',
    }),
  );
  const room = await create();
  await assert.rejects(client.joinById(room.roomId, { name: 'Forged' }));
  assert.equal(authoritative(room).state.players.size, 1);
  await room.leave();
});
test('malformed values are sanitized and excess inputs cannot accelerate movement or firing', async () => {
  const room = await create();
  const serverRoom = authoritative(room);
  const p = serverRoom.state.players.get(room.sessionId)!;
  const input = room.input({ type: MoveInput });
  Object.assign(input.data, { moveX: NaN, moveY: Infinity, aim: NaN, fire: false });
  input.send();
  await sleep(70);
  assert.equal(p.x, 250);
  assert.equal(p.y, 790);
  assert.equal(p.aim, 0);
  Object.assign(input.data, { moveX: 999, moveY: 0, aim: 0, fire: true });
  const start = p.x,
    at = serverRoom.state.elapsed;
  for (let i = 0; i < 80; i++) {
    input.send();
  }
  await sleep(160);
  assert.ok(p.x - start <= RULES.playerSpeed * ((serverRoom.state.elapsed - at) / 1000 + 1 / 30));
  assert.ok(serverRoom.inputs.get(room.sessionId).size <= RULES.inputBuffer);
  assert.equal(serverRoom.state.projectiles.size, 0);
  assert.ok(p.chargeStartedAt >= at);
  await room.leave();
});
test('alternating press/release floods are still limited to one input per simulation step', async () => {
  const room = await create();
  try {
    const sr = authoritative(room),
      input = room.input({ type: MoveInput });
    const player = sr.state.players.get(room.sessionId)!;
    const start = sr.state.elapsed;
    for (let i = 0; i < 80; i++) {
      input.data.fire = i % 2 === 0;
      input.send();
    }
    await sleep(180);
    const ticks = Math.ceil((sr.state.elapsed - start) / (1000 / RULES.tickRate));
    const shots = [...sr.state.projectiles.values()].filter((p) => p.owner === room.sessionId);
    assert.ok(shots.length > 0, 'releases produce attacks');
    assert.ok(shots.length <= Math.ceil(ticks / 2), 'press and release each consume a fixed step');
    assert.ok(player.lastAttackAt <= sr.state.elapsed);
    assert.ok(sr.inputs.get(room.sessionId).size <= RULES.inputBuffer);
  } finally {
    await room.leave();
  }
});
test('the flood cap disconnects an abusive sender without simulating the burst', async () => {
  const room = await create();
  room.reconnection.enabled = false;
  const p = authoritative(room).state.players.get(room.sessionId)!;
  const input = room.input({ type: MoveInput });
  input.data.moveX = 1;
  input.data.fire = true;
  const dropped = new Promise<void>((resolve) => room.onLeave(() => resolve()));
  for (let i = 0; i < 250; i++) {
    input.send();
  }
  await dropped;
  assert.ok(p.x - 250 <= 18);
});
test('authoritative projectile combat is synchronized to teammates', async () => {
  const room = await create(),
    friend = await join(room.roomId, 'Friend');
  const sim = authoritative(room);
  const player = sim.state.players.get(room.sessionId)!;
  Object.assign(player, { x: 510, y: 750 });
  const mob = sim.state.mobs.get('ranged-0')!;
  Object.assign(mob, { x: 650, y: 750 });
  const input = room.input({ type: MoveInput });
  input.data.aim = 0;
  input.data.fire = true;
  const timer = setInterval(() => {
    input.data.aim = Math.atan2(mob.y - player.y, mob.x - player.x);
    input.data.fire =
      player.chargeStartedAt < 0 || sim.state.elapsed - player.chargeStartedAt < 700;
    input.send();
  }, 1000 / 30);
  try {
    await until(() => mob.hp <= 0, 8000);
    await until(() => friend.state.mobs.get('ranged-0')!.hp === 0);
    assert.equal(player.kills, 1);
    assert.equal(sim.state.players.get(friend.sessionId)!.hp, 100);
  } finally {
    clearInterval(timer);
    await leave(room, friend);
  }
});
test('automatic reconnection preserves session, pauses movement, and resets input epoch', async () => {
  const room = await create();
  const sid = room.sessionId;
  const sr = authoritative(room);
  const input = room.input({ type: MoveInput });
  const epoch = input.epoch;
  input.data.special = true;
  input.send();
  await until(() => sr.state.players.get(sid)!.nextSpecialAt > 0);
  const cooldown = sr.state.players.get(sid)!.nextSpecialAt;
  input.data.special = false;
  input.data.fire = true;
  input.send();
  await until(() => sr.state.players.get(sid)!.chargeStartedAt >= 0);
  input.data.fire = false;
  room.reconnection.minDelay = 200;
  room.reconnection.delay = 200;
  const dropped = new Promise<void>((resolve) => room.onDrop(() => resolve()));
  const recovered = new Promise<void>((resolve) => room.onReconnect(() => resolve()));
  room.connection.close();
  await dropped;
  await sleep(50);
  assert.equal(sr.state.players.get(sid)!.connected, false);
  const x = sr.state.players.get(sid)!.x;
  await recovered;
  await until(() => sr.state.players.get(sid)!.connected);
  assert.equal(sr.state.players.get(sid)!.x, x);
  assert.equal(room.sessionId, sid);
  assert.ok(input.epoch > epoch);
  assert.equal(sr.state.players.get(sid)!.nextSpecialAt, cooldown);
  assert.equal(sr.state.players.get(sid)!.chargeStartedAt, -1);
  assert.equal(sr.state.players.get(sid)!.lastAttackAt, -1);
  input.data.moveX = 1;
  input.send();
  await until(() => sr.state.players.get(sid)!.x > x);
  await room.leave();
});
test(
  'unrecovered seats expire after 15 seconds and empty rooms dispose',
  { timeout: 20000 },
  async () => {
    const room = await create();
    const id = room.roomId;
    room.reconnection.enabled = false;
    room.connection.close();
    await sleep(100);
    assert.ok(matchMaker.getLocalRoomById(id));
    await until(() => !matchMaker.getLocalRoomById(id), 16500);
  },
);
test('SDK reconciliation replays pending input against server corrections and terrain; respawn reset discards old life', async () => {
  const room = await create();
  const sr = authoritative(room);
  const input = room.input({ type: MoveInput });
  const predict = Predict.get(room, { delay: 100 });
  const self = room.state.players.get(room.sessionId)!;
  let replayCount = 0;
  const me = predict.reconciler(self, {
    input,
    fields: ['x', 'y', 'aim', 'hp', 'connected'],
    smoothMs: 0,
    step: (ctx, state, cmd: Intent) => {
      if (ctx.isReplay) {
        replayCount++;
      }
      movePlayer(state, cmd, ctx.dt);
    },
  });
  try {
    const start = me.state.x;
    input.data.moveX = 1;
    input.send();
    assert.equal(me.state.x, start + 6);
    // Authoritative correction places the player against a wall while several commands remain pending.
    Object.assign(sr.state.players.get(room.sessionId)!, { x: 452, y: 520 });
    input.data.moveY = 1;
    for (let i = 0; i < 6; i++) {
      input.send();
    }
    for (let i = 0; i < 30; i++) {
      predict.tick(performance.now());
      await sleep(16);
    }
    assert.ok(replayCount > 0);
    assert.equal(input.pendingCount, 0);
    assert.ok(Math.abs(me.state.x - self.x) < 0.00001);
    assert.ok(Math.abs(me.state.y - self.y) < 0.00001);
    assert.ok(me.state.x <= 460);
    Object.assign(sr.state.players.get(room.sessionId)!, {
      hp: 0,
      respawnAt: sr.state.elapsed + 100,
    });
    await until(() => self.generation === 1);
    me.reset();
    assert.equal(me.state.x, self.x);
    assert.equal(me.state.y, self.y);
    input.data.moveX = 0;
    input.data.moveY = 0;
    input.send();
    await sleep(100);
    predict.tick(performance.now());
    assert.equal(me.state.x, self.x);
  } finally {
    predict.dispose();
    await room.leave();
  }
});

test('three class abilities cross the input wire, synchronize timers and reject repeated activation', async () => {
  const archer = await create('Archer'),
    mage = await join(archer.roomId, 'Mage', 'mage'),
    warrior = await join(archer.roomId, 'Warrior', 'warrior');
  const rooms = [archer, mage, warrior],
    sr = authoritative(archer);
  try {
    for (const room of rooms) {
      const input = room.input({ type: MoveInput });
      input.data.special = true;
      input.data.fire = true;
      input.send();
      input.data.fire = false;
      for (let i = 0; i < 6; i++) {
        input.send();
      }
    }
    await until(() =>
      [...sr.state.players.values()].every((p) => p.nextSpecialAt > 0 && p.lastAttackAt > 0),
    );
    const timers = rooms.map((r) => sr.state.players.get(r.sessionId)!.nextSpecialAt);
    for (const room of rooms) {
      const player = sr.state.players.get(room.sessionId)!;
      const rules = CLASS_COMBAT[player.characterClass as CharacterClass];
      assert.ok(
        Math.abs(player.nextSpecialAt - player.lastAttackAt - rules.special.cooldownMs) <= 34,
      );
    }
    assert.equal(
      [...sr.state.projectiles.values()].filter((p) => p.owner === archer.sessionId).length,
      13,
    );
    assert.deepEqual(
      [...sr.state.projectiles.values()]
        .filter((p) => p.owner === mage.sessionId)
        .map((p) => p.kind)
        .sort(),
      ['fireball', 'inferno'],
    );
    assert.equal(
      [...sr.state.projectiles.values()].filter((p) => p.owner === warrior.sessionId).length,
      0,
    );
    await until(() => (archer.state.players.get(warrior.sessionId)?.invulnerableUntil ?? 0) > 0);
    await until(() => archer.state.players.get(warrior.sessionId)!.sweepAt >= 0);
    await sleep(300);
    assert.deepEqual(
      rooms.map((r) => sr.state.players.get(r.sessionId)!.nextSpecialAt),
      timers,
    );
  } finally {
    await leave(...rooms);
  }
});

test('each selected map is synchronized, listed, isolated, and inherited by joining players', async () => {
  const sdk = await authenticated('Maps');
  for (const mapId of MAP_IDS) {
    const room = await sdk.create<WorldState>(
      'expedition',
      { visibility: 'public', characterClass: 'archer', mapId },
      WorldState,
    );
    connected.push(room);
    await until(() => !!room.state?.players?.has(room.sessionId));
    const serverRoom = authoritative(room);
    assert.equal(room.state.mapId, mapId);
    assert.equal(serverRoom.metadata.mapId, mapId);
    assert.equal(serverRoom.simulation.map, MAPS[mapId]);
    const friend = await (
      await authenticated('Guest')
    ).joinById<WorldState>(room.roomId, { characterClass: 'mage', mapId: 'invalid' }, WorldState);
    connected.push(friend);
    await until(() => friend.state?.mapId === mapId && friend.state.players.has(friend.sessionId));
    assert.deepEqual(
      [...friend.state.mobs.values()].map((m) => m.role).sort(),
      MAPS[mapId].enemies.map((m) => m.role).sort(),
    );
    await leave(room, friend);
  }
  await assert.rejects(
    sdk.create('expedition', { visibility: 'public', characterClass: 'mage', mapId: 'unknown' }),
  );
});

test('room loadouts spend supplies once, refuse forged equipment and retain carried supplies through recovery', async () => {
  const account = await accounts.register({
    username: `Supplies${++userCounter}`,
    password: 'integration-password',
  });
  const sdk = new Client('ws://localhost:2568');
  sdk.http.options.headers = { Cookie: `openrpg_session=${account.token}` };
  const store = new Adventures(database.pool);
  await assert.rejects(
    sdk.create('expedition', {
      visibility: 'public',
      characterClass: 'archer',
      loadout: { weapon: 'oak-bow', potions: 3 },
    }),
  );
  assert.equal((await store.profile(account.profile.id)).potions, 3);
  const room = await sdk.create<WorldState>(
    'expedition',
    { visibility: 'public', characterClass: 'archer', loadout: { potions: 2 } },
    WorldState,
  );
  connected.push(room);
  await until(() => !!room.state?.players?.has(room.sessionId));
  assert.equal(authoritative(room).state.players.get(room.sessionId)!.potions, 2);
  await assert.rejects(sdk.joinById(room.roomId, { characterClass: 'mage' }));
  assert.equal(authoritative(room).state.players.size, 1);
  const player = authoritative(room).state.players.get(room.sessionId)!;
  player.hp = 20;
  for (let i = 0; i < 15; i++) {
    room.send('potion');
  }
  await until(() => player.hp === 70);
  assert.equal(player.potions, 1);
  room.reconnection.minUptime = 0;
  let recovered = false;
  room.onReconnect(() => {
    recovered = true;
  });
  room.connection.close();
  await until(() => recovered, 5000);
  assert.equal(player.potions, 1);
  assert.equal((await store.profile(account.profile.id)).potions, 1);
  assert.equal(await room.request<undefined, boolean>('save-rewards'), true);
  await room.leave();
  assert.equal((await store.profile(account.profile.id)).potions, 1);
});
test('party kills create personal drops, require collection and isolate other rooms', async () => {
  const a = await create('LootWarrior', 'public', 'warrior'),
    b = await join(a.roomId, 'LootMage', 'mage'),
    isolated = await create('NoLoot');
  const room = authoritative(a),
    store = new Adventures(database.pool);
  const accountId = (id: string) => room.clients.find((c) => c.sessionId === id)!.auth!.profile.id;
  const first = accountId(a.sessionId),
    second = accountId(b.sessionId);
  const p = room.state.players.get(a.sessionId)!;
  const mob = room.state.mobs.get('melee-1')!;
  const mage = room.state.players.get(b.sessionId)!;
  Object.assign(mage, { x: p.x - 100, y: p.y });
  Object.assign(mob, { x: p.x + 35, y: p.y, hp: 1 });
  room.simulation.applyInput(
    a.sessionId,
    { moveX: 0, moveY: 0, aim: 0, fire: true, special: false },
    1 / 30,
  );
  room.simulation.applyInput(
    a.sessionId,
    { moveX: 0, moveY: 0, aim: 0, fire: false, special: false },
    1 / 30,
  );
  assert.equal(mob.hp, 0);
  assert.equal(room.state.drops.size, 6);
  assert.deepEqual((await store.profile(first)).items, []);
  assert.deepEqual((await store.profile(second)).items, []);
  Object.assign(p, { x: mob.x, y: mob.y });
  await until(() => room.state.drops.size === 3 && room.state.saveStatus === 'saved');
  assert.deepEqual((await store.profile(second)).items, []);
  Object.assign(mage, { x: mob.x, y: mob.y });
  await until(() => room.state.drops.size === 0 && room.state.saveStatus === 'saved');
  assert.equal((await store.profile(first)).coins, 35);
  assert.deepEqual((await store.profile(first)).items, [{ id: 'iron-sword', quantity: 1 }]);
  assert.deepEqual((await store.profile(second)).items, [{ id: 'ember-rod', quantity: 1 }]);
  const other = authoritative(isolated).clients[0]!.auth!.profile.id;
  assert.deepEqual((await store.profile(other)).items, []);
  await leave(a, b, isolated);
  assert.deepEqual((await store.profile(first)).items, [{ id: 'iron-sword', quantity: 1 }]);
});
test('story room enforces map locks, one life per account, terminal admission and survivor progression', async () => {
  const account = await accounts.register({
    username: `Story${++userCounter}`,
    password: 'integration-password',
  });
  const sdk = new Client('ws://localhost:2568');
  sdk.http.options.headers = { Cookie: `openrpg_session=${account.token}` };
  const options = { visibility: 'public', mode: 'story', characterClass: 'warrior' };
  await assert.rejects(sdk.create('expedition', { ...options, mapId: 'castle' }));
  const room = await sdk.create<WorldState>(
    'expedition',
    { ...options, mapId: 'forest' },
    WorldState,
  );
  connected.push(room);
  await until(() => !!room.state?.players?.has(room.sessionId));
  const dead = await join(room.roomId, 'StoryFallen'),
    otherSdk = await authenticated('LockedGuest');
  const serverRoom = authoritative(room),
    deadAccount = serverRoom.clients.find((c) => c.sessionId === dead.sessionId)!.auth!.profile.id;
  serverRoom.state.players.get(dead.sessionId)!.hp = 0;
  for (const mob of serverRoom.state.mobs.values()) {
    mob.hp = 0;
  }
  await until(
    () => serverRoom.state.outcome === 'complete' && serverRoom.state.saveStatus === 'saved',
  );
  const store = new Adventures(database.pool);
  assert.equal((await store.profile(account.profile.id)).completedMaps, 1);
  assert.equal((await store.profile(deadAccount)).completedMaps, 0);
  await assert.rejects(otherSdk.joinById(room.roomId, { characterClass: 'archer' }));
  await leave(room, dead);
  const castle = await sdk.create<WorldState>(
    'expedition',
    { ...options, mapId: 'castle' },
    WorldState,
  );
  connected.push(castle);
  await until(() => !!castle.state?.players?.has(castle.sessionId));
  await assert.rejects(
    otherSdk.joinById(castle.roomId, {
      characterClass: 'archer',
      mode: 'testing',
      mapId: 'forest',
    }),
  );
  const helperAccount = await accounts.register({
    username: `StoryHelper${++userCounter}`,
    password: 'integration-password',
  });
  await store.reward(helperAccount.profile.id, 'helper-unlock', {
    items: [],
    potions: 0,
    completedMap: 'forest',
  });
  const helperSdk = new Client('ws://localhost:2568');
  helperSdk.http.options.headers = { Cookie: `openrpg_session=${helperAccount.token}` };
  const helper = await helperSdk.joinById<WorldState>(
    castle.roomId,
    { characterClass: 'mage' },
    WorldState,
  );
  connected.push(helper);
  await until(() => authoritative(castle).state.players.size === 2);
  await castle.leave();
  await until(() => authoritative(helper).state.players.size === 1);
  await assert.rejects(sdk.joinById(helper.roomId, { characterClass: 'warrior' }));
  await helper.leave();
});

test('Fight admits fresh accounts on every map with no enemies or story restrictions', async () => {
  const sdk = await authenticated('Fighter');
  for (const mapId of MAP_IDS) {
    const room = await sdk.create<WorldState>(
      'expedition',
      { visibility: 'public', mode: 'fight', mapId, characterClass: 'mage' },
      WorldState,
    );
    connected.push(room);
    await until(() => !!room.state?.players?.has(room.sessionId));
    assert.equal(room.state.mode, 'fight');
    assert.equal(room.state.mapId, mapId);
    assert.equal(room.state.mobs.size, 0);
    assert.equal(authoritative(room).metadata.mode, 'fight');
    await room.leave();
  }
});

test('Fight synchronizes PvP damage, kills and respawns to three players without awarding loot', async () => {
  const sdk = await authenticated('Duelist');
  const room = await sdk.create<WorldState>(
    'expedition',
    { visibility: 'public', mode: 'fight', mapId: 'forest', characterClass: 'mage' },
    WorldState,
  );
  connected.push(room);
  await until(() => !!room.state?.players?.has(room.sessionId));
  const rival = await join(room.roomId, 'Rival'),
    witness = await join(room.roomId, 'Witness', 'warrior');
  const sr = authoritative(room),
    hero = sr.state.players.get(room.sessionId)!,
    target = sr.state.players.get(rival.sessionId)!;
  const store = new Adventures(database.pool),
    accountId = sr.clients.find((c) => c.sessionId === room.sessionId)!.auth!.profile.id;
  const before = await store.profile(accountId);
  Object.assign(hero, { x: 250, y: 790, protectedUntil: 0 });
  Object.assign(target, { x: 310, y: 790, protectedUntil: 0 });
  const input = room.input({ type: MoveInput });
  input.data.aim = 0;
  input.data.special = true;
  input.send();
  await until(() => witness.state.players.get(rival.sessionId)?.hp === 0);
  assert.equal(hero.hp, 100);
  assert.equal(hero.kills, 1);
  assert.equal(target.generation, 0);
  await until(() => rival.state.players.get(rival.sessionId)?.generation === 1, 5000);
  assert.equal(target.hp, 100);
  assert.ok(target.protectedUntil > sr.state.elapsed);
  assert.equal(sr.state.mobs.size, 0);
  assert.equal(sr.state.drops.size, 0);
  assert.equal(sr.state.outcome, 'active');
  assert.deepEqual(await store.profile(accountId), before);
  await leave(room, rival, witness);
});

test('logout during asynchronous equipment admission cannot leave an authenticated player behind', async () => {
  const anchor = await create('AdmissionAnchor');
  const store = authoritative(anchor).adventures,
    original = store.embark.bind(store);
  let release!: () => void,
    reached = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  store.embark = async (...args) => {
    reached = true;
    await gate;
    return original(...args);
  };
  const account = await accounts.register({
    username: `Admission${++userCounter}`,
    password: 'integration-password',
  });
  const sdk = new Client('ws://localhost:2568');
  sdk.http.options.headers = { Cookie: `openrpg_session=${account.token}` };
  const joining = sdk.joinById(anchor.roomId, { characterClass: 'mage' });
  const rejected = assert.rejects(joining, /session ended/);
  try {
    await until(() => reached);
    await accounts.logout(account.token);
    release();
    await rejected;
    assert.equal(authoritative(anchor).state.players.size, 1);
  } finally {
    release();
    store.embark = original;
    await anchor.leave();
  }
});

test('village requires authentication, shares presence beyond a party, and stays out of expedition listings', async () => {
  await assert.rejects(client.joinOrCreate('village', { characterClass: 'archer' }));
  const visitors = [];
  for (let i = 0; i < 4; i++) {
    const room = await (
      await authenticated('Villager')
    ).joinOrCreate<VillageState>(
      'village',
      { characterClass: 'archer', name: 'Forged' },
      VillageState,
    );
    connected.push(room);
    visitors.push(room);
  }
  const first = visitors[0]!;
  await until(() => first.state?.players?.size === 4);
  assert.ok(visitors.every((room) => room.roomId === first.roomId));
  assert.ok([...first.state.players.values()].every((p) => p.name !== 'Forged'));
  assert.equal((matchMaker.getLocalRoomById(first.roomId) as Village).maxClients, 24);
  assert.equal(await first.request('interact', 'shop'), false);
  assert.equal(await first.request('interact', undefined), false);
  assert.equal(await first.request('appearance', { characterClass: 'warrior' }), false);
  await leave(...visitors);
  await until(() => !matchMaker.getLocalRoomById(first.roomId));
});

test('full villages overflow, while public and invite expeditions work across villages', async () => {
  const visitors: Room<VillageState>[] = [];
  const clients: Client[] = [];
  for (let i = 0; i <= VILLAGE.capacity; i++) {
    const sdk = await authenticated('Overflow');
    const room = await sdk.joinOrCreate<VillageState>(
      'village',
      { characterClass: 'archer' },
      VillageState,
    );
    clients.push(sdk);
    visitors.push(room);
    connected.push(room);
  }
  const first = visitors[0]!,
    last = visitors.at(-1)!;
  await until(
    () => first.state?.players?.size === VILLAGE.capacity && last.state?.players?.size === 1,
  );
  assert.ok(visitors.slice(0, VILLAGE.capacity).every((room) => room.roomId === first.roomId));
  assert.notEqual(last.roomId, first.roomId);
  // Discovery is global; the village ID is never part of expedition admission.
  const lobby = await clients.at(-1)!.joinOrCreate('lobby', { filter: { name: 'expedition' } });
  connected.push(lobby);
  const listed = new Set<string>();
  lobby.onMessage<RoomAvailable[]>('rooms', (rooms) =>
    rooms.forEach((room) => listed.add(room.roomId)),
  );
  lobby.onMessage<[string, RoomAvailable]>('+', ([id]) => listed.add(id));
  lobby.onMessage<string>('-', (id) => listed.delete(id));
  for (const visibility of ['public', 'invite']) {
    const expedition = await clients[0]!.create<WorldState>(
      'expedition',
      { visibility, characterClass: 'archer' },
      WorldState,
    );
    connected.push(expedition);
    if (visibility === 'public') {
      await until(() => listed.has(expedition.roomId));
    } else {
      await sleep(100);
      assert.equal(listed.has(expedition.roomId), false);
    }
    const guest = await clients
      .at(-1)!
      .joinById(expedition.roomId, { characterClass: 'mage' }, WorldState);
    connected.push(guest);
    await until(() => expedition.state?.players?.size === 2);
    await leave(expedition, guest);
  }
  await leave(lobby, ...visitors);
  await until(
    () => !matchMaker.getLocalRoomById(first.roomId) && !matchMaker.getLocalRoomById(last.roomId),
  );
});

test('village validates equipment, freezes station movement, bounds floods and recovers presence', async () => {
  const sdk = await authenticated('Walker');
  const room = await sdk.joinOrCreate<VillageState>(
    'village',
    { characterClass: 'archer' },
    VillageState,
  );
  connected.push(room);
  room.reconnection.minUptime = 0;
  await until(() => !!room.state?.players?.has(room.sessionId));
  const host = matchMaker.getLocalRoomById(room.roomId) as Village;
  const player = host.state.players.get(room.sessionId)!;
  const input = room.input({ type: MoveInput });
  Object.assign(input.data, { moveX: NaN, moveY: Infinity, aim: NaN });
  input.send();
  await sleep(100);
  assert.equal(player.x, VILLAGE.spawn.x);
  assert.equal(player.y, VILLAGE.spawn.y);
  const x = player.x,
    started = host.clock.elapsedTime;
  Object.assign(input.data, { moveX: 9999, moveY: 0, fire: true, special: true });
  for (let i = 0; i < 80; i++) {
    input.send();
  }
  await sleep(300);
  assert.ok(player.x - x <= RULES.playerSpeed * ((host.clock.elapsedTime - started) / 1000 + 0.05));
  assert.equal(player.hp, 100);
  await sleep(600);
  // Authoritative fixture placement isolates station permissions from walking time.
  player.x = 300;
  player.y = 410;
  assert.equal(await room.request('interact', 'shop'), true);
  const before = { x: player.x, y: player.y };
  input.send();
  await sleep(100);
  assert.equal(player.x, before.x);
  assert.equal(player.y, before.y);
  assert.equal(
    await room.request('appearance', { characterClass: 'warrior', loadout: { weapon: 'oak-bow' } }),
    false,
  );
  await sleep(550);
  assert.equal(await room.request('appearance', { characterClass: 'warrior' }), true);
  await until(() => room.state.players.get(room.sessionId)!.characterClass === 'warrior');
  assert.equal(await room.request('interact', ''), true);
  let recovered = false;
  room.onReconnect(() => {
    recovered = true;
  });
  room.connection.close();
  await until(() => recovered, 5000);
  assert.equal(host.state.players.size, 1);
  assert.equal(player.connected, true);
  assert.equal(player.activity, '');
  await room.leave();
});

test('revoking an account session removes its village presence immediately', async () => {
  const registration = await accounts.register({
    username: `VillageEnd${++userCounter}`,
    password: 'integration-password',
  });
  const sdk = new Client('ws://localhost:2568');
  sdk.http.options.headers = { Cookie: `openrpg_session=${registration.token}` };
  const room = await sdk.joinOrCreate<VillageState>(
    'village',
    { characterClass: 'mage' },
    VillageState,
  );
  connected.push(room);
  await until(() => !!room.state?.players?.has(room.sessionId));
  let ended = false;
  room.onMessage('account-ended', () => {
    ended = true;
  });
  await accounts.logout(registration.token);
  await until(() => ended);
  await until(() => !matchMaker.getLocalRoomById(room.roomId));
});
