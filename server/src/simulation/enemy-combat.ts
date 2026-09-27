import {
  ENEMY_COMBAT,
  ENCOUNTERS,
  RULES,
  WORLD,
  attackAngles,
  attackPattern,
  enemyRole,
  enemyRules,
  sectorHits,
  sweepRect,
  terrainHit,
  type Mob,
  type Player,
  type Point,
  type WorldState,
  type GameMap,
} from '@openrpg/shared';

interface FollowUp {
  owner: string;
  generation: number;
  kind: 'burst' | 'charge';
  angle: number;
  from: Point;
  end: Point;
  nextAt: number;
  remaining: number;
  hit: Set<string>;
  damage: number;
}

/** Bounded attack continuations; no timers or independent simulation loops. */
export class EnemyCombat {
  private active: FollowUp[] = [];
  constructor(
    private state: WorldState,
    private map: GameMap,
    private fire: (
      owner: string,
      from: Point,
      angle: number,
      damage: number,
      speed: number,
    ) => void,
    private damage: (player: Player, amount: number, owner: string) => void,
  ) {}
  attack(id: string, mob: Mob): void {
    const pattern = attackPattern(mob.attackKind, mob.role, this.map.id);
    const damage = Math.round(enemyRules(mob.role, this.map.id).damage * pattern.damage);
    if (mob.attackKind === 'charge' || mob.attackKind === 'burst') {
      this.active.push({
        owner: id,
        generation: mob.generation,
        kind: mob.attackKind,
        angle: mob.attackAngle,
        from: { x: mob.x, y: mob.y },
        end: { x: mob.targetX, y: mob.targetY },
        nextAt: this.state.elapsed,
        remaining: pattern.count,
        hit: new Set(),
        damage,
      });
    } else if (pattern.count > 0) {
      for (const angle of attackAngles(mob.attackKind, mob.attackAngle, enemyRole(mob.role))) {
        this.shoot(id, mob, angle, damage);
      }
    } else {
      const origin = mob.attackKind === 'eruption' ? { x: mob.targetX, y: mob.targetY } : mob;
      for (const player of this.state.players.values()) {
        if (!player.connected || player.hp <= 0) {
          continue;
        }
        if (
          sectorHits(
            origin,
            mob.attackAngle,
            pattern.radius,
            mob.attackKind === 'strike' ? Math.PI / 3 : Math.PI,
            player,
            RULES.playerRadius,
          ) &&
          terrainHit(origin, player, 0, this.map.obstacles) === null &&
          terrainHit(mob, player, 0, this.map.obstacles) === null
        ) {
          this.damage(player, damage, id);
        }
      }
    }
  }
  step(dt: number): void {
    this.active = this.active.filter((attack) => {
      const mob = this.state.mobs.get(attack.owner);
      if (!mob || mob.hp <= 0 || mob.generation !== attack.generation) {
        return false;
      }
      if (attack.kind === 'burst') {
        if (this.state.elapsed >= attack.nextAt) {
          this.shoot(
            attack.owner,
            attack.from,
            attack.angle + (attack.remaining - 2) * 0.06,
            attack.damage,
          );
          attack.remaining--;
          attack.nextAt = this.state.elapsed + ENEMY_COMBAT.burstIntervalMs;
        }
        return attack.remaining > 0;
      }
      const from = { x: mob.x, y: mob.y };
      const distance = Math.hypot(attack.end.x - from.x, attack.end.y - from.y);
      const fraction = Math.min(1, (ENEMY_COMBAT.chargeSpeed * dt) / Math.max(1, distance));
      const end = {
        x: from.x + (attack.end.x - from.x) * fraction,
        y: from.y + (attack.end.y - from.y) * fraction,
      };
      const radius = enemyRules(mob.role).radius;
      const wall = terrainHit(from, end, radius, this.map.obstacles);
      const travel = wall === null ? 1 : Math.max(0, wall - 0.001);
      end.x = Math.max(
        WORLD.border + radius,
        Math.min(WORLD.width - WORLD.border - radius, from.x + (end.x - from.x) * travel),
      );
      end.y = Math.max(
        WORLD.border + radius,
        Math.min(WORLD.height - WORLD.border - radius, from.y + (end.y - from.y) * travel),
      );
      for (const [id, player] of this.state.players) {
        if (attack.hit.has(id) || !player.connected || player.hp <= 0) {
          continue;
        }
        const hit = sweepRect(
          from,
          end,
          {
            x: player.x - RULES.playerRadius,
            y: player.y - RULES.playerRadius,
            width: RULES.playerRadius * 2,
            height: RULES.playerRadius * 2,
          },
          radius,
        );
        if (hit !== null && terrainHit(from, player, 0, this.map.obstacles) === null) {
          attack.hit.add(id);
          this.damage(player, attack.damage, attack.owner);
        }
      }
      Object.assign(mob, end);
      return wall === null && fraction < 1 && Math.hypot(end.x - from.x, end.y - from.y) > 0.01;
    });
  }
  private shoot(owner: string, from: Point, angle: number, damage: number): void {
    if (this.state.projectiles.size < ENEMY_COMBAT.maxHostileShots) {
      this.fire(owner, from, angle, damage, 180 + (ENCOUNTERS[this.map.id].tier - 1) * 35);
    }
  }
}
