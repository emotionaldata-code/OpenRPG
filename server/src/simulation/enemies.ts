import {
  ENEMY_AI,
  ENCOUNTERS,
  Mob,
  enemyRules,
  attackPattern,
  moveBody,
  terrainHit,
  type WorldState,
  type GameMap,
  type Point,
  type Player,
  type EnemyAttack,
} from '@openrpg/shared';
import type { Combat } from './combat.js';
import { Navigation } from './navigation.js';
interface Brain {
  home: Point;
  nextAttack: number;
  waypoint: number;
  routeAt: number;
  path: Point[];
  returning: boolean;
  strafe: number;
  sequence: number;
}
const patrol = [
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

export class Enemies {
  private brains = new Map<string, Brain>();
  private previous = new Map<string, Point>();
  private velocity = new Map<string, Point>();
  private navigation: Navigation;
  constructor(
    private state: WorldState,
    private map: GameMap,
    private combat: Combat,
  ) {
    this.navigation = new Navigation(map);
    map.enemies.forEach((home, i) => {
      const id = `${home.role}-${i}`;
      state.mobs.set(
        id,
        new Mob({
          x: home.x,
          y: home.y,
          role: home.role,
          hp: enemyRules(home.role, map.id).health,
        }),
      );
      this.brains.set(id, {
        home,
        nextAttack: 700 + i * 120,
        waypoint: 0,
        routeAt: i * 50,
        path: [],
        returning: false,
        strafe: i % 2 ? 1 : -1,
        sequence: 0,
      });
    });
  }
  step(dt: number): void {
    this.observe(dt);
    for (const [id, mob] of this.state.mobs) {
      const brain = this.brains.get(id);
      if (!brain) {
        continue;
      }
      const rules = enemyRules(mob.role, this.map.id),
        now = this.state.elapsed;
      if (mob.hp <= 0) {
        mob.attackAt = 0;
        if (this.state.mode !== 'story' && now >= mob.respawnAt) {
          Object.assign(mob, {
            x: brain.home.x,
            y: brain.home.y,
            hp: rules.health,
            respawnAt: 0,
            generation: mob.generation + 1,
            lastAttackAt: -1000,
            enraged: false,
            engaged: false,
          });
          Object.assign(brain, {
            nextAttack: now + rules.cooldownMs,
            path: [],
            routeAt: 0,
            returning: false,
            sequence: 0,
          });
        }
        continue;
      }
      mob.enraged = mob.role === 'boss' && mob.hp <= rules.health / 2;
      if (Math.hypot(mob.x - brain.home.x, mob.y - brain.home.y) > ENEMY_AI.leash) {
        brain.returning = true;
      }
      if (brain.returning) {
        mob.attackAt = 0;
        this.walk(mob, brain, brain.home, dt);
        if (Math.hypot(mob.x - brain.home.x, mob.y - brain.home.y) < 12) {
          brain.returning = false;
          mob.hp = rules.health;
          mob.engaged = false;
          mob.enraged = false;
        }
        continue;
      }
      // Once shown, warnings never track the player. Enrage shortens pauses, not dodge windows.
      if (mob.attackAt > 0) {
        if (now >= mob.attackAt) {
          this.combat.enemyAttack(id, mob);
          mob.lastAttackAt = now;
          mob.attackAt = 0;
          brain.nextAttack =
            now +
            attackPattern(mob.attackKind, mob.role, this.map.id).recoveryMs +
            rules.cooldownMs * (mob.enraged ? ENCOUNTERS[this.map.id].enrageCooldown : 1);
          brain.sequence++;
          brain.strafe *= -1;
        }
        continue;
      }
      if (
        now - mob.lastAttackAt <
        attackPattern(mob.attackKind, mob.role, this.map.id).recoveryMs
      ) {
        continue;
      }
      const target = this.target(mob, brain);
      if (!target) {
        if (Math.hypot(mob.x - brain.home.x, mob.y - brain.home.y) > 100) {
          brain.returning = true;
          continue;
        }
        const offset = patrol[brain.waypoint % patrol.length]!;
        const goal = {
          x: brain.home.x + offset.x * ENEMY_AI.patrolRadius,
          y: brain.home.y + offset.y * ENEMY_AI.patrolRadius,
        };
        this.walk(mob, brain, goal, dt, 0.45);
        if (Math.hypot(mob.x - goal.x, mob.y - goal.y) < 8 || !brain.path.length) {
          brain.waypoint++;
        }
        continue;
      }
      const distance = Math.hypot(target.x - mob.x, target.y - mob.y);
      mob.aim = Math.atan2(target.y - mob.y, target.x - mob.x);
      const attacks =
        ENCOUNTERS[this.map.id][mob.role === 'boss' || mob.role === 'melee' ? mob.role : 'ranged'];
      let kind: EnemyAttack = attacks[brain.sequence % attacks.length]!;
      // A short-range attack becomes a rush when kited; the next rotation still advances.
      if (mob.role === 'boss' && distance > 130 && (kind === 'slam' || kind === 'strike')) {
        kind = attacks.includes('charge') ? 'charge' : attacks.find((attack) => attack !== kind)!;
      }
      const pattern = attackPattern(kind, mob.role, this.map.id);
      const clear = terrainHit(mob, target, 3, this.map.obstacles) === null;
      if (distance <= pattern.reach && clear && now >= brain.nextAttack) {
        const velocity = this.velocity.get(target.name) ?? { x: 0, y: 0 };
        // Modest lead rewards changing direction; it never follows during the wind-up.
        const lead =
          mob.role === 'boss'
            ? (ENCOUNTERS[this.map.id].tier - 1) * 0.055
            : ENCOUNTERS[this.map.id].tier >= 3
              ? 0.12
              : 0;
        const angle = Math.atan2(
          target.y + velocity.y * lead - mob.y,
          target.x + velocity.x * lead - mob.x,
        );
        const goal =
          kind === 'charge'
            ? {
                x: mob.x + Math.cos(angle) * pattern.reach,
                y: mob.y + Math.sin(angle) * pattern.reach,
              }
            : target;
        Object.assign(mob, {
          attackAt: now + pattern.windupMs,
          attackStartedAt: now,
          attackAngle: angle,
          attackKind: kind,
          attackX: mob.x,
          attackY: mob.y,
          targetX: goal.x,
          targetY: goal.y,
        });
        continue;
      }
      if (
        clear &&
        mob.role !== 'melee' &&
        distance < Math.min(300, pattern.reach * 0.9) &&
        pattern.reach > 150
      ) {
        this.strafe(mob, brain, distance, dt);
      } else {
        // Approach from alternating sides until close enough to commit to the attack.
        const flank = clear && mob.role === 'melee' && distance > 110 ? brain.strafe * 42 : 0;
        this.walk(
          mob,
          brain,
          { x: target.x - Math.sin(mob.aim) * flank, y: target.y + Math.cos(mob.aim) * flank },
          dt,
        );
      }
    }
  }
  private observe(dt: number): void {
    const next = new Map<string, Point>();
    this.velocity.clear();
    for (const p of this.state.players.values()) {
      const previous = this.previous.get(p.name);
      if (previous && dt > 0) {
        const dx = (p.x - previous.x) / dt,
          dy = (p.y - previous.y) / dt;
        const scale = Math.min(1, 180 / Math.max(1, Math.hypot(dx, dy)));
        this.velocity.set(p.name, { x: dx * scale, y: dy * scale });
      }
      next.set(p.name, { x: p.x, y: p.y });
    }
    this.previous = next;
  }
  private target(mob: Mob, brain: Brain): Player | undefined {
    let target: Player | undefined,
      nearest = enemyRules(mob.role, this.map.id).range;
    const camp = this.map.spawns[0]!;
    for (const p of this.state.players.values()) {
      const distance = Math.hypot(p.x - mob.x, p.y - mob.y);
      if (
        p.hp <= 0 ||
        !p.connected ||
        p.protectedUntil > this.state.elapsed ||
        Math.hypot(p.x - camp.x, p.y - camp.y) < ENEMY_AI.campRadius ||
        Math.hypot(p.x - brain.home.x, p.y - brain.home.y) > ENEMY_AI.leash
      ) {
        continue;
      }
      if (distance < nearest) {
        nearest = distance;
        target = p;
      }
    }
    return target;
  }
  private strafe(mob: Mob, brain: Brain, distance: number, dt: number): void {
    const rules = enemyRules(mob.role, this.map.id);
    const angle =
      mob.aim +
      (distance < (mob.role === 'boss' ? 125 : 165) ? Math.PI : (brain.strafe * Math.PI) / 2);
    const before = { x: mob.x, y: mob.y };
    const strafeSpeed =
      distance < (mob.role === 'boss' ? 125 : 165) ? 1 : ENCOUNTERS[this.map.id].strafeSpeed;
    const speed =
      rules.speed * strafeSpeed * (mob.enraged ? 1 + ENCOUNTERS[this.map.id].tier * 0.04 : 1);
    moveBody(
      mob,
      Math.cos(angle) * speed * dt,
      Math.sin(angle) * speed * dt,
      rules.radius,
      this.map.obstacles,
    );
    if (Math.hypot(mob.x - before.x, mob.y - before.y) < 0.5) {
      brain.strafe *= -1;
    }
  }
  private walk(mob: Mob, brain: Brain, goal: Point, dt: number, speed = 1): void {
    const rules = enemyRules(mob.role, this.map.id);
    // Open sight needs no grid search. Obstructed routes refresh at most every 450ms per mob.
    if (terrainHit(mob, goal, rules.radius + 1, this.map.obstacles) === null) {
      brain.path = [goal];
    } else if (this.state.elapsed >= brain.routeAt) {
      brain.path = this.navigation.route(mob, goal, rules.radius);
      brain.routeAt = this.state.elapsed + ENEMY_AI.routeMs;
    }
    while (brain.path[0] && Math.hypot(brain.path[0].x - mob.x, brain.path[0].y - mob.y) < 5) {
      brain.path.shift();
    }
    const next = brain.path[0];
    if (!next) {
      return;
    }
    const angle = Math.atan2(next.y - mob.y, next.x - mob.x);
    const distance = Math.min(
      rules.speed * speed * (mob.enraged ? 1 + ENCOUNTERS[this.map.id].tier * 0.04 : 1) * dt,
      Math.hypot(next.x - mob.x, next.y - mob.y),
    );
    mob.aim = angle;
    moveBody(
      mob,
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
      rules.radius,
      this.map.obstacles,
    );
  }
}
