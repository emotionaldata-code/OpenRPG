import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldState, Player, Mob, LootDrop, LOOT, parseTrade, type Reward } from '@openrpg/shared';
import { Loot } from '../server/src/simulation/loot.js';
import { Simulation } from '../server/src/simulation/world.js';
import { Adventures } from '../server/src/adventure/store.js';
import { Accounts } from '../server/src/auth/accounts.js';
import { createGameServer } from '../server/src/app.config.js';
import { Skins } from '../server/src/skins/store.js';
import { testDatabase } from './helpers/database.js';
import { migrate } from '../server/src/db/migrate.js';

test('loot requires the living connected owner nearby, expires and cannot be claimed twice', () => {
  const state = new WorldState();
  state.players.set(
    'a',
    new Player({ name: 'Mage', protectedUntil: 0, x: 200, y: 790, characterClass: 'mage' }),
  );
  state.players.set('b', new Player({ name: 'Archer', protectedUntil: 0, x: 500, y: 790 }));
  const collected: { id: string; reward: Reward }[] = [];
  const loot = new Loot(state, (id, _drop, reward) => collected.push({ id, reward }));
  loot.spawn(new Mob({ x: 500, y: 790, role: 'melee' }));
  assert.equal(state.drops.size, 6);
  loot.step();
  assert.equal(collected.length, 0);
  state.elapsed = 500;
  loot.step();
  assert.equal(collected.length, 3);
  assert.ok(collected.every((entry) => entry.id === 'b'));
  const a = state.players.get('a')!;
  a.x = 500;
  a.hp = 0;
  loot.step();
  assert.equal(collected.length, 3);
  a.hp = 100;
  a.connected = false;
  loot.step();
  assert.equal(collected.length, 3);
  a.connected = true;
  loot.step();
  assert.equal(collected.length, 6);
  loot.step();
  assert.equal(collected.length, 6);
  assert.deepEqual(
    collected.find((entry) => entry.id === 'a' && entry.reward.items.length)?.reward.items,
    ['ember-rod'],
  );
  loot.spawn(new Mob({ x: 700, y: 790 }));
  state.elapsed += LOOT.lifetimeMs;
  loot.step();
  assert.equal(state.drops.size, 0);
  for (let i = 0; i < 100; i++) {
    loot.spawn(new Mob({ x: 700, y: 790 }));
  }
  assert.equal(state.drops.size, LOOT.maxDrops);
  loot.removePlayer('a');
  assert.ok([...state.drops.values()].every((drop) => drop.owner !== 'a'));
});
test('pickups do not cross walls and final Story drops remain reachable after victory', () => {
  const state = new WorldState(),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero');
  const p = state.players.get('hero')!,
    wall = sim.map.obstacles.find((w) => w.width <= 24 || w.height <= 24);
  // An actual map wall edge: both points close enough, but the segment enters solid terrain.
  const obstacle = wall ?? sim.map.obstacles[0]!;
  Object.assign(p, { x: obstacle.x - 10, y: obstacle.y + obstacle.height / 2 });
  state.drops.set(
    'wall',
    new LootDrop({
      owner: 'hero',
      itemId: 'potion',
      quantity: 1,
      x: obstacle.x + 10,
      y: p.y,
      availableAt: 0,
      expiresAt: 1000,
    }),
  );
  let collected = 0;
  const loot = new Loot(state, () => collected++);
  loot.step();
  assert.equal(collected, 0);
  state.drops.clear();
  Object.assign(p, { x: 200, y: 790 });
  state.outcome = 'complete';
  loot.spawn(new Mob({ x: 240, y: 790, role: 'boss' }));
  sim.applyInput('hero', { moveX: 1, moveY: 0, aim: 0, fire: true, special: false }, 0.2);
  sim.advance(0.6);
  loot.step();
  assert.ok(p.x > 200);
  assert.ok(collected > 0);
  assert.equal(state.projectiles.size, 0);
});
test('shop rejects malformed requests rather than trusting quantities or prices', () => {
  for (const value of [
    null,
    [],
    {},
    { action: 'give', itemId: 'potion' },
    { action: 'buy', itemId: 'coins' },
    { action: 'sell', itemId: '__proto__' },
  ]) {
    assert.throws(() => parseTrade(value));
  }
  assert.deepEqual(parseTrade({ action: 'buy', itemId: 'potion', quantity: 999, price: 0 }), {
    action: 'buy',
    itemId: 'potion',
  });
});
let db: Awaited<ReturnType<typeof testDatabase>>, store: Adventures, accounts: Accounts;
let server: ReturnType<typeof createGameServer>;
let sequence = 0;
const user = async () =>
  accounts.register({ username: `Merchant${++sequence}`, password: 'merchant-password' });
before(async () => {
  db = await testDatabase();
  store = new Adventures(db.pool);
  accounts = new Accounts(db.pool);
  server = createGameServer(accounts, new Skins(db.pool), store, 'http://localhost:5173');
  await server.listen(2572);
});
after(async () => {
  await server?.gracefullyShutdown(false);
  await db?.cleanup();
});
test('shop serializes concurrent buys and sales without negative coins or duplicated gear', async () => {
  const id = (await user()).profile.id;
  const buys = await Promise.allSettled(
    Array.from({ length: 8 }, () => store.trade(id, { action: 'buy', itemId: 'potion', price: 0 })),
  );
  assert.equal(buys.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal((await store.profile(id)).coins, 0);
  assert.equal((await store.profile(id)).potions, 6);
  await store.reward(id, 'loot-a', { items: ['oak-bow', 'oak-bow'], potions: 0 });
  const sales = await Promise.allSettled(
    Array.from({ length: 8 }, () => store.trade(id, { action: 'sell', itemId: 'oak-bow' })),
  );
  assert.equal(sales.filter((r) => r.status === 'fulfilled').length, 2);
  assert.deepEqual((await store.profile(id)).items, []);
  assert.equal((await store.profile(id)).coins, 40);
  await assert.rejects(
    store.embark(id, 'archer', 'forest', 'testing', { weapon: 'oak-bow', armor: '', potions: 0 }),
    /collected/,
  );
  await store.reward(id, 'coins', { items: [], potions: 0, coins: 100 });
  await store.trade(id, { action: 'buy', itemId: 'oak-bow' });
  assert.deepEqual((await store.profile(id)).items, [{ id: 'oak-bow', quantity: 1 }]);
  assert.equal((await store.profile(id)).coins, 60);
});
test('shop enforces storage and purse caps; reward receipts remain idempotent for stacked loot', async () => {
  const id = (await user()).profile.id;
  const reward = { items: ['iron-armor'], potions: 1, coins: 25 };
  await Promise.all([store.reward(id, 'same', reward), store.reward(id, 'same', reward)]);
  assert.equal((await store.profile(id)).coins, 55);
  assert.equal((await store.profile(id)).items[0]!.quantity, 1);
  await db.pool.query('UPDATE account_items SET quantity=999 WHERE account_id=$1', [id]);
  await db.pool.query('UPDATE adventurers SET coins=999999,potions=999 WHERE account_id=$1', [id]);
  await assert.rejects(store.trade(id, { action: 'buy', itemId: 'iron-armor' }), /full/);
  await assert.rejects(store.trade(id, { action: 'buy', itemId: 'potion' }), /full/);
  await assert.rejects(store.trade(id, { action: 'sell', itemId: 'iron-armor' }), /full/);
  await store.reward(id, 'cap', reward);
  assert.equal((await store.profile(id)).items[0]!.quantity, 999);
});
test('loot migration preserves existing gear and supplies', async () => {
  const id = (await user()).profile.id;
  await migrate(db.url, 'down');
  await db.pool.query(
    'INSERT INTO adventurers(account_id,potions,completed_maps) VALUES($1,17,2)',
    [id],
  );
  await db.pool.query("INSERT INTO account_items(account_id,item_id) VALUES($1,'ember-rod')", [id]);
  await migrate(db.url);
  assert.deepEqual(await store.profile(id), {
    items: [{ id: 'ember-rod', quantity: 1 }],
    potions: 17,
    completedMaps: 2,
    coins: 30,
  });
});
test('trade HTTP requires authentication, correct origin and JSON, and ignores forged prices', async () => {
  const account = await user(),
    url = 'http://localhost:2572/api/adventure/trade';
  const headers = {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    Cookie: `openrpg_session=${account.token}`,
  };
  const body = JSON.stringify({ action: 'buy', itemId: 'potion', price: -1000, quantity: 999 });
  assert.equal(
    (await fetch(url, { method: 'POST', headers: { ...headers, Cookie: '' }, body })).status,
    401,
  );
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://other.example' },
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body,
      })
    ).status,
    403,
  );
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{bad' })).status, 400);
  const response = await fetch(url, { method: 'POST', headers, body });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.coins, 20);
  assert.equal(profile.potions, 4);
});
