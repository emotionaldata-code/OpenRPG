import { EnemyCombat } from './enemy-combat.js';
import {
  CHARGE,
  updateCharge,
  sectorHits,
  COMBAT,
  PROJECTILES,
  RULES,
  WORLD,
  Player,
  Projectile,
  getMap,
  enemyRules,
  ENEMY_AI,
  sweepRect,
  terrainHit,
  equippedCombat,
  equipmentStats,
  type WorldState,
  type Mob,
  type Intent,
  type GameMap,
  type Point,
  type ProjectileKind,
  type ProjectileRules,
} from '@openrpg/shared';

interface Shot {
  vx: number;
  vy: number;
  expires: number;
  rules: ProjectileRules;
  hostile: boolean;
}
interface Impact {
  fraction: number;
  victim?: Player | Mob;
}

/** Room-local combat. Input requests attacks; only simulation time advances cooldowns. */
export class Combat {
  private enemyCombat: EnemyCombat;
  private shots = new Map<string, Shot>();
  private shotId = 0;
  private chargeInputs = new Map<string, number>();
  private readonly map: GameMap;
  constructor(
    private state: WorldState,
    private defeated: (mob: Mob) => void = () => {},
  ) {
    this.map = getMap(state.mapId);
    this.enemyCombat = new EnemyCombat(
      state,
      this.map,
      (owner, from, angle, damage, speed) => this.fire(owner, from, angle, 'bolt', damage, speed),
      (player, amount, owner) => this.damage(player, amount, owner),
    );
  }

  attack(id: string, player: Player, input: Intent): void {
    if (player.hp <= 0 || !player.connected) {
      return;
    }
    const now = this.state.elapsed;
    const rules = equippedCombat(player);
    if (input.special && now + 1e-6 >= player.nextSpecialAt) {
      player.nextSpecialAt = now + rules.special.cooldownMs;
      switch (player.characterClass) {
        case 'warrior':
          player.invulnerableUntil = now + equipmentStats(player).immunityMs;
          break;
        case 'mage':
          this.fire(id, player, input.aim, 'inferno');
          break;
        default:
          for (let i = 0; i < COMBAT.volleyCount; i++) {
            this.fire(id, player, input.aim + (i * Math.PI * 2) / COMBAT.volleyCount, 'arrow');
          }
      }
    }
    const multiplier = updateCharge(
      player,
      input.fire,
      input.cancelFire === true,
      now,
      rules.primary.chargeMs,
    );
    if (player.chargeStartedAt >= 0) {
      this.chargeInputs.set(id, now);
    } else {
      this.chargeInputs.delete(id);
    }
    if (multiplier !== null) {
      player.lastAttackAt = now;
      if (player.characterClass === 'warrior') {
        this.sweep(id, player, input.aim, multiplier);
      } else {
        const kind = player.characterClass === 'mage' ? 'fireball' : 'arrow';
        this.fire(
          id,
          player,
          input.aim,
          kind,
          Math.round(
            PROJECTILES[kind].damage * equipmentStats(player).damageMultiplier * multiplier,
          ),
        );
      }
    }
  }

  fire(
    owner: string,
    from: Point,
    angle: number,
    kind: ProjectileKind,
    damage?: number,
    speed?: number,
  ): void {
    const player = this.state.players.get(owner);
    const scaled = Math.round(
      PROJECTILES[kind].damage *
        (kind !== 'bolt' && player ? equipmentStats(player).damageMultiplier : 1),
    );
    const id = String(this.shotId++),
      rules = {
        ...PROJECTILES[kind],
        damage: damage ?? scaled,
        speed: speed ?? PROJECTILES[kind].speed,
        lifeMs: kind === 'bolt' ? 2200 : PROJECTILES[kind].lifeMs,
      };
    // Sweep from the owner's center: muzzle offsets must never bypass terrain.
    this.state.projectiles.set(id, new Projectile({ x: from.x, y: from.y, angle, owner, kind }));
    this.shots.set(id, {
      vx: Math.cos(angle) * rules.speed,
      vy: Math.sin(angle) * rules.speed,
      expires: this.state.elapsed + rules.lifeMs,
      rules,
      hostile: kind === 'bolt',
    });
  }

  step(dt: number): void {
    this.enemyCombat.step(dt);
    for (const [id, at] of this.chargeInputs) {
      const p = this.state.players.get(id);
      if (!p || p.hp <= 0 || !p.connected || this.state.elapsed - at > CHARGE.inputTimeoutMs) {
        if (p) {
          p.chargeStartedAt = -1;
        }
        this.chargeInputs.delete(id);
      }
    }
    for (const [id, p] of this.state.projectiles) {
      const shot = this.shots.get(id)!;
      if (this.state.elapsed >= shot.expires) {
        this.remove(id);
        continue;
      }
      const end = { x: p.x + shot.vx * dt, y: p.y + shot.vy * dt };
      const hit = this.impact(p, end, shot.rules.radius, shot.hostile, p.owner);
      if (hit.fraction !== Infinity) {
        if (hit.victim) {
          this.damage(hit.victim, shot.rules.damage, p.owner);
        }
        this.remove(id);
      } else {
        Object.assign(p, end);
        if (
          p.x < WORLD.border ||
          p.y < WORLD.border ||
          p.x > WORLD.width - WORLD.border ||
          p.y > WORLD.height - WORLD.border
        ) {
          this.remove(id);
        }
      }
    }
  }

  removeOwner(owner: string): void {
    this.chargeInputs.delete(owner);
    for (const [id, p] of this.state.projectiles) {
      if (p.owner === owner) {
        this.remove(id);
      }
    }
  }

  private sweep(owner: string, player: Player, angle: number, multiplier: number): void {
    Object.assign(player, {
      sweepAt: this.state.elapsed,
      sweepX: player.x,
      sweepY: player.y,
      sweepAngle: angle,
    });
    const damage = Math.round(
      COMBAT.swordDamage * equipmentStats(player).damageMultiplier * multiplier,
    );
    for (const target of this.targets(owner)) {
      const radius =
        target instanceof Player ? RULES.playerRadius : enemyRules((target as Mob).role).radius;
      if (
        sectorHits(player, angle, COMBAT.swordReach, COMBAT.swordHalfAngle, target, radius) &&
        terrainHit(player, target, 0, this.map.obstacles) === null
      ) {
        this.damage(target, damage, owner);
      }
    }
  }

  /** Fight is free-for-all; cooperative modes keep friendly fire disabled. */
  private *targets(owner: string, hostile = false): Generator<Player | Mob> {
    const targets = hostile || this.state.mode === 'fight' ? this.state.players : this.state.mobs;
    for (const [id, target] of targets) {
      if (id !== owner && target.hp > 0 && (!(target instanceof Player) || target.connected)) {
        yield target;
      }
    }
  }

  private impact(from: Point, to: Point, radius: number, hostile: boolean, owner: string): Impact {
    const result: Impact = {
      fraction: terrainHit(from, to, radius, this.map.obstacles) ?? Infinity,
    };
    for (const target of this.targets(owner, hostile)) {
      const size =
        target instanceof Player ? RULES.playerRadius : enemyRules((target as Mob).role).radius;
      const fraction = sweepRect(
        from,
        to,
        { x: target.x - size, y: target.y - size, width: size * 2, height: size * 2 },
        radius,
      );
      if (fraction !== null && fraction < result.fraction) {
        result.fraction = fraction;
        result.victim = target;
      }
    }
    return result;
  }

  enemyAttack(id: string, mob: Mob): void {
    this.enemyCombat.attack(id, mob);
  }

  private damage(target: Player | Mob, amount: number, ownerId: string): void {
    if (target.hp <= 0) {
      return;
    }
    if (
      target instanceof Player &&
      Math.hypot(target.x - this.map.spawns[0]!.x, target.y - this.map.spawns[0]!.y) <
        ENEMY_AI.campRadius &&
      this.state.mobs.has(ownerId)
    ) {
      return;
    }
    if (
      target instanceof Player &&
      Math.max(target.protectedUntil, target.invulnerableUntil) > this.state.elapsed
    ) {
      return;
    }
    if (!(target instanceof Player) && (target as Mob).role === 'boss') {
      (target as Mob).engaged = true;
    }
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp > 0) {
      return;
    }
    target.respawnAt =
      this.state.elapsed + (target instanceof Player ? RULES.playerRespawnMs : RULES.mobRespawnMs);
    if (target instanceof Player) {
      target.invulnerableUntil = 0;
      target.chargeStartedAt = -1;
      const owner = this.state.players.get(ownerId);
      if (this.state.mode === 'fight' && owner && owner !== target) {
        owner.kills++;
      }
    } else {
      const owner = this.state.players.get(ownerId);
      if (owner) {
        owner.kills++;
        this.defeated(target as Mob);
      }
    }
  }
  private remove(id: string): void {
    this.state.projectiles.delete(id);
    this.shots.delete(id);
  }
}
