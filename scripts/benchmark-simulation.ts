import { performance } from 'node:perf_hooks';
import { WorldState, RULES, type Intent } from '@openrpg/shared';
import { Simulation } from '../server/src/simulation/world.js';

// Local CPU smoke check, not a network or deployment capacity guarantee.
const rooms = ['forest', 'castle', 'hell'].map(mapId => {
  const state = new WorldState({ mapId }), sim = new Simulation(state);
  for (const [i, kind] of (['archer', 'mage', 'warrior'] as const).entries()) {
    const id = String(i); sim.addPlayer(id, `Hero${i}`, kind);
    Object.assign(state.players.get(id)!, { x: 650 + i * 160, y: 720, protectedUntil: 0 });
  }
  return sim;
});
const costs: number[] = [];
for (let tick = 0; tick < 3000; tick++) {
  const start = performance.now();
  for (const sim of rooms) {
    for (const [id, p] of sim.state.players) {
      const target = [...sim.state.mobs.values()].find(m => m.hp > 0);
      const input: Intent = { moveX: Math.sin(tick / 70), moveY: Math.cos(tick / 90), aim: target ? Math.atan2(target.y - p.y, target.x - p.x) : 0, fire: true, special: true };
      sim.applyInput(id, input, 1 / RULES.tickRate);
    }
    sim.advance(1 / RULES.tickRate);
  }
  costs.push(performance.now() - start);
}
costs.sort((a, b) => a - b);
console.log(JSON.stringify({ rooms: 3, players: 9, enemies: 12, ticks: costs.length, meanMs: costs.reduce((a, b) => a + b, 0) / costs.length, p95Ms: costs[Math.floor(costs.length * .95)], maxMs: costs.at(-1) }, null, 2));
