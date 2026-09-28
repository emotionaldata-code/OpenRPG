import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_MOVEMENT,
  Player,
  WorldState,
  MAPS,
  movePlayer,
  moveFighter,
  sanitizeInput,
  type Intent,
  type CharacterClass,
} from '@openrpg/shared';
import { Simulation } from '../server/src/simulation/world.js';

const command = (overrides: Partial<Intent> = {}): Intent => ({
  moveX: 0,
  moveY: 0,
  aim: 0,
  fire: false,
  special: false,
  ...overrides,
});
for (const characterClass of ['warrior', 'archer', 'mage'] as const) {
  test(`${characterClass}: speed, dash distance, locked direction and replay agree`, () => {
    const rules = CLASS_MOVEMENT[characterClass];
    const player = new Player({ name: 'Hero', protectedUntil: 0, characterClass, x: 250, y: 790 });
    movePlayer(player, command({ moveX: 1 }), 1, []);
    assert.equal(player.x, 250 + rules.speed);
    Object.assign(player, { x: 250, y: 790 });
    const diagonal = command({ dash: true, moveX: -1, moveY: -1, aim: Math.PI / 4 });
    moveFighter(player, diagonal, 0.03, []);
    moveFighter(player, command({ aim: Math.PI }), (rules.dash.durationMs - 30) / 1000, []);
    assert.ok(Math.abs(Math.hypot(player.x - 250, player.y - 790) - rules.dash.distance) < 1e-8);
    assert.equal(player.nextDashAt, rules.dash.cooldownMs);
    assert.ok(player.x > 250 && player.y > 790, 'mouse aim wins over opposite movement keys');
    assert.equal(player.dashAngle, Math.PI / 4, 'aim locks for the dash');

    const state = new WorldState({ mode: 'fight' });
    const sim = new Simulation(state);
    sim.addPlayer('hero', 'Hero', characterClass);
    const server = state.players.get('hero')!;
    const predicted = new Player({ ...server.toJSON() });
    for (let tick = 0; tick < 60; tick++) {
      const input = command({ moveX: 1, dash: tick === 0 });
      sim.applyInput('hero', input, 1 / 30);
      moveFighter(predicted, input, 1 / 30, MAPS.forest.obstacles);
      sim.advance(1 / 30);
      assert.equal(predicted.x, server.x);
      assert.equal(predicted.y, server.y);
      assert.equal(predicted.nextDashAt, server.nextDashAt);
    }
  });
}

test('dash cannot tunnel through thin walls or recharge from packet spam', () => {
  const p = new Player({ name: 'Hero', protectedUntil: 0, characterClass: 'mage', x: 250, y: 790 });
  moveFighter(p, command({ dash: true }), 0.2, [{ x: 300, y: 750, width: 2, height: 100 }]);
  assert.equal(p.x, 290);
  const state = new WorldState({ mode: 'fight' }),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero', 'mage');
  const server = state.players.get('hero')!;
  sim.applyInput('hero', command({ dash: true }), 0);
  for (let i = 0; i < 1000; i++) {
    sim.applyInput('hero', command({ dash: true }), 0);
  }
  assert.equal(server.nextDashAt, 6000);
  state.elapsed = 6000;
  sim.applyInput('hero', command({ dash: true }), 1 / 30);
  assert.equal(server.nextDashAt, 12000, 'cooldown expires even without incoming input');
});

test('dead, disconnected and failed runs cannot dash; respawn preserves cooldown', () => {
  const state = new WorldState({ mode: 'fight' }),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero', 'mage');
  const p = state.players.get('hero')!;
  for (const patch of [{ hp: 0 }, { hp: 100, connected: false }]) {
    Object.assign(p, patch);
    sim.applyInput('hero', command({ dash: true }), 1 / 30);
    assert.equal(p.nextDashAt, 0);
  }
  p.connected = true;
  sim.applyInput('hero', command({ dash: true }), 1 / 30);
  p.hp = 0;
  p.respawnAt = 100;
  sim.advance(0.1);
  assert.equal(p.dashRemaining, 0);
  assert.equal(p.nextDashAt, 6000);
  state.outcome = 'failed';
  state.elapsed = 10000;
  sim.applyInput('hero', command({ dash: true }), 1 / 30);
  assert.equal(p.nextDashAt, 6000);
  const malformed = command({ dash: 'true' as unknown as boolean });
  sanitizeInput(malformed);
  assert.equal(malformed.dash, false);
});

test('class mobility follows the intended speed/range/cooldown tradeoff', () => {
  const classes: CharacterClass[] = ['warrior', 'archer', 'mage'];
  for (let i = 1; i < classes.length; i++) {
    const previous = CLASS_MOVEMENT[classes[i - 1]!],
      next = CLASS_MOVEMENT[classes[i]!];
    assert.ok(previous.speed > next.speed);
    assert.ok(previous.dash.distance < next.dash.distance);
    assert.ok(previous.dash.cooldownMs < next.dash.cooldownMs);
  }
});

test('packet gaps do not consume dash distance; cooldown uses elapsed server time', () => {
  const state = new WorldState({ mode: 'fight' }),
    sim = new Simulation(state);
  sim.addPlayer('hero', 'Hero', 'mage');
  const p = state.players.get('hero')!;
  const start = p.x;
  sim.applyInput('hero', command({ dash: true }), 1 / 30);
  sim.advance(0.3);
  for (let i = 0; i < 5; i++) {
    sim.applyInput('hero', command(), 1 / 30);
    sim.advance(1 / 30);
  }
  assert.ok(Math.abs(p.x - start - CLASS_MOVEMENT.mage.dash.distance) < 1e-8);
  assert.equal(p.nextDashAt, 6000);
});
