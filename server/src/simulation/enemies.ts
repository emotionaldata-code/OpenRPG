import {
  ENEMY_AI, ENEMY_THEMES, Mob, enemyRules, moveBody, terrainHit,
  type WorldState, type GameMap, type Point, type Player,
} from '@openrpg/shared';
import { Combat } from './combat.js';
import { Navigation } from './navigation.js';
interface Brain { home: Point; nextAttack: number; waypoint: number; routeAt: number; path: Point[]; returning: boolean; strafe: number }
const patrol = [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }];

export class Enemies {
  private brains = new Map<string, Brain>();
  private navigation: Navigation;
  constructor(private state: WorldState, private map: GameMap, private combat: Combat) {
    this.navigation = new Navigation(map);
    map.enemies.forEach((home, i) => {
      const id = `${home.role}-${i}`;
      state.mobs.set(id, new Mob({ x: home.x, y: home.y, role: home.role, hp: enemyRules(home.role).health }));
      this.brains.set(id, { home, nextAttack: 700 + i * 200, waypoint: 0, routeAt: 0, path: [], returning: false, strafe: i % 2 ? 1 : -1 });
    });
  }
  step(dt: number): void {
    for (const [id, mob] of this.state.mobs) {
      const brain = this.brains.get(id); if (!brain) continue;
      const rules = enemyRules(mob.role), now = this.state.elapsed;
      if (mob.hp <= 0) {
        mob.attackAt = 0;
        if ((this.state.mode !== 'story' || (mob.role !== 'boss' && mob.generation < 1)) && now >= mob.respawnAt) {
          Object.assign(mob, { x: brain.home.x, y: brain.home.y, hp: rules.health, respawnAt: 0, generation: mob.generation + 1, lastAttackAt: -1000 });
          Object.assign(brain, { nextAttack: now + rules.cooldownMs, path: [], routeAt: 0, returning: false });
        }
        continue;
      }
      if (Math.hypot(mob.x - brain.home.x, mob.y - brain.home.y) > ENEMY_AI.leash) brain.returning = true;
      if (brain.returning) {
        mob.attackAt = 0;
        this.walk(mob, brain, brain.home, dt);
        if (Math.hypot(mob.x - brain.home.x, mob.y - brain.home.y) < 12) { brain.returning = false; mob.hp = rules.health; }
        continue;
      }
      // Attacks lock direction and position during their wind-up, giving time to dodge.
      if (mob.attackAt > 0) {
        if (now >= mob.attackAt) {
          this.combat.enemyAttack(id, mob);
          mob.lastAttackAt = now; mob.attackAt = 0; brain.nextAttack = now + rules.cooldownMs;
        }
        continue;
      }
      if (now - mob.lastAttackAt < ENEMY_AI.recoveryMs) continue;
      const target = this.target(mob, brain);
      if (!target) {
        if (Math.hypot(mob.x - brain.home.x, mob.y - brain.home.y) > 100) { brain.returning = true; continue; }
        const offset = patrol[brain.waypoint % patrol.length]!;
        const goal = { x: brain.home.x + offset.x * ENEMY_AI.patrolRadius, y: brain.home.y + offset.y * ENEMY_AI.patrolRadius };
        this.walk(mob, brain, goal, dt, .45);
        if (Math.hypot(mob.x - goal.x, mob.y - goal.y) < 8 || !brain.path.length) brain.waypoint++;
        continue;
      }
      const distance = Math.hypot(target.x - mob.x, target.y - mob.y);
      mob.aim = Math.atan2(target.y - mob.y, target.x - mob.x);
      const kind = mob.role === 'boss' ? ENEMY_THEMES[this.map.id].bossAttack : mob.role === 'melee' ? 'strike' : 'bolt';
      const reach = kind === 'fan' || kind === 'ring' ? 300 : rules.reach;
      const clear = terrainHit(mob, target, 3, this.map.obstacles) === null;
      if (distance <= reach && clear && now >= brain.nextAttack) {
        Object.assign(mob, { attackAt: now + rules.windupMs, attackAngle: mob.aim, attackKind: kind });
        continue;
      }
      if (mob.role === 'ranged' && clear && distance < 250) {
        const retreat = distance < 140 ? -1 : 0;
        const angle = mob.aim + (retreat ? Math.PI : brain.strafe * Math.PI / 2);
        const before = { x: mob.x, y: mob.y };
        moveBody(mob, Math.cos(angle) * rules.speed * dt * .7, Math.sin(angle) * rules.speed * dt * .7, rules.radius, this.map.obstacles);
        if (Math.hypot(mob.x - before.x, mob.y - before.y) < .1) brain.strafe *= -1;
      } else if (distance > reach * .75 || !clear) this.walk(mob, brain, target, dt);
    }
  }
  private target(mob: Mob, brain: Brain): Player | undefined {
    let target: Player | undefined, nearest = enemyRules(mob.role).range;
    const camp = this.map.spawns[0]!;
    for (const p of this.state.players.values()) {
      const distance = Math.hypot(p.x - mob.x, p.y - mob.y);
      if (p.hp <= 0 || !p.connected || p.protectedUntil > this.state.elapsed || Math.hypot(p.x - camp.x, p.y - camp.y) < ENEMY_AI.campRadius || Math.hypot(p.x - brain.home.x, p.y - brain.home.y) > ENEMY_AI.leash) continue;
      if (distance < nearest) { nearest = distance; target = p; }
    }
    return target;
  }
  private walk(mob: Mob, brain: Brain, goal: Point, dt: number, speed = 1): void {
    const rules = enemyRules(mob.role);
    if (this.state.elapsed >= brain.routeAt) {
      brain.path = this.navigation.route(mob, goal, rules.radius);
      brain.routeAt = this.state.elapsed + ENEMY_AI.routeMs;
    }
    while (brain.path[0] && Math.hypot(brain.path[0].x - mob.x, brain.path[0].y - mob.y) < 5) brain.path.shift();
    const next = brain.path[0]; if (!next) return;
    const angle = Math.atan2(next.y - mob.y, next.x - mob.x), distance = Math.min(rules.speed * speed * dt, Math.hypot(next.x - mob.x, next.y - mob.y));
    mob.aim = angle;
    moveBody(mob, Math.cos(angle) * distance, Math.sin(angle) * distance, rules.radius, this.map.obstacles);
  }
}
