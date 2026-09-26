import {
  RULES, WORLD, SPAWNS, MOB_SPAWNS, Player, Mob, Projectile, WorldState,
  movePlayer, moveBody, terrainHit, sweepRect, type Intent, type Point,
} from '@openrpg/shared';
interface MobBrain { home: Point; nextShot: number; waypoint: number }
interface Shot { vx: number; vy: number; expires: number }
export class Simulation {
  private nextShots = new Map<string, number>();
  private brains = new Map<string, MobBrain>();
  private shots = new Map<string, Shot>();
  private shotId = 0;
  private joins = 0;
  constructor(readonly state: WorldState) {
    MOB_SPAWNS.forEach((home, i) => {
      const id = `mage-${i}`;
      state.mobs.set(id, new Mob({ x: home.x, y: home.y }));
      this.brains.set(id, { home, nextShot: 700 + i * 200, waypoint: 0 });
    });
  }
  addPlayer(id: string, name: string): void {
    const spawn = SPAWNS[this.joins++ % SPAWNS.length]!;
    this.state.players.set(id, new Player({ name, ...spawn, protectedUntil: this.state.elapsed + RULES.protectionMs }));
  }
  removePlayer(id: string): void {
    this.state.players.delete(id); this.nextShots.delete(id);
    for (const [key, p] of this.state.projectiles) if (p.owner === id) this.removeShot(key);
  }
  /** World timers advance once, irrespective of the number of input packets received. */
  advance(dt: number): void {
    this.state.elapsed += dt * 1000;
    for (const [id, player] of this.state.players) {
      if (player.hp <= 0 && this.state.elapsed >= player.respawnAt) {
        const index = [...this.state.players.keys()].indexOf(id);
        Object.assign(player, SPAWNS[index % SPAWNS.length]!, {
          hp: RULES.playerHealth, respawnAt: 0, protectedUntil: this.state.elapsed + RULES.protectionMs,
          generation: player.generation + 1,
        });
      }
    }
    for (const [id, mob] of this.state.mobs) {
      const brain = this.brains.get(id)!;
      if (mob.hp <= 0) {
        if (this.state.elapsed >= mob.respawnAt) {
          Object.assign(mob, brain.home, { hp: RULES.mobHealth, respawnAt: 0, generation: mob.generation + 1 });
          brain.nextShot = this.state.elapsed + RULES.mobCooldownMs;
        }
        continue;
      }
      this.stepMob(id, mob, brain, dt);
    }
    this.stepProjectiles(dt);
  }
  applyInput(id: string, input: Intent, dt: number): void {
    const player = this.state.players.get(id);
    if (!player || !player.connected || player.hp <= 0) return;
    movePlayer(player, input, dt);
    if (input.fire && this.state.elapsed >= (this.nextShots.get(id) ?? 0)) {
      this.spawnShot(id, player, input.aim, 'arrow');
      this.nextShots.set(id, this.state.elapsed + RULES.bowCooldownMs);
    }
  }
  private stepMob(id: string, mob: Mob, brain: MobBrain, dt: number): void {
    let target: Player | undefined;
    let distance = RULES.mobRange as number;
    for (const p of this.state.players.values()) {
      const d = Math.hypot(p.x - mob.x, p.y - mob.y);
      if (p.hp > 0 && p.connected && d < distance) { target = p; distance = d; }
    }
    if (target) {
      mob.aim = Math.atan2(target.y - mob.y, target.x - mob.x);
      if (distance > RULES.mobStopRange) this.walk(mob, target, dt);
      if (this.state.elapsed >= brain.nextShot && terrainHit(mob, target, RULES.projectileRadius) === null) {
        this.spawnShot(id, mob, mob.aim, 'bolt');
        brain.nextShot = this.state.elapsed + RULES.mobCooldownMs;
      }
    } else {
      const offsets = [{ x: -55, y: 0 }, { x: 0, y: -45 }, { x: 55, y: 0 }, { x: 0, y: 45 }];
      const offset = offsets[brain.waypoint % offsets.length]!;
      const goal = { x: brain.home.x + offset.x, y: brain.home.y + offset.y };
      const before = { x: mob.x, y: mob.y };
      this.walk(mob, goal, dt);
      if (Math.hypot(mob.x - goal.x, mob.y - goal.y) < 5 || Math.hypot(mob.x - before.x, mob.y - before.y) < 0.1) brain.waypoint++;
    }
  }
  private walk(mob: Mob, target: Point, dt: number): void {
    mob.aim = Math.atan2(target.y - mob.y, target.x - mob.x);
    moveBody(mob, Math.cos(mob.aim) * RULES.mobSpeed * dt, Math.sin(mob.aim) * RULES.mobSpeed * dt, RULES.mobRadius);
  }
  private spawnShot(owner: string, from: Point, angle: number, kind: 'arrow' | 'bolt'): void {
    const id = String(this.shotId++);
    // Start at the owner center so a muzzle offset cannot shoot through a wall.
    this.state.projectiles.set(id, new Projectile({ x: from.x, y: from.y, angle, owner, kind }));
    const speed = kind === 'arrow' ? RULES.arrowSpeed : RULES.boltSpeed;
    this.shots.set(id, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, expires: this.state.elapsed + RULES.projectileLifeMs });
  }
  private stepProjectiles(dt: number): void {
    for (const [id, p] of this.state.projectiles) {
      const shot = this.shots.get(id)!;
      if (this.state.elapsed >= shot.expires) { this.removeShot(id); continue; }
      const end = { x: p.x + shot.vx * dt, y: p.y + shot.vy * dt };
      let earliest = terrainHit(p, end, RULES.projectileRadius) ?? Infinity;
      let victim: Player | Mob | undefined;
      const candidates = p.kind === 'arrow' ? this.state.mobs.values() : this.state.players.values();
      const radius = p.kind === 'arrow' ? RULES.mobRadius : RULES.playerRadius;
      for (const target of candidates) {
        if (target.hp <= 0 || (target instanceof Player && (target.protectedUntil > this.state.elapsed || !target.connected))) continue;
        const hit = sweepRect(p, end, { x: target.x - radius, y: target.y - radius, width: radius * 2, height: radius * 2 }, RULES.projectileRadius);
        if (hit !== null && hit < earliest) { earliest = hit; victim = target; }
      }
      if (earliest !== Infinity) {
        if (victim) {
          victim.hp = Math.max(0, victim.hp - (p.kind === 'arrow' ? RULES.arrowDamage : RULES.boltDamage));
          if (victim.hp === 0) {
            victim.respawnAt = this.state.elapsed + (p.kind === 'arrow' ? RULES.mobRespawnMs : RULES.playerRespawnMs);
            if (p.kind === 'arrow') { const owner = this.state.players.get(p.owner); if (owner) owner.kills++; }
          }
        }
        this.removeShot(id);
      } else {
        Object.assign(p, end);
        if (p.x < WORLD.border || p.y < WORLD.border || p.x > WORLD.width - WORLD.border || p.y > WORLD.height - WORLD.border) this.removeShot(id);
      }
    }
  }
  private removeShot(id: string): void { this.state.projectiles.delete(id); this.shots.delete(id); }
}
