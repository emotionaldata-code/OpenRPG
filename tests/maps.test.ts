import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_IDS,
  MAPS,
  ENEMY_THEMES,
  RULES,
  WorldState,
  Mob,
  Player,
  overlaps,
  terrainHit,
  movePlayer,
  parseRoomOptions,
  type Intent,
  enemyRules,
} from '@openrpg/shared';
import { Simulation } from '../server/src/simulation/world.js';
import { Combat } from '../server/src/simulation/combat.js';
import { Navigation } from '../server/src/simulation/navigation.js';
const idle: Intent = { moveX: 0, moveY: 0, aim: 0, fire: false, special: false };
function ticks(sim: Simulation, count: number): void {
  for (let i = 0; i < count; i++) {
    sim.advance(1 / 30);
  }
}
for (const id of MAP_IDS) {
  test(`${id}: safe, reachable spawns, three enemy roles, authoritative map geometry and respawns`, () => {
    const map = MAPS[id],
      state = new WorldState({ mapId: id }),
      sim = new Simulation(state),
      nav = new Navigation(map);
    assert.deepEqual(new Set(map.enemies.map((e) => e.role)), new Set(['melee', 'ranged', 'boss']));
    assert.equal(new Set(Object.values(ENEMY_THEMES[id].names)).size, 3);
    for (const spawn of [...map.spawns, ...map.enemies]) {
      const radius = 'role' in spawn ? enemyRules(String(spawn.role)).radius : RULES.playerRadius;
      assert.ok(
        map.obstacles.every((o) => !overlaps(spawn, radius, o)),
        `${id} spawn ${spawn.x},${spawn.y}`,
      );
      assert.ok(
        nav.route(map.spawns[0]!, spawn, RULES.playerRadius).length > 0,
        `${id} reachable ${spawn.x},${spawn.y}`,
      );
    }
    sim.addPlayer('hero', 'Hero');
    const player = state.players.get('hero')!,
      predicted = new Player(player.toJSON());
    const wall = map.obstacles.find((o) => o.kind === 'stone')!;
    Object.assign(player, { x: wall.x - 20, y: wall.y + 15 });
    Object.assign(predicted, { x: player.x, y: player.y });
    const input = { ...idle, moveX: 1, moveY: 0.2 };
    for (let i = 0; i < 20; i++) {
      sim.applyInput('hero', input, 1 / 30);
      movePlayer(predicted, input, 1 / 30, map.obstacles);
    }
    assert.equal(player.x, predicted.x);
    assert.equal(player.y, predicted.y);
    assert.ok(!overlaps(player, RULES.playerRadius, wall));
    const combat = new Combat(state),
      victim = new Mob({ x: wall.x + wall.width + 30, y: wall.y + 15 });
    state.mobs.set('victim', victim);
    combat.fire('hero', { x: wall.x - 30, y: wall.y + 15 }, 0, 'inferno');
    combat.step(1);
    assert.equal(victim.hp, 75);
    assert.equal(state.projectiles.size, 0);
    state.mobs.delete('victim');
    for (const mob of state.mobs.values()) {
      mob.hp = 0;
      mob.respawnAt = state.elapsed + RULES.mobRespawnMs;
    }
    ticks(sim, 239);
    assert.ok([...state.mobs.values()].every((m) => m.hp === 0));
    ticks(sim, 2);
    for (const mob of state.mobs.values()) {
      assert.equal(mob.hp, enemyRules(mob.role, id).health);
      assert.equal(mob.generation, 1);
    }
  });
}
test('unknown maps reject; missing selection defaults to forest', () => {
  for (const mapId of ['unknown', '__proto__', 42, {}, null]) {
    assert.throws(() => parseRoomOptions({ visibility: 'public', mapId }));
  }
  assert.equal(parseRoomOptions({ visibility: 'public' }).mapId, 'forest');
});
test('navigation routes around a wall with collision-clear segments', () => {
  const map = MAPS.castle,
    nav = new Navigation(map),
    from = { x: 1100, y: 500 },
    to = { x: 1330, y: 500 };
  assert.notEqual(terrainHit(from, to, 12, map.obstacles), null);
  const route = nav.route(from, to, 12);
  assert.ok(route.length > 2);
  let previous = from;
  for (const point of route) {
    assert.equal(terrainHit(previous, point, 12, map.obstacles), null);
    previous = point;
  }
});
function encounter(role: 'melee' | 'ranged' | 'boss', mapId = 'forest') {
  const state = new WorldState({ mapId }),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero');
  const entry = [...state.mobs].find(([, m]) => m.role === role)!;
  for (const [id] of state.mobs) {
    if (id !== entry[0]) {
      state.mobs.delete(id);
    }
  }
  const mob = entry[1],
    player = state.players.get('hero')!;
  player.protectedUntil = 0;
  return { state, sim, mob, player };
}
test('melee pursues, locks a dodgeable wind-up, and does not hit through walls', () => {
  const { state, sim, mob, player } = encounter('melee');
  Object.assign(mob, { x: 1010, y: 750 });
  Object.assign(player, { x: 930, y: 750 });
  ticks(sim, 20);
  assert.ok(mob.x < 1010);
  assert.equal(player.hp, 100);
  for (let i = 0; i < 45 && !mob.attackAt; i++) {
    ticks(sim, 1);
  }
  assert.ok(mob.attackAt > state.elapsed);
  Object.assign(player, { x: 930, y: 850 });
  ticks(sim, 20);
  assert.equal(player.hp, 100);
  const combat = new Combat(state);
  Object.assign(mob, { x: 945, y: 530, attackKind: 'strike', attackAngle: 0 });
  Object.assign(player, { x: 995, y: 530 });
  combat.enemyAttack('melee', mob);
  assert.equal(player.hp, 100);
  Object.assign(player, { x: 960, y: 650 });
  Object.assign(mob, { x: 940, y: 650 });
  combat.enemyAttack('melee', mob);
  assert.equal(player.hp, 88);
});
test('ranged enemies retreat, telegraph, then fire at a locked aim on a cooldown', () => {
  const { state, sim, mob, player } = encounter('ranged');
  Object.assign(mob, { x: 680, y: 720 });
  Object.assign(player, { x: 590, y: 720 });
  ticks(sim, 10);
  assert.ok(mob.x > 680);
  assert.equal(state.projectiles.size, 0);
  ticks(sim, 13);
  assert.ok(mob.attackAt > state.elapsed);
  const aim = mob.attackAngle;
  Object.assign(player, { x: 590, y: 850 });
  ticks(sim, Math.ceil((mob.attackAt - state.elapsed) / (1000 / 30)));
  assert.equal(state.projectiles.size, 1);
  assert.equal([...state.projectiles.values()][0]!.angle, aim);
  ticks(sim, 8);
  assert.equal(mob.attackAt, 0);
});
test('boss slams are delayed, terrain-blocked, respect immunity, and can be interrupted by death', () => {
  const { state, sim, mob, player } = encounter('boss');
  Object.assign(player, { x: mob.x - 60, y: mob.y });
  for (let i = 0; i < 90 && !mob.attackAt; i++) {
    ticks(sim, 1);
  }
  assert.ok(mob.attackAt > state.elapsed);
  assert.equal(player.hp, 100);
  ticks(sim, 31);
  assert.equal(player.hp, 82);
  player.invulnerableUntil = state.elapsed + 4000;
  new Combat(state).enemyAttack('boss', mob);
  assert.equal(player.hp, 82);
  mob.attackAt = state.elapsed + 10;
  mob.hp = 0;
  mob.respawnAt = state.elapsed + 8000;
  ticks(sim, 5);
  assert.equal(mob.attackAt, 0);
  assert.equal(player.hp, 82);
});
test('boss fan and ring patterns emit bounded authoritative volleys', () => {
  for (const [kind, count] of [
    ['fan', 5],
    ['ring', 12],
  ] as const) {
    const state = new WorldState(),
      combat = new Combat(state),
      mob = new Mob({ role: 'boss', x: 1000, y: 300, attackKind: kind, attackAngle: 0.3 });
    combat.enemyAttack('boss', mob);
    assert.equal(state.projectiles.size, count);
    assert.ok(
      [...state.projectiles.values()].every((p) => p.kind === 'bolt' && p.owner === 'boss'),
    );
  }
});
test('camp is a refuge and enemies return home after losing a distant target', () => {
  const { state, sim, mob, player } = encounter('ranged');
  Object.assign(mob, { x: 390, y: 790 });
  ticks(sim, 120);
  assert.equal(player.hp, 100);
  assert.equal(state.projectiles.size, 0);
  assert.ok(mob.x > 390);
  Object.assign(player, { x: 1360, y: 1000 });
  ticks(sim, 300);
  assert.ok(Math.hypot(mob.x - 650, mob.y - 710) < 100);
});

test('boss projectile hitboxes match their larger footprint', () => {
  for (const role of ['ranged', 'boss'] as const) {
    const state = new WorldState(),
      combat = new Combat(state);
    const mob = new Mob({ role, x: 320, y: 813, hp: 900 });
    state.mobs.set('target', mob);
    combat.fire('hero', { x: 250, y: 790 }, 0, 'arrow');
    combat.step(0.5);
    assert.equal(mob.hp, role === 'boss' ? 875 : 900);
  }
});

test('authored layouts provide forks, offset doors, island bridges and real switchbacks', () => {
  // Either garden flank remains usable when the other is closed.
  const garden = MAPS.paradise;
  const from = { x: 880, y: 535 },
    to = { x: 1560, y: 535 };
  assert.notEqual(terrainHit(from, to, 10, garden.obstacles), null);
  for (const y of [160, 680]) {
    const nav = new Navigation({
      ...garden,
      obstacles: [...garden.obstacles, { x: 1180, y, width: 60, height: 200, kind: 'stone' }],
    });
    const route = nav.route(from, to, 10);
    assert.ok(route.length > 0, `garden detour with ${y === 160 ? 'north' : 'south'} closed`);
    assert.ok(route.some((p) => (y === 160 ? p.y > 680 : p.y < 360)));
  }
  const castle = new Navigation(MAPS.castle).route(
    MAPS.castle.spawns[0]!,
    MAPS.castle.landmark,
    22,
  );
  assert.ok(
    castle.some((p) => p.x > 1400 && p.x < 1750 && p.y < 400),
    'castle north doorway',
  );
  assert.ok(
    castle.some((p) => p.x > 2300 && p.x < 2700 && p.y > 640),
    'castle south doorway',
  );
  assert.ok(
    MAPS.hell.obstacles.some((o) => overlaps({ x: 850, y: 500 }, 10, o)),
    'lava separates islands',
  );
  assert.ok(
    MAPS.hell.obstacles.every((o) => !overlaps({ x: 850, y: 800 }, 10, o)),
    'bridge is passable',
  );
  const ridge = new Navigation(MAPS.mountain).route(
    MAPS.mountain.spawns[0]!,
    MAPS.mountain.landmark,
    22,
  );
  let length = 0,
    westward = 0,
    previous = MAPS.mountain.spawns[0]!;
  for (const p of ridge) {
    length += Math.hypot(p.x - previous.x, p.y - previous.y);
    westward += Math.max(0, previous.x - p.x);
    previous = p;
  }
  assert.ok(length > 5500, 'ridge cannot be crossed by a straight shortcut');
  assert.ok(westward > 1000, 'switchback requires returning west before the summit');
});
