import { performance } from 'node:perf_hooks';
import { WorldState, RULES, type Intent } from '@openrpg/shared';
import { Simulation } from '../server/src/simulation/world.js';

// Local CPU smoke check, not a network or deployment capacity guarantee.
const rooms = ['mountain', 'mountain', 'mountain'].map((mapId) => {
  const state = new WorldState({ mapId }),
    sim = new Simulation(state);
  for (const [i, kind] of (['archer', 'mage', 'warrior'] as const).entries()) {
    const id = String(i);
    sim.addPlayer(id, `Hero${i}`, kind);
    const spawn = sim.map.enemies[Math.floor((i * (sim.map.enemies.length - 1)) / 2)]!;
    Object.assign(state.players.get(id)!, {
      x: spawn.x + 70,
      y: spawn.y,
      protectedUntil: 0,
      invulnerableUntil: Number.MAX_SAFE_INTEGER,
    });
  }
  for (const mob of state.mobs.values()) {
    mob.locked = false;
  } // Include active bosses in the CPU load.
  return sim;
});
const costs: number[] = [];
for (let tick = 0; tick < 3000; tick++) {
  const start = performance.now();
  for (const sim of rooms) {
    for (const [id, p] of sim.state.players) {
      const target = [...sim.state.mobs.values()].find((m) => m.hp > 0);
      const input: Intent = {
        moveX: Math.sin(tick / 70),
        moveY: Math.cos(tick / 90),
        aim: target ? Math.atan2(target.y - p.y, target.x - p.x) : 0,
        fire: tick % 60 < 24,
        special: true,
      };
      sim.applyInput(id, input, 1 / RULES.tickRate);
    }
    sim.advance(1 / RULES.tickRate);
  }
  costs.push(performance.now() - start);
}
costs.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      rooms: 3,
      players: 9,
      enemies: rooms.reduce((total, room) => total + room.state.mobs.size, 0),
      ticks: costs.length,
      meanMs: costs.reduce((a, b) => a + b, 0) / costs.length,
      p95Ms: costs[Math.floor(costs.length * 0.95)],
      maxMs: costs.at(-1),
    },
    null,
    2,
  ),
);
