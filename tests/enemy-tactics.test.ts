import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_IDS,
  biomeOf,
  MAPS,
  ENCOUNTERS,
  ENEMY_COMBAT,
  ENEMY_ATTACKS,
  RULES,
  Mob,
  Player,
  WorldState,
  enemyRules,
  attackPattern,
  bossAttackAreas,
  attackAreaHits,
  overlaps,
  moveBody,
  terrainHit,
  type MapId,
  type EnemyAttack,
} from '@openrpg/shared';
import { Simulation } from '../server/src/simulation/world.js';
import { Combat } from '../server/src/simulation/combat.js';
import { Navigation } from '../server/src/simulation/navigation.js';

function fight(kind: EnemyAttack, mapId: MapId = 'forest') {
  const state = new WorldState({ mapId, elapsed: 1000 });
  const combat = new Combat(state);
  const mob = new Mob({
    role: 'boss',
    x: 2800,
    y: 500,
    attackX: 2800,
    attackY: 500,
    attackKind: kind,
    attackAngle: 0,
    targetX: 3050,
    targetY: 500,
  });
  const player = new Player({ name: 'Target', x: 2920, y: 500, protectedUntil: 0 });
  state.mobs.set('boss', mob);
  state.players.set('hero', player);
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      state.elapsed += 1000 / 30;
      combat.step(1 / 30);
    }
  };
  return { state, combat, mob, player, tick };
}

test('campaign increases population within biomes and combat health across all stages', () => {
  assert.equal(MAP_IDS.length, 30);
  MAP_IDS.forEach((id, i) => {
    const map = MAPS[id];
    assert.equal(ENCOUNTERS[id].tier, Math.floor(i / 5) + 1);
    assert.equal(map.enemies.length, map.stage === 5 ? 1 : 6 + (map.stage - 1) * 4);
    assert.ok(enemyRules('boss', id).cooldownMs > 0);
    if (i) {
      assert.ok(enemyRules('boss', id).health > enemyRules('boss', MAP_IDS[i - 1]!).health);
    }
  });
});

for (const id of MAP_IDS) {
  test(`${id}: enemy footprints can navigate from camp to every encounter without cutting walls`, () => {
    const map = MAPS[id],
      navigation = new Navigation(map);
    for (const spawn of map.enemies) {
      const radius = enemyRules(spawn.role, id).radius;
      const path = navigation.route(map.spawns[0]!, spawn, radius);
      assert.ok(path.length > 0, `${spawn.role} at ${spawn.x},${spawn.y}`);
      let previous = map.spawns[0]!;
      for (const next of path) {
        assert.equal(terrainHit(previous, next, radius, map.obstacles), null);
        previous = next;
      }
    }
  });
  if (MAPS[id].stage === 5) {
    test(`${id}: boss uses multiple attacks, locks warnings, enrages and resets on respawn`, () => {
      const state = new WorldState({ mapId: id }),
        sim = new Simulation(state);
      const boss = [...state.mobs.values()].find((m) => m.role === 'boss')!;
      for (const [key, mob] of state.mobs) {
        if (mob !== boss) {
          state.mobs.delete(key);
        }
      }
      sim.addPlayer('hero', 'Hero');
      const player = state.players.get('hero')!;
      Object.assign(player, {
        x: boss.x + 70,
        y: boss.y,
        protectedUntil: 0,
        invulnerableUntil: 100000,
      });
      boss.hp = Math.floor(enemyRules('boss', id).health / 2);
      const attacks = new Set<string>();
      let sawEnrage = false;
      let locked: { at: number; x: number; y: number; angle: number } | undefined;
      for (let tick = 0; tick < 750; tick++) {
        // Stay in the arena; the boss must pursue, close gaps and rotate attacks.
        if (!boss.attackAt) {
          Object.assign(player, {
            x: boss.x + (boss.x < MAPS[id].landmark.x ? 65 : -65),
            y: boss.y,
          });
        }
        sim.advance(1 / 30);
        sawEnrage ||= boss.enraged;
        if (boss.attackAt > 0) {
          attacks.add(boss.attackKind);
          if (locked?.at === boss.attackAt) {
            assert.deepEqual(
              { x: boss.targetX, y: boss.targetY, angle: boss.attackAngle },
              { x: locked.x, y: locked.y, angle: locked.angle },
            );
          }
          locked = { at: boss.attackAt, x: boss.targetX, y: boss.targetY, angle: boss.attackAngle };
        }
        assert.ok(mapClear(id, boss));
      }
      assert.ok(
        attacks.size >= Math.min(3, ENCOUNTERS[id].boss.length),
        `${id}: ${[...attacks].join(', ')}`,
      );
      assert.ok(
        [...attacks].some((kind) => ENEMY_ATTACKS[kind as EnemyAttack].name),
        'boss uses its exclusive special',
      );
      assert.equal(sawEnrage, true);
      assert.equal(boss.enraged, boss.hp <= enemyRules('boss', id).health / 2);
      assert.equal(player.hp, 100);
      boss.hp = 0;
      boss.respawnAt = state.elapsed + 100;
      for (let i = 0; i < 4; i++) {
        sim.advance(1 / 30);
      }
      assert.equal(boss.hp, enemyRules('boss', id).health);
      assert.equal(boss.enraged, false);
      assert.equal(boss.attackAt, 0);
    });
  }
}
function mapClear(id: MapId, mob: Mob): boolean {
  return MAPS[id].obstacles.every((o) => !overlaps(mob, enemyRules(mob.role).radius, o));
}

test('charges sweep targets once, finish quickly and cannot tunnel through terrain', () => {
  const { combat, mob, player, tick } = fight('charge');
  combat.enemyAttack('boss', mob);
  tick(20);
  assert.equal(mob.x, 3050);
  assert.equal(player.hp, 100 - Math.round(enemyRules('boss', 'forest').damage * 1.1));
  tick(20);
  assert.equal(player.hp, 100 - Math.round(enemyRules('boss', 'forest').damage * 1.1));
  const blocked = fight('charge');
  Object.assign(blocked.mob, { x: 920, y: 550, targetX: 1150, targetY: 550 });
  Object.assign(blocked.player, { x: 1000, y: 550 });
  blocked.combat.enemyAttack('boss', blocked.mob);
  blocked.tick(25);
  assert.ok(blocked.mob.x <= 957 - 22);
  assert.equal(blocked.player.hp, 100);
});

test('burst fires staggered shots and cancels remaining shots when the caster dies', () => {
  const { state, combat, mob, tick } = fight('burst');
  combat.enemyAttack('boss', mob);
  assert.equal(state.projectiles.size, 0);
  tick();
  assert.equal(state.projectiles.size, 1);
  tick(3);
  assert.equal(state.projectiles.size, 1);
  tick(3);
  assert.equal(state.projectiles.size, 2);
  mob.hp = 0;
  tick(4);
  assert.ok(state.projectiles.size <= 2);
});

test('eruption hits its marked ground, can be dodged and respects cover, camp and immunity', () => {
  const f = fight('eruption');
  Object.assign(f.player, { x: f.mob.targetX, y: f.mob.targetY });
  f.combat.enemyAttack('boss', f.mob);
  assert.equal(f.player.hp, 100 - Math.round(enemyRules('boss', 'forest').damage * 1.2));
  f.player.x += ENEMY_ATTACKS.eruption.radius + RULES.playerRadius + 1;
  f.combat.enemyAttack('boss', f.mob);
  assert.equal(f.player.hp, 100 - Math.round(enemyRules('boss', 'forest').damage * 1.2));
  Object.assign(f.player, { x: 990, y: 550 });
  Object.assign(f.mob, { x: 910, y: 550, targetX: 990, targetY: 550 });
  f.combat.enemyAttack('boss', f.mob);
  assert.equal(f.player.hp, 100 - Math.round(enemyRules('boss', 'forest').damage * 1.2));
  Object.assign(f.player, { ...MAPS.forest.spawns[0] });
  Object.assign(f.mob, {
    x: f.player.x + 150,
    y: f.player.y,
    targetX: f.player.x,
    targetY: f.player.y,
  });
  f.combat.enemyAttack('boss', f.mob);
  assert.equal(f.player.hp, 100 - Math.round(enemyRules('boss', 'forest').damage * 1.2));
  Object.assign(f.player, { x: 1100, y: 1000, invulnerableUntil: 2000 });
  Object.assign(f.mob, { x: 1000, y: 1000, targetX: 1100, targetY: 1000 });
  f.combat.enemyAttack('boss', f.mob);
  assert.equal(f.player.hp, 100 - Math.round(enemyRules('boss', 'forest').damage * 1.2));
});

test('enemy projectile budget is bounded, and expired volleys free capacity', () => {
  const { state, combat, mob, tick } = fight('ring', 'mountain');
  for (let i = 0; i < 40; i++) {
    combat.enemyAttack('boss', mob);
  }
  assert.equal(state.projectiles.size, ENEMY_COMBAT.maxHostileShots);
  tick(70);
  assert.equal(state.projectiles.size, 0);
  combat.enemyAttack('boss', mob);
  assert.equal(state.projectiles.size, 12);
});

test('navigation can leave exact wall contact without cutting a corner', () => {
  const map = MAPS.forest,
    navigation = new Navigation(map);
  const actor = { x: 630, y: 494 },
    target = { x: 548, y: 551 };
  const path = navigation.route(actor, target, 10);
  assert.ok(path.length > 0);
  for (const next of path) {
    assert.equal(terrainHit(actor, next, 9.99, map.obstacles), null);
    for (
      let tick = 0;
      tick < 100 && Math.hypot(actor.x - next.x, actor.y - next.y) > 0.01;
      tick++
    ) {
      const distance = Math.hypot(next.x - actor.x, next.y - actor.y),
        scale = Math.min(1, 6 / distance);
      moveBody(actor, (next.x - actor.x) * scale, (next.y - actor.y) * scale, 10, map.obstacles);
      assert.ok(map.obstacles.every((wall) => !overlaps(actor, 10, wall)));
    }
    assert.ok(Math.hypot(actor.x - next.x, actor.y - next.y) < 0.1);
  }
  assert.ok(Math.hypot(actor.x - target.x, actor.y - target.y) < 0.1);
});

for (const mode of ['testing', 'story']) {
  for (const mapId of MAP_IDS.filter((id) => MAPS[id].stage === 5)) {
    test(`${mode}/${mapId}: boss takes damage and attacks in its dedicated arena`, () => {
      const state = new WorldState({ mode, mapId }),
        sim = new Simulation(state),
        combat = new Combat(state);
      sim.addPlayer('hero', 'Hero', 'warrior');
      const boss = [...state.mobs.values()].find((mob) => mob.role === 'boss')!;
      const guards = [...state.mobs.values()].filter((mob) => mob !== boss);
      const player = state.players.get('hero')!;
      Object.assign(player, {
        x: boss.x - 50,
        y: boss.y,
        protectedUntil: 0,
        invulnerableUntil: 100000,
      });
      combat.attack('hero', player, { moveX: 0, moveY: 0, aim: 0, fire: true, special: false });
      combat.attack('hero', player, { moveX: 0, moveY: 0, aim: 0, fire: false, special: false });
      assert.ok(boss.hp < enemyRules('boss', mapId).health, 'melee can hurt the boss immediately');
      const afterMelee = boss.hp;
      combat.fire('hero', player, 0, 'inferno');
      combat.step(0.2);
      assert.ok(boss.hp < afterMelee, 'projectiles can hurt the boss immediately');
      assert.equal(boss.engaged, true, 'first damage engages boss music');
      let attacked = false;
      for (let i = 0; i < 120; i++) {
        sim.advance(1 / 30);
        attacked ||= boss.attackAt > 0;
      }
      assert.ok(attacked, 'boss starts attacking without waiting for guard kills');
      assert.ok(guards.every((guard) => guard.hp > 0 && guard.generation === 0));
      if (mode === 'testing') {
        boss.hp = 0;
        boss.respawnAt = state.elapsed;
        sim.advance(1 / 30);
        assert.equal(boss.hp, enemyRules('boss', mapId).health);
        assert.equal(boss.engaged, false);
      }
    });
  }
}

for (const [mapId, kind] of Object.entries({
  'forest-boss': 'roots',
  'castle-boss': 'royal',
  'paradise-boss': 'halo',
  'hell-boss': 'fissure',
  'mountain-boss': 'avalanche',
}) as [MapId, EnemyAttack][]) {
  test(`${mapId}: exclusive boss special hits once, respects cover and immunity`, () => {
    for (const id of MAP_IDS) {
      assert.equal(ENCOUNTERS[id].boss.includes(kind), biomeOf(id) === biomeOf(mapId));
      assert.ok(!ENCOUNTERS[id].melee.includes(kind) && !ENCOUNTERS[id].ranged.includes(kind));
    }
    const f = fight(kind, mapId);
    // Open ground in the arena.
    Object.assign(f.mob, {
      x: 2800,
      y: 500,
      attackX: 2800,
      attackY: 500,
      targetX: 2920,
      targetY: 500,
    });
    const pattern = attackPattern(kind, 'boss', mapId);
    const areas = bossAttackAreas(
      kind,
      f.mob,
      { x: f.mob.targetX, y: f.mob.targetY },
      0,
      pattern.radius,
    );
    const area = areas.find((a) => a.y === 500) ?? areas[0]!;
    Object.assign(f.player, { x: area.x + (area.innerRadius ? 150 : 0), y: area.y });
    const damage = Math.round(enemyRules('boss', mapId).damage * pattern.damage);
    f.combat.enemyAttack('boss', f.mob);
    assert.equal(f.player.hp, 100 - damage);
    f.player.invulnerableUntil = 2000;
    f.combat.enemyAttack('boss', f.mob);
    assert.equal(f.player.hp, 100 - damage);
    f.player.invulnerableUntil = 0;
    f.player.connected = false;
    f.combat.enemyAttack('boss', f.mob);
    assert.equal(f.player.hp, 100 - damage);
    f.player.connected = true;
    // Put the target behind an authored wall, still within attack reach.
    const wall = MAPS[mapId].obstacles.find((w) => w.width < 160 && w.height > 60)!;
    Object.assign(f.mob, {
      x: wall.x - 25,
      y: wall.y + 30,
      attackX: wall.x - 25,
      attackY: wall.y + 30,
    });
    Object.assign(f.player, { x: wall.x + wall.width + 25, y: wall.y + 30 });
    Object.assign(f.mob, { targetX: f.player.x, targetY: f.player.y });
    f.combat.enemyAttack('boss', f.mob);
    assert.equal(f.player.hp, 100 - damage);
  });
}

test('boss specials have readable escape spaces and overlapping marks never multiply damage', () => {
  const origin = { x: 2800, y: 500 },
    target = { x: 2920, y: 500 };
  const halo = bossAttackAreas('halo', origin, target, 0, 210)[0]!;
  assert.equal(attackAreaHits(halo, origin, 10), false);
  assert.equal(attackAreaHits(halo, { x: origin.x + 150, y: origin.y }, 10), true);
  assert.equal(attackAreaHits(halo, { x: origin.x + 230, y: origin.y }, 10), false);
  const royal = bossAttackAreas('royal', origin, target, 0, 205)[0]!;
  assert.equal(attackAreaHits(royal, { x: origin.x - 100, y: origin.y }, 10), false);
  const f = fight('roots');
  Object.assign(f.mob, {
    ...origin,
    attackX: origin.x,
    attackY: origin.y,
    targetX: origin.x,
    targetY: origin.y,
  });
  Object.assign(f.player, origin);
  f.combat.enemyAttack('boss', f.mob);
  assert.equal(f.player.hp, 100 - enemyRules('boss', 'forest').damage);
});
