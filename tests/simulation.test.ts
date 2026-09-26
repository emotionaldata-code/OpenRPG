import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldState, Player, RULES, WORLD, OBSTACLES, SPAWNS, MOB_SPAWNS, movePlayer, moveBody, overlaps, sweepRect, sanitizeInput, parseRoomOptions, type Intent } from '@openrpg/shared';
import { Simulation } from '../server/src/simulation/world.js';
const intent = (overrides: Partial<Intent> = {}): Intent => ({ moveX: 0, moveY: 0, aim: 0, fire: false, ...overrides });
const player = () => new Player({ name: 'Test', x: 250, y: 790, protectedUntil: 0 });
function fixture() { const state = new WorldState(); const sim = new Simulation(state); sim.addPlayer('one', 'One'); return { state, sim, p: state.players.get('one')! }; }
function ticks(sim: Simulation, count: number): void { for (let i = 0; i < count; i++) sim.advance(1 / RULES.tickRate); }
test('diagonal movement is normalized and identical to a cardinal step', () => {
  const a = player(), b = player();
  movePlayer(a, intent({ moveX: 1 }), 1 / 30); movePlayer(b, intent({ moveX: 1, moveY: 1 }), 1 / 30);
  assert.ok(Math.abs(Math.hypot(b.x - 250, b.y - 790) - (a.x - 250)) < 1e-10);
  assert.equal(a.x, 256);
});
test('movement clamps all boundaries, and dead/disconnected players cannot move', () => {
  const p = player(); moveBody(p, -3000, 3000, 10, []);
  assert.equal(p.x, WORLD.border + 10); assert.equal(p.y, WORLD.height - WORLD.border - 10);
  moveBody(p, 3000, -3000, 10, []); assert.equal(p.x, WORLD.width - WORLD.border - 10); assert.equal(p.y, WORLD.border + 10);
  const x = p.x; p.hp = 0; movePlayer(p, intent({ moveX: -1 }), 1); assert.equal(p.x, x);
  p.hp = 100; p.connected = false; movePlayer(p, intent({ moveX: -1 }), 1); assert.equal(p.x, x);
});
test('wall sliding preserves tangential motion; corners cannot be cut', () => {
  const walls = [{ x: 100, y: 100, width: 100, height: 30 }, { x: 170, y: 130, width: 30, height: 100 }];
  const p = { x: 80, y: 110 }; moveBody(p, 30, 30, 10, walls);
  assert.equal(p.x, 90); assert.equal(p.y, 140);
  const corner = { x: 140, y: 160 }; moveBody(corner, 60, -60, 10, walls);
  assert.ok(walls.every(w => !overlaps(corner, 10, w))); assert.equal(corner.x, 160); assert.equal(corner.y, 140);
});
test('all authored spawn footprints are outside terrain', () => {
  for (const p of [...SPAWNS, ...MOB_SPAWNS]) assert.ok(OBSTACLES.every(w => !overlaps(p, 11, w)));
});
test('projectile sweep detects thin obstacles, grazing edges, and starts inside', () => {
  const wall = { x: 100, y: 100, width: 2, height: 40 };
  assert.equal(sweepRect({ x: 0, y: 120 }, { x: 200, y: 120 }, wall), .5);
  assert.equal(sweepRect({ x: 0, y: 97 }, { x: 200, y: 97 }, wall, 3), .485);
  assert.equal(sweepRect({ x: 101, y: 120 }, { x: 150, y: 120 }, wall), 0);
  assert.equal(sweepRect({ x: 0, y: 80 }, { x: 200, y: 80 }, wall), null);
  assert.equal(sweepRect({ x: 50, y: 100 }, { x: 50, y: 120 }, wall), null);
});
test('malformed input becomes finite bounded intent; invalid names/options reject', () => {
  const cmd = intent({ moveX: Infinity, moveY: -100, aim: NaN }); sanitizeInput(cmd);
  assert.deepEqual(cmd, intent({ moveX: 0, moveY: -1, aim: 0 }));
  assert.throws(() => parseRoomOptions({ name: '<script>', visibility: 'public' }));
  assert.throws(() => parseRoomOptions({ name: 'Okay', visibility: 'hidden' }));
  assert.deepEqual(parseRoomOptions({ name: '  Archer  ', visibility: 'invite' }), { name: 'Archer', visibility: 'invite' });
});
test('bow cooldown follows simulation time, not input calls', () => {
  const { sim, state } = fixture();
  for (let i = 0; i < 1000; i++) sim.applyInput('one', intent({ fire: true }), 0);
  assert.equal(state.projectiles.size, 1);
  ticks(sim, 9); sim.applyInput('one', intent({ fire: true }), 0); assert.equal(state.projectiles.size, 1);
  ticks(sim, 1); sim.applyInput('one', intent({ fire: true }), 0); assert.equal(state.projectiles.size, 2);
});
test('arrows damage mobs, never teammates, with terrain taking the first hit', () => {
  const { sim, state, p } = fixture(); sim.addPlayer('two', 'Two');
  const ally = state.players.get('two')!; Object.assign(ally, { x: 290, y: 790 });
  const mob = state.mobs.get('mage-0')!; Object.assign(mob, { x: 350, y: 790 });
  sim.applyInput('one', intent({ fire: true }), 0); ticks(sim, 8);
  assert.equal(mob.hp, RULES.mobHealth - RULES.arrowDamage); assert.equal(ally.hp, 100);
  Object.assign(p, { x: 430, y: 480 }); Object.assign(mob, { x: 660, y: 480 });
  ticks(sim, 3); sim.applyInput('one', intent({ fire: true }), 0); ticks(sim, 12);
  assert.equal(mob.hp, RULES.mobHealth - RULES.arrowDamage);
});
test('mages require line of sight and obey cooldowns', () => {
  const { sim, state, p } = fixture();
  const m = state.mobs.get('mage-0')!; Object.assign(p, { x: 440, y: 510 }); Object.assign(m, { x: 530, y: 510 });
  ticks(sim, 30); assert.equal([...state.projectiles.values()].filter(p => p.kind === 'bolt').length, 0);
  Object.assign(p, { x: 600, y: 720 }); Object.assign(m, { x: 680, y: 720 });
  sim.advance(1 / 30); assert.equal([...state.projectiles.values()].filter(p => p.kind === 'bolt').length, 1);
  ticks(sim, 4); assert.equal([...state.projectiles.values()].filter(p => p.kind === 'bolt').length, 1);
});
test('players respawn at 3 seconds protected; mobs at 8 seconds', () => {
  const { sim, state, p } = fixture();
  p.hp = 0; p.respawnAt = 3000; const mob = state.mobs.get('mage-0')!; mob.hp = 0; mob.respawnAt = 8000;
  ticks(sim, 89); assert.equal(p.hp, 0); ticks(sim, 2); assert.equal(p.hp, 100); assert.equal(p.generation, 1);
  assert.ok(p.protectedUntil > state.elapsed); assert.equal(mob.hp, 0);
  ticks(sim, 149); assert.equal(mob.hp, 0); ticks(sim, 1); assert.equal(mob.hp, 75); assert.equal(mob.generation, 1);
});
