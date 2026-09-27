import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_COMBAT,
  COMBAT,
  MAP_IDS,
  PROJECTILES,
  RULES,
  Player,
  WorldState,
  parseRoomOptions,
  type CharacterClass,
  type Intent,
} from '@openrpg/shared';
import { Combat } from '../server/src/simulation/combat.js';
import { Simulation } from '../server/src/simulation/world.js';

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  moveX: 0,
  moveY: 0,
  aim: 0,
  fire: false,
  special: false,
  ...overrides,
});
function arena(kind: CharacterClass = 'archer') {
  const state = new WorldState({ mode: 'fight', elapsed: 2000 });
  const sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero', kind);
  sim.addPlayer('rival', 'Rival');
  const hero = state.players.get('hero')!,
    rival = state.players.get('rival')!;
  Object.assign(hero, { x: 250, y: 790, protectedUntil: 0 });
  Object.assign(rival, { x: 290, y: 790, protectedUntil: 0 });
  return {
    state,
    sim,
    hero,
    rival,
    combat: new Combat(state, () => assert.fail('PvP must not award monster loot')),
  };
}

test('Fight accepts every map and never spawns monsters or ends after a wipe', () => {
  for (const mapId of MAP_IDS) {
    const options = parseRoomOptions({ mode: 'fight', mapId, visibility: 'public' });
    const state = new WorldState(options),
      sim = new Simulation(state);
    sim.addPlayer('hero', 'Hero');
    sim.addPlayer('rival', 'Rival');
    for (const p of state.players.values()) {
      p.hp = 0;
      p.respawnAt = RULES.playerRespawnMs;
    }
    sim.advance(20);
    assert.equal(state.mobs.size, 0);
    assert.equal(state.outcome, 'active');
    for (const p of state.players.values()) {
      assert.equal(p.hp, RULES.playerHealth);
    }
  }
  assert.throws(() => parseRoomOptions({ mode: 'unknown', visibility: 'public' }), /Choose/);
});

for (const kind of ['archer', 'mage', 'warrior'] as const) {
  test(`Fight: ${kind} charged attacks damage rivals, never their owner`, () => {
    const { state, hero, rival, combat } = arena(kind);
    combat.attack('hero', hero, intent({ fire: true }));
    state.elapsed += CLASS_COMBAT[kind].primary.chargeMs * 0.7;
    combat.attack('hero', hero, intent());
    combat.step(0.2);
    const base =
      kind === 'warrior'
        ? COMBAT.swordDamage
        : PROJECTILES[kind === 'mage' ? 'fireball' : 'arrow'].damage;
    assert.equal(rival.hp, RULES.playerHealth - Math.round(base * 1.75));
    assert.equal(hero.hp, RULES.playerHealth);
  });
}

test('Fight projectiles hit the nearest connected living rival and stop at walls', () => {
  for (const kind of ['arrow', 'fireball', 'inferno'] as const) {
    const { state, hero, rival, combat } = arena();
    rival.hp = 1000;
    const far = new Player({ name: 'Far', x: 360, y: 790, hp: 1000, protectedUntil: 0 });
    state.players.set('far', far);
    combat.fire('hero', hero, 0, kind);
    combat.step(1);
    assert.equal(rival.hp, 1000 - PROJECTILES[kind].damage);
    assert.equal(far.hp, 1000);
    rival.connected = false;
    combat.fire('hero', hero, 0, kind);
    combat.step(1);
    assert.equal(far.hp, 1000 - PROJECTILES[kind].damage);
    Object.assign(hero, { x: 430, y: 480 });
    Object.assign(far, { x: 660, y: 480 });
    combat.fire('hero', hero, 0, kind);
    combat.step(1);
    assert.equal(far.hp, 1000 - PROJECTILES[kind].damage);
    assert.equal(state.projectiles.size, 0);
  }
});

test('Fight sword sweep hits multiple rivals in front, respecting terrain and range', () => {
  const { state, hero, rival, combat } = arena('warrior');
  const side = new Player({ name: 'Side', x: 280, y: 835, protectedUntil: 0 });
  state.players.set('side', side);
  combat.attack('hero', hero, intent({ fire: true }));
  state.elapsed += 490;
  combat.attack('hero', hero, intent());
  assert.equal(rival.hp, 58);
  assert.equal(side.hp, 58);
  assert.equal(hero.hp, 100);
  Object.assign(hero, { x: 450, y: 510 });
  Object.assign(rival, { x: 510, y: 510 });
  combat.attack('hero', hero, intent({ fire: true }));
  combat.attack('hero', hero, intent());
  assert.equal(rival.hp, 58);
  assert.equal(side.hp, 58);
});

test('Fight specials retain cooldowns, spawn protection and warrior immunity', () => {
  const { state, hero, rival, combat } = arena('archer');
  combat.attack('hero', hero, intent({ special: true }));
  combat.step(0.2);
  assert.equal(rival.hp, 75);
  assert.equal(hero.hp, 100);
  const deadline = hero.nextSpecialAt;
  combat.attack('hero', hero, intent({ special: true }));
  assert.equal(hero.nextSpecialAt, deadline);
  rival.characterClass = 'warrior';
  combat.attack('rival', rival, intent({ special: true }));
  combat.fire('hero', hero, 0, 'inferno');
  combat.step(0.2);
  assert.equal(rival.hp, 75);
  state.elapsed = rival.invulnerableUntil;
  rival.protectedUntil = state.elapsed + 100;
  combat.fire('hero', hero, 0, 'inferno');
  combat.step(0.2);
  assert.equal(rival.hp, 75);
  state.elapsed = rival.protectedUntil;
  combat.fire('hero', hero, 0, 'inferno');
  combat.step(0.2);
  assert.equal(rival.hp, 0);
  assert.equal(hero.kills, 1);
  assert.equal(state.drops.size, 0);
});

test('Fight kills repeatedly respawn players after three seconds without loot or progression', () => {
  const { state, sim, hero, rival, combat } = arena('mage');
  for (let life = 1; life <= 3; life++) {
    Object.assign(rival, { x: 290, y: 790, protectedUntil: 0 });
    combat.fire('hero', hero, 0, 'inferno');
    combat.step(0.2);
    assert.equal(rival.hp, 0);
    assert.equal(hero.kills, life);
    sim.advance(2.9);
    assert.equal(rival.hp, 0);
    sim.advance(0.11);
    assert.equal(rival.hp, 100);
    assert.equal(rival.generation, life);
    assert.ok(rival.protectedUntil > state.elapsed);
    assert.equal(state.outcome, 'active');
    assert.equal(state.drops.size, 0);
    assert.equal(state.mobs.size, 0);
  }
});
