import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorldState,
  Mob,
  Player,
  ITEMS,
  MAP_IDS,
  emptyLoadout,
  parseLoadout,
  parseMode,
  enemyLoot,
  equipmentStats,
  equippedCombat,
  type Intent,
} from '@openrpg/shared';
import { Simulation } from '../server/src/simulation/world.js';
import { Combat } from '../server/src/simulation/combat.js';
import { Adventures } from '../server/src/adventure/store.js';
import { Rewards } from '../server/src/adventure/rewards.js';
import { Accounts } from '../server/src/auth/accounts.js';
import { testDatabase } from './helpers/database.js';

const attack: Intent = { moveX: 0, moveY: 0, aim: 0, fire: true, special: false };
test('story enemies stay dead after one defeat; completion still requires every enemy', () => {
  const state = new WorldState({ mode: 'story' }),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero');
  const mobs = [...state.mobs.values()];
  const survivor = mobs.find((mob) => mob.role === 'melee')!;
  for (const mob of mobs) {
    if (mob !== survivor) {
      mob.hp = 0;
      mob.respawnAt = 8000;
    }
  }
  for (let i = 0; i < 600; i++) {
    sim.advance(1 / 30);
  }
  assert.equal(state.outcome, 'active', 'defeating the boss does not skip remaining enemies');
  for (const mob of mobs) {
    assert.equal(mob.hp > 0, mob === survivor);
    assert.equal(mob.generation, 0, 'no enemy receives another life');
  }
  survivor.hp = 0;
  sim.advance(1 / 30);
  assert.equal(state.outcome, 'complete');
  const elapsed = state.elapsed;
  sim.advance(20);
  assert.equal(state.elapsed, elapsed + 20000);
  for (const mob of mobs) {
    assert.equal(mob.hp, 0);
    assert.equal(mob.generation, 0);
  }
});
test('story player death is permanent, party wipe fails, testing remains unlimited', () => {
  for (const mode of ['story', 'testing']) {
    const state = new WorldState({ mode }),
      sim = new Simulation(state);
    sim.addPlayer('a', 'A');
    sim.addPlayer('b', 'B');
    const a = state.players.get('a')!,
      b = state.players.get('b')!;
    a.hp = 0;
    a.respawnAt = 3000;
    sim.advance(4);
    assert.equal(a.hp, mode === 'story' ? 0 : 100);
    if (mode === 'story') {
      b.hp = 0;
      sim.advance(0.1);
      assert.equal(state.outcome, 'failed');
    } else {
      for (let i = 0; i < 3; i++) {
        a.hp = 0;
        a.respawnAt = state.elapsed + 3000;
        sim.advance(4);
        assert.equal(a.hp, 100);
      }
    }
  }
});
test('potions clamp healing, consume once per cooldown and reject dead/disconnected/finished players', () => {
  const state = new WorldState(),
    sim = new Simulation(state);
  sim.addPlayer('a', 'A', 'archer', { ...emptyLoadout(), potions: 3 });
  const p = state.players.get('a')!;
  sim.usePotion('a');
  assert.equal(p.potions, 3);
  p.hp = 70;
  for (let i = 0; i < 100; i++) {
    sim.usePotion('a');
  }
  assert.equal(p.hp, 100);
  assert.equal(p.potions, 2);
  p.hp = 20;
  sim.usePotion('a');
  assert.equal(p.hp, 20);
  state.elapsed = 1000;
  sim.usePotion('a');
  assert.equal(p.hp, 70);
  assert.equal(p.potions, 1);
  state.elapsed = 2000;
  p.connected = false;
  sim.usePotion('a');
  assert.equal(p.potions, 1);
  p.connected = true;
  p.hp = 0;
  sim.usePotion('a');
  assert.equal(p.potions, 1);
  p.respawnAt = state.elapsed + 3000;
  sim.advance(4);
  assert.equal(p.hp, 100);
  assert.equal(p.potions, 1);
  p.hp = 10;
  state.outcome = 'complete';
  sim.usePotion('a');
  assert.equal(p.hp, 10);
});
test('all class weapons increase actual damage and armor affects server deadlines', () => {
  for (const kind of ['archer', 'mage', 'warrior'] as const) {
    const state = new WorldState(),
      player = new Player({
        name: 'Hero',
        characterClass: kind,
        x: 250,
        y: 790,
        protectedUntil: 0,
        weapon: ITEMS.find((i) => i.characterClass === kind && i.slot === 'weapon')!.id,
        armor: ITEMS.find((i) => i.characterClass === kind && i.slot === 'armor')!.id,
      });
    const mob = new Mob({ x: 290, y: 790, hp: 1000 });
    state.players.set('hero', player);
    state.mobs.set('mob', mob);
    const combat = new Combat(state);
    combat.attack('hero', player, attack);
    state.elapsed = equippedCombat(player).primary.chargeMs * 0.7;
    combat.attack('hero', player, { ...attack, fire: false });
    combat.step(0.2);
    assert.equal(mob.hp, 1000 - (kind === 'archer' ? 53 : kind === 'mage' ? 116 : 50));
    assert.equal(player.lastAttackAt, state.elapsed);
    assert.equal(
      equippedCombat(player).primary.chargeMs,
      kind === 'archer' ? 850 : kind === 'mage' ? 1700 : 700,
    );
    combat.attack('hero', player, { ...attack, fire: false, special: true });
    assert.equal(player.nextSpecialAt, state.elapsed + equippedCombat(player).special.cooldownMs);
    if (kind === 'warrior') {
      assert.equal(player.invulnerableUntil, state.elapsed + 5000);
    }
  }
  assert.equal(
    equipmentStats({ characterClass: 'mage', weapon: 'oak-bow', armor: 'iron-armor' })
      .damageMultiplier,
    1,
  );
});
test('each lethal hit generates one reward event and loot matches the recipient class', () => {
  const state = new WorldState(),
    player = new Player({
      name: 'Hero',
      characterClass: 'warrior',
      x: 250,
      y: 790,
      protectedUntil: 0,
    });
  state.players.set('hero', player);
  state.mobs.set('mob', new Mob({ x: 290, y: 790, hp: 10 }));
  let deaths = 0;
  const combat = new Combat(state, () => {
    deaths++;
  });
  combat.attack('hero', player, attack);
  state.elapsed = 490;
  combat.attack('hero', player, { ...attack, fire: false });
  state.elapsed += 700;
  combat.attack('hero', player, attack);
  assert.equal(deaths, 1);
  assert.deepEqual(enemyLoot('melee', 'mage'), { items: ['ember-rod'], potions: 1 });
  assert.deepEqual(enemyLoot('boss', 'warrior'), { items: ['iron-armor'], potions: 1 });
});
test('malformed modes, gear and potion counts are rejected', () => {
  for (const value of [null, 'arena', 1, {}]) {
    assert.throws(() => parseMode(value));
  }
  for (const value of [
    null,
    [],
    { weapon: 'fake' },
    { armor: 'oak-bow' },
    { potions: -1 },
    { potions: 1.5 },
    { potions: 6 },
    { potions: '2' },
    { potions: NaN },
  ]) {
    assert.throws(() => parseLoadout(value));
  }
  assert.deepEqual(parseLoadout(undefined), emptyLoadout());
});

let db: Awaited<ReturnType<typeof testDatabase>>, store: Adventures, accounts: Accounts;
let userNumber = 0;
const user = async () =>
  (
    await accounts.register({
      username: `Adventurer${++userNumber}`,
      password: 'adventure-password',
    })
  ).profile.id;
before(async () => {
  db = await testDatabase();
  store = new Adventures(db.pool);
  accounts = new Accounts(db.pool);
});
after(async () => {
  await db?.cleanup();
});
test('persistent collection starts with supplies, rewards are idempotent and duplicate drops stack', async () => {
  const id = await user();
  assert.deepEqual(await store.profile(id), { items: [], potions: 3, coins: 30, completedMaps: 0 });
  const reward = enemyLoot('melee', 'archer');
  await Promise.all([store.reward(id, 'kill-one', reward), store.reward(id, 'kill-one', reward)]);
  assert.deepEqual(await store.profile(id), {
    items: [{ id: 'oak-bow', quantity: 1 }],
    potions: 4,
    coins: 30,
    completedMaps: 0,
  });
  await store.reward(id, 'kill-two', reward);
  assert.deepEqual(await new Adventures(db.pool).profile(id), {
    items: [{ id: 'oak-bow', quantity: 2 }],
    potions: 5,
    coins: 30,
    completedMaps: 0,
  });
});
test('admission checks unlocks, ownership and class before spending; concurrent packing cannot overspend', async () => {
  const id = await user();
  await assert.rejects(
    store.embark(id, 'archer', 'castle', 'story', { ...emptyLoadout(), potions: 2 }),
    /previous/,
  );
  await assert.rejects(
    store.embark(id, 'archer', 'forest', 'testing', { weapon: 'oak-bow', armor: '', potions: 2 }),
    /collected/,
  );
  assert.equal((await store.profile(id)).potions, 3);
  await store.reward(id, 'bow', { items: ['oak-bow'], potions: 0 });
  await assert.rejects(
    store.embark(id, 'mage', 'forest', 'testing', { weapon: 'oak-bow', armor: '', potions: 2 }),
    /class/,
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      store.embark(id, 'archer', 'hell', 'testing', { weapon: 'oak-bow', armor: '', potions: 2 }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await store.profile(id)).potions, 1);
  assert.deepEqual((await store.profile(id)).items, [{ id: 'oak-bow', quantity: 1 }]);
});
test('story progress advances sequentially once and unlocks all five maps', async () => {
  const id = await user();
  await store.reward(id, 'skip', { items: [], potions: 0, completedMap: 'hell' });
  assert.equal((await store.profile(id)).completedMaps, 0);
  for (const [index, map] of MAP_IDS.entries()) {
    await store.embark(id, 'archer', map, 'story', emptyLoadout());
    await store.reward(id, `clear-${map}`, { items: [], potions: 0, completedMap: map });
    await store.reward(id, `repeat-${map}`, { items: [], potions: 0, completedMap: map });
    assert.equal((await store.profile(id)).completedMaps, index + 1);
  }
});
test('account deletion cascades through equipment, progression, supplies and receipts', async () => {
  const id = await user();
  await store.reward(id, 'delete-loot', enemyLoot('boss', 'warrior'));
  await db.pool.query('DELETE FROM accounts WHERE id=$1', [id]);
  assert.equal(await store.reward(id, 'late-loot', enemyLoot('melee', 'warrior')), false);
  for (const table of ['adventurers', 'account_items', 'adventure_rewards']) {
    assert.equal(
      (await db.pool.query(`SELECT 1 FROM ${table} WHERE account_id=$1`, [id])).rowCount,
      0,
    );
  }
});
test('reward queue retains failures and retries without duplicate rewards', async () => {
  const id = await user();
  let fail = true;
  const statuses: string[] = [];
  class UnreliableStore extends Adventures {
    override async reward(...args: Parameters<Adventures['reward']>): Promise<boolean> {
      const result = await super.reward(...args);
      if (fail) {
        throw new Error('Lost connection after commit');
      }
      return result;
    }
  }
  const queue = new Rewards(new UnreliableStore(db.pool), (status) => statuses.push(status));
  queue.add(id, 'uncertain', enemyLoot('melee', 'archer'));
  await queue.flush();
  assert.equal(queue.backlog, 1);
  assert.equal(statuses.at(-1), 'error');
  fail = false;
  await queue.flush();
  assert.equal(queue.backlog, 0);
  assert.equal(statuses.at(-1), 'saved');
  assert.equal((await store.profile(id)).potions, 4);
});
