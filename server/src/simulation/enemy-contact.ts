import {
  CONTACT,
  RULES,
  enemyRules,
  moveBody,
  sweepRect,
  terrainHit,
  type GameMap,
  type Mob,
  type Player,
  type Point,
  type WorldState,
} from '@openrpg/shared';

interface Contacts {
  generation: number;
  touching: Set<Mob>;
  dashAt: number;
  dashed: Set<Mob>;
}

/** Movement contact owns knockback and player stun recovery. */
export class EnemyContact {
  private players = new Map<string, Contacts>();
  constructor(
    private state: WorldState,
    private map: GameMap,
    private stun: (mob: Mob, durationMs: number) => void,
  ) {}

  move(id: string, player: Player, from: Point, dashing: boolean): void {
    if (
      this.state.mode === 'fight' ||
      player.hp <= 0 ||
      !player.connected ||
      this.state.elapsed < player.stunnedUntil ||
      (from.x === player.x && from.y === player.y)
    ) {
      return;
    }
    let contacts = this.players.get(id);
    if (!contacts || contacts.generation !== player.generation) {
      contacts = {
        generation: player.generation,
        touching: new Set(),
        dashAt: -1,
        dashed: new Set(),
      };
      this.players.set(id, contacts);
    }
    if (contacts.dashAt !== player.nextDashAt) {
      contacts.dashAt = player.nextDashAt;
      contacts.dashed.clear();
    }
    // Leave a contact before it can stun again, allowing escape after the deadline.
    for (const mob of contacts.touching) {
      const size = enemyRules(mob.role).radius + RULES.playerRadius + 0.01;
      if (mob.hp <= 0 || Math.abs(from.x - mob.x) > size || Math.abs(from.y - mob.y) > size) {
        contacts.touching.delete(mob);
      }
    }
    const hits: { mob: Mob; fraction: number }[] = [];
    for (const mob of this.state.mobs.values()) {
      if (mob.hp <= 0) {
        continue;
      }
      const radius = enemyRules(mob.role).radius;
      const fraction = sweepRect(
        from,
        player,
        {
          x: mob.x - radius,
          y: mob.y - radius,
          width: radius * 2,
          height: radius * 2,
        },
        RULES.playerRadius,
      );
      if (fraction !== null && terrainHit(from, mob, 0, this.map.obstacles) === null) {
        hits.push({ mob, fraction });
      }
    }
    hits.sort(
      (a, b) =>
        a.fraction - b.fraction || Number(b.mob.role === 'boss') - Number(a.mob.role === 'boss'),
    );
    for (const { mob, fraction } of hits) {
      if (dashing && mob.role !== 'boss') {
        if (!contacts.dashed.has(mob)) {
          contacts.dashed.add(mob);
          this.stun(mob, CONTACT.dash.stunMs);
          moveBody(
            mob,
            Math.cos(player.dashAngle) * CONTACT.dash.push,
            Math.sin(player.dashAngle) * CONTACT.dash.push,
            enemyRules(mob.role).radius,
            this.map.obstacles,
          );
        }
        contacts.touching.add(mob);
      } else if (
        !contacts.touching.has(mob) &&
        (player.stunnedUntil === 0 ||
          this.state.elapsed >= player.stunnedUntil + CONTACT.recoveryMs)
      ) {
        contacts.touching.add(mob);
        const dx = player.x - from.x,
          dy = player.y - from.y;
        Object.assign(player, from);
        moveBody(player, dx * fraction, dy * fraction, RULES.playerRadius, this.map.obstacles);
        const angle =
          player.x === mob.x && player.y === mob.y
            ? Math.atan2(-dy, -dx)
            : Math.atan2(player.y - mob.y, player.x - mob.x);
        moveBody(
          player,
          Math.cos(angle) * CONTACT.playerPush,
          Math.sin(angle) * CONTACT.playerPush,
          RULES.playerRadius,
          this.map.obstacles,
        );
        player.stunnedUntil =
          this.state.elapsed + CONTACT.playerStunMs[mob.role === 'boss' ? 'boss' : 'mob'];
        player.dashRemaining = 0;
        player.chargeStartedAt = -1;
        break;
      }
    }
  }

  remove(id: string): void {
    this.players.delete(id);
  }
}
