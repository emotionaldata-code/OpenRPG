import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Mob,
  Player,
  WorldState,
  MAPS,
  CONTACT,
  CLASS_COMBAT,
  RULES,
  WORLD,
  enemyRules,
  overlaps,
  movementState,
  moveFighter,
  type Intent,
} from '@openrpg/shared';
import { Combat } from '../server/src/simulation/combat.js';
import { Simulation } from '../server/src/simulation/world.js';

const idle: Intent = { moveX: 0, moveY: 0, aim: 0, fire: false, special: false };
function fixture(role = 'ranged', kind: 'archer' | 'mage' | 'warrior' = 'warrior') {
  const state = new WorldState({ elapsed: 1000 }),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero', kind);
  state.mobs.clear();
  const hero = state.players.get('hero')!;
  Object.assign(hero, { x: 250, y: 790, protectedUntil: 0 });
  const mob = new Mob({ role, x: 310, y: 790, hp: 1000 });
  state.mobs.set('mob', mob);
  return { state, sim, hero, mob };
}

for (const role of ['melee', 'ranged', 'boss']) {
  test(`${role}: ordinary shots and specials never push, stun or cancel warnings`, () => {
    const { state, hero, mob } = fixture(role),
      combat = new Combat(state);
    mob.attackAt = 1500;
    for (const kind of ['arrow', 'fireball', 'inferno'] as const) {
      combat.fire('hero', hero, 0, kind);
      combat.step(0.3);
    }
    combat.attack('hero', hero, { ...idle, fire: true });
    combat.attack('hero', hero, idle);
    assert.ok(mob.hp < 650);
    assert.equal(mob.x, 310);
    assert.equal(mob.y, 790);
    assert.equal(mob.stunnedUntil, 0);
    assert.equal(mob.attackAt, 1500);
    assert.equal(hero.stunnedUntil, 0);
  });

  test(`${role}: walking contact stuns the player, cancels charge and blocks actions until expiry`, () => {
    const { state, sim, hero, mob } = fixture(role);
    sim.applyInput('hero', { ...idle, fire: true }, 0);
    sim.applyInput('hero', { ...idle, moveX: 1, fire: true, special: true }, 0.3);
    const deadline = 1000 + CONTACT.playerStunMs[role === 'boss' ? 'boss' : 'mob'];
    const position = { x: hero.x, y: hero.y };
    assert.ok(
      Math.abs(hero.x - (mob.x - enemyRules(role).radius - RULES.playerRadius - 120)) < 1e-6,
    );
    assert.equal(hero.stunnedUntil, deadline);
    assert.equal(hero.chargeStartedAt, -1);
    assert.equal(hero.nextSpecialAt, 0);
    assert.equal(mob.stunnedUntil, 0);
    assert.equal(mob.hp, 1000);
    assert.equal(hero.hp, 100, 'contact itself adds no damage');
    const predicted = movementState(hero);
    for (let tick = 0; tick < 20; tick++) {
      const command = { ...idle, moveX: -1, dash: true, fire: true, special: true };
      sim.applyInput('hero', command, 1 / 30);
      moveFighter(predicted, command, 1 / 30, MAPS.forest.obstacles);
      sim.advance(1 / 30);
      assert.equal(hero.x, predicted.x);
      assert.equal(hero.y, predicted.y);
      assert.equal(hero.stunnedUntil, deadline, 'input spam cannot refresh the stun');
    }
    assert.deepEqual({ x: hero.x, y: hero.y }, position);
    assert.equal(hero.nextDashAt, 0);
    assert.equal(hero.nextSpecialAt, 0);
    assert.equal(hero.chargeStartedAt, -1);
    state.elapsed = deadline;
    sim.applyInput('hero', { ...idle, moveX: -1 }, 0.2);
    assert.ok(hero.x < position.x, 'can leave contact after stun without getting stuck');
    sim.applyInput('hero', { ...idle, moveX: 1 }, 1);
    assert.equal(hero.stunnedUntil, deadline, 'recontact during recovery cannot stun');
    state.elapsed = deadline + 1500;
    Object.assign(hero, { x: mob.x - 60, y: mob.y });
    sim.applyInput('hero', { ...idle, moveX: 1 }, 0.3);
    assert.ok(hero.stunnedUntil > deadline, 'a new contact can stun again');
  });
}

for (const kind of ['warrior', 'archer', 'mage'] as const) {
  test(`${kind}: Q stuns and pushes only normal mobs, once per dash`, () => {
    const { state, sim, hero, mob } = fixture('ranged', kind);
    sim.applyInput('hero', { ...idle, dash: true, moveX: -1 }, 1 / 30);
    while (hero.dashRemaining > 0) {
      state.elapsed += 1000 / 30;
      sim.applyInput('hero', idle, 1 / 30);
    }
    assert.ok(Math.abs(mob.x - 344) < 1e-6);
    assert.ok(mob.stunnedUntil > state.elapsed);
    assert.equal(mob.hp, 1000);
    assert.equal(hero.stunnedUntil, 0);
    const at = mob.stunnedUntil;
    Object.assign(hero, { x: 250, y: 790 });
    state.elapsed = hero.nextDashAt;
    sim.applyInput('hero', { ...idle, dash: true }, 0.2);
    assert.ok(mob.stunnedUntil > at);
  });

  test(`${kind}: Q into a boss stops and stuns the player; boss stays unaffected`, () => {
    const { sim, hero, mob } = fixture('boss', kind);
    mob.attackAt = 1400;
    sim.applyInput('hero', { ...idle, dash: true }, 0.2);
    assert.equal(hero.stunnedUntil, 3000);
    assert.equal(hero.dashRemaining, 0);
    assert.ok(hero.x < mob.x, 'dash stops at contact rather than crossing the boss');
    assert.equal(mob.x, 310);
    assert.equal(mob.stunnedUntil, 0);
    assert.equal(mob.attackAt, 1400);
    assert.equal(mob.hp, 1000);
  });
}

test('dash stuns stop normal AI, then allow a fresh warning; respawn clears the stun', () => {
  const state = new WorldState({ elapsed: 1000 }),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero', 'warrior');
  const mob = state.mobs.get('ranged-1')!,
    hero = state.players.get('hero')!;
  Object.assign(hero, { x: mob.x - 40, y: mob.y, protectedUntil: 0 });
  mob.attackAt = 1100;
  sim.applyInput('hero', { ...idle, dash: true }, 1 / 30);
  const position = { x: mob.x, y: mob.y };
  assert.equal(mob.stunnedUntil, 2000);
  sim.advance(0.999);
  assert.deepEqual({ x: mob.x, y: mob.y }, position);
  assert.equal(mob.attackAt, 0);
  sim.advance(0.001);
  assert.ok(mob.attackAt > state.elapsed || mob.x !== position.x || mob.y !== position.y);
  mob.hp = 0;
  mob.respawnAt = state.elapsed;
  mob.stunnedUntil = state.elapsed + 1000;
  sim.advance(0);
  assert.equal(mob.stunnedUntil, 0);
});

for (const kind of ['burst', 'charge']) {
  test(`dash contact cancels a normal mob's active ${kind}`, () => {
    const { state, hero, mob } = fixture('ranged'),
      combat = new Combat(state);
    Object.assign(mob, { attackKind: kind, attackAngle: Math.PI, targetX: 250, targetY: 790 });
    combat.enemyAttack('mob', mob);
    hero.x = 340;
    hero.nextDashAt = 3500;
    combat.contact.move('hero', hero, { x: 250, y: 790 }, true);
    const x = mob.x;
    state.elapsed = mob.stunnedUntil + 1;
    combat.step(0.2);
    assert.equal(mob.x, x);
    assert.equal(state.projectiles.size, 0);
  });
}

test('dash push respects terrain and world boundaries', () => {
  const { state, hero, mob } = fixture(),
    combat = new Combat(state);
  const radius = enemyRules(mob.role).radius;
  const wall = MAPS.forest.obstacles.find((r) => r.x === 470 && r.width === 150)!;
  Object.assign(mob, { x: wall.x - radius - 1, y: wall.y + wall.height / 2 });
  Object.assign(hero, { x: mob.x - 10, y: mob.y, nextDashAt: 1 });
  combat.contact.move('hero', hero, { x: hero.x - 20, y: hero.y }, true);
  assert.equal(mob.x, wall.x - radius);
  assert.equal(overlaps(mob, radius, wall), false);
  Object.assign(mob, { x: WORLD.border + radius, y: 790 });
  Object.assign(hero, { x: mob.x + 15, y: mob.y, dashAngle: Math.PI, nextDashAt: 2 });
  combat.contact.move('hero', hero, { x: hero.x + 20, y: hero.y }, true);
  assert.equal(mob.x, WORLD.border + radius);
});

test('idle, dead, loading, blocked and PvP contacts do not stun the player', () => {
  for (const patch of [{ hp: 0 }, { connected: false }]) {
    const { sim, hero } = fixture();
    Object.assign(hero, patch);
    sim.applyInput('hero', { ...idle, moveX: 1 }, 0.3);
    assert.equal(hero.stunnedUntil, 0);
  }
  const { state, sim, hero, mob } = fixture();
  hero.x = mob.x;
  sim.applyInput('hero', idle, 0.2);
  assert.equal(hero.stunnedUntil, 0, 'only player movement triggers contact');
  Object.assign(hero, { x: 450, y: 510 });
  Object.assign(mob, { x: 510, y: 510 });
  sim.applyInput('hero', { ...idle, dash: true }, 0.15);
  assert.equal(mob.stunnedUntil, 0);
  assert.equal(hero.stunnedUntil, 0);
  state.mode = 'fight';
  Object.assign(hero, { x: 250, y: 790, nextDashAt: 0 });
  const rival = new Player({ name: 'Rival', x: 300, y: 790, protectedUntil: 0 });
  state.players.set('rival', rival);
  sim.applyInput('hero', { ...idle, dash: true }, 0.15);
  assert.equal(rival.stunnedUntil, 0);
  assert.equal(hero.stunnedUntil, 0);
});

test('player respawn clears stun and old contact memory', () => {
  const { state, sim, hero, mob } = fixture();
  sim.applyInput('hero', { ...idle, moveX: 1 }, 0.3);
  assert.ok(hero.stunnedUntil > 0);
  hero.hp = 0;
  hero.respawnAt = state.elapsed;
  sim.advance(0);
  assert.equal(hero.stunnedUntil, 0);
  Object.assign(hero, { x: mob.x - 20, y: mob.y, protectedUntil: 0 });
  sim.applyInput('hero', { ...idle, moveX: 1 }, 1 / 30);
  assert.ok(hero.stunnedUntil > state.elapsed);
});

test('damage protection does not prevent player contact stuns', () => {
  for (const patch of [{ protectedUntil: 2000 }, { invulnerableUntil: 2000 }]) {
    const { sim, hero } = fixture('boss');
    Object.assign(hero, patch);
    sim.applyInput('hero', { ...idle, dash: true }, 0.2);
    assert.equal(hero.stunnedUntil, 3000);
  }
});

for (const role of ['ranged', 'boss']) {
  for (const kind of ['warrior', 'archer', 'mage'] as const) {
    test(`${kind}: perfect hits roll the ${role} stun chance once at impact`, () => {
      const chance = role === 'boss' ? 0.07 : 0.2;
      for (const roll of [0, chance - 0.000001, chance, 0.99]) {
        const { state, hero, mob } = fixture(role, kind);
        let rolls = 0;
        const combat = new Combat(state, undefined, () => {
          rolls++;
          return roll;
        });
        mob.attackAt = 5000;
        combat.attack('hero', hero, { ...idle, fire: true });
        state.elapsed += CLASS_COMBAT[kind].primary.chargeMs * 0.7;
        combat.attack('hero', hero, idle);
        // A later weak release must not change an in-flight shot's quality.
        combat.attack('hero', hero, { ...idle, fire: true });
        combat.attack('hero', hero, idle);
        combat.step(0.3);
        const succeeds = roll < chance;
        assert.equal(rolls, 1);
        assert.equal(
          mob.stunnedUntil,
          succeeds ? state.elapsed + (role === 'boss' ? 700 : 1500) : 0,
        );
        assert.equal(mob.attackAt, succeeds ? 0 : 5000);
        assert.equal(mob.x, 310, 'perfect stun never pushes enemies');
        assert.equal(mob.y, 790);
        combat.step(0.3);
        assert.equal(rolls, 1, 'consumed attacks never roll again');
      }
    });
  }
}

test('perfect shots do not roll on misses, walls, lethal hits, specials or PvP', () => {
  for (const scenario of ['miss', 'wall', 'lethal', 'special', 'pvp']) {
    const { state, hero, mob } = fixture('boss', 'mage');
    const combat = new Combat(state, undefined, () => assert.fail(`unexpected roll: ${scenario}`));
    if (scenario === 'miss') {
      mob.y += 200;
    } else if (scenario === 'wall') {
      Object.assign(hero, { x: 450, y: 510 });
      Object.assign(mob, { x: 650, y: 510 });
    } else if (scenario === 'lethal') {
      mob.hp = 1;
    } else if (scenario === 'pvp') {
      state.mode = 'fight';
      state.players.set(
        'rival',
        new Player({ name: 'Rival', x: 310, y: 790, hp: 1000, protectedUntil: 0 }),
      );
    }
    if (scenario === 'special') {
      hero.lastAttackMultiplier = 1.75;
      combat.attack('hero', hero, { ...idle, special: true });
    } else {
      combat.attack('hero', hero, { ...idle, fire: true });
      state.elapsed += 1400;
      combat.attack('hero', hero, idle);
    }
    combat.step(1);
    assert.equal(mob.stunnedUntil, 0);
    assert.equal(state.players.get('rival')?.stunnedUntil ?? 0, 0);
  }
});

test('perfect stuns cancel boss continuations and shorter stuns never truncate longer ones', () => {
  for (const attackKind of ['burst', 'charge']) {
    const { state, hero, mob } = fixture('boss');
    const combat = new Combat(state, undefined, () => 0);
    Object.assign(mob, { attackKind, attackAngle: Math.PI, targetX: 250, targetY: 790 });
    combat.enemyAttack('mob', mob);
    combat.attack('hero', hero, { ...idle, fire: true });
    state.elapsed += 490;
    combat.attack('hero', hero, idle);
    state.elapsed = mob.stunnedUntil + 1;
    combat.step(0.2);
    assert.equal(mob.x, 310);
    assert.equal(state.projectiles.size, 0);
  }
  const { state, hero, mob } = fixture();
  const combat = new Combat(state, undefined, () => 0);
  combat.attack('hero', hero, { ...idle, fire: true });
  state.elapsed += 490;
  combat.attack('hero', hero, idle);
  const deadline = mob.stunnedUntil;
  hero.x = 340;
  hero.nextDashAt = 4000;
  combat.contact.move('hero', hero, { x: 250, y: 790 }, true);
  assert.equal(mob.stunnedUntil, deadline, 'a 1s dash cannot shorten a 1.5s perfect stun');
});

test('recovery blocks all enemies for exactly 1.5s after stun, without blocking dash attacks', () => {
  const { state, sim, hero, mob } = fixture();
  sim.applyInput('hero', { ...idle, moveX: 1 }, 0.3);
  const deadline = hero.stunnedUntil;
  const boss = new Mob({ role: 'boss', x: 310, y: 790 });
  state.mobs.set('boss', boss);
  mob.hp = 0;
  for (const elapsed of [deadline, deadline + 1499]) {
    state.elapsed = elapsed;
    Object.assign(hero, { x: 250, y: 790 });
    sim.applyInput('hero', { ...idle, moveX: 1 }, 0.3);
    assert.equal(hero.stunnedUntil, deadline);
    assert.equal(hero.x, 313, 'recovery allows movement through contact');
  }
  state.mobs.delete('boss');
  mob.hp = 1000;
  Object.assign(hero, { x: 250, y: 790 });
  sim.applyInput('hero', { ...idle, dash: true }, 0.15);
  assert.ok(mob.stunnedUntil > state.elapsed, 'Q still stuns normal mobs during recovery');
  state.elapsed = deadline + 1500;
  state.mobs.set('boss', boss);
  Object.assign(hero, { x: 250, y: 790 });
  sim.applyInput('hero', { ...idle, moveX: 1 }, 0.3);
  assert.equal(hero.stunnedUntil, state.elapsed + 2000);
});

test('player knockback points away from contact and respects walls and world bounds', () => {
  for (const direction of [-1, 1]) {
    const { state, hero, mob } = fixture();
    const combat = new Combat(state);
    Object.assign(mob, { x: 300, y: 790 });
    Object.assign(hero, { x: 300 + direction * 10, y: 790 });
    combat.contact.move('hero', hero, { x: 300 + direction * 60, y: 790 }, false);
    assert.ok(
      Math.abs(
        hero.x - (300 + direction * (enemyRules(mob.role).radius + RULES.playerRadius + 120)),
      ) < 1e-6,
    );
    assert.equal(hero.y, 790);
  }
  for (const boundary of ['wall', 'world']) {
    const { state, hero, mob } = fixture();
    const combat = new Combat(state);
    const wall = MAPS.forest.obstacles.find((r) => r.x === 470 && r.width === 150)!;
    const edge = boundary === 'wall' ? wall.x + wall.width : WORLD.border;
    const y = boundary === 'wall' ? wall.y + wall.height / 2 : 790;
    Object.assign(mob, { x: edge + 50, y });
    Object.assign(hero, { x: edge + 40, y });
    combat.contact.move('hero', hero, { x: edge + 15, y }, false);
    assert.equal(hero.x, edge + RULES.playerRadius);
    assert.equal(hero.stunnedUntil, 2000);
  }
});
