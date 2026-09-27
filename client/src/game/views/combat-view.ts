import type Phaser from 'phaser';
import {
  COMBAT,
  terrainHit,
  enemyRules,
  ENEMY_THEMES,
  attackPattern,
  attackAngles,
  enemyRole,
} from '@openrpg/shared';
import type { GameNetwork } from '../network';

/** Authoritative effects only; movement reconciliation never plays attacks again. */
export class CombatView {
  private shots = new Map<string, Phaser.GameObjects.Image>();
  private effects: Phaser.GameObjects.Graphics;
  constructor(
    private scene: Phaser.Scene,
    private net: GameNetwork,
  ) {
    this.effects = scene.add.graphics().setDepth(1801);
  }
  draw(): void {
    const state = this.net.room.state,
      now = this.net.serverTime;
    for (const [id, p] of state.projectiles) {
      let image = this.shots.get(id);
      if (!image) {
        image = this.scene.add.image(p.x, p.y, p.kind).setDepth(1800);
        image.setScale(p.kind === 'arrow' || p.kind === 'bolt' ? 1.6 : 1);
        if (p.kind === 'bolt') {
          image.setTint(Number.parseInt(ENEMY_THEMES[this.net.map.id].eyes.slice(1), 16));
        }
        this.shots.set(id, image);
      }
      image
        .setPosition(this.net.predict.value(p, 'x'), this.net.predict.value(p, 'y'))
        .setRotation(p.angle);
      if (p.kind === 'fireball' || p.kind === 'inferno') {
        image.setAlpha(0.88 + Math.sin(this.scene.time.now / 45) * 0.12);
      }
    }
    for (const [id, image] of this.shots) {
      if (!state.projectiles.has(id)) {
        image.destroy();
        this.shots.delete(id);
      }
    }
    const g = this.effects.clear();
    for (const mob of state.mobs.values()) {
      if (mob.hp <= 0) {
        continue;
      }
      const winding = mob.attackAt > 0,
        flash = now - mob.lastAttackAt;
      if (!winding && (flash < 0 || flash > 250)) {
        continue;
      }
      // Use the server's locked origin/target so warning geometry matches actual damage.
      const x = mob.attackX,
        y = mob.attackY;
      const rules = enemyRules(mob.role, this.net.map.id),
        pattern = attackPattern(mob.attackKind, mob.role, this.net.map.id);
      const progress = winding
        ? Math.max(
            0,
            Math.min(
              1,
              (now - mob.attackStartedAt) / Math.max(1, mob.attackAt - mob.attackStartedAt),
            ),
          )
        : 1;
      const alpha = winding ? 0.12 + progress * 0.2 : (1 - flash / 250) * 0.55;
      const color = mob.enraged ? 0xff805e : winding ? 0xf0a75e : 0xffddb0;
      g.fillStyle(color, alpha).lineStyle(2, color, 0.8);
      if (mob.attackKind === 'eruption') {
        g.fillCircle(mob.targetX, mob.targetY, pattern.radius).strokeCircle(
          mob.targetX,
          mob.targetY,
          pattern.radius,
        );
        g.lineStyle(3, 0xffdc99).strokeCircle(mob.targetX, mob.targetY, pattern.radius * progress);
        g.lineBetween(mob.targetX - 8, mob.targetY, mob.targetX + 8, mob.targetY);
        g.lineBetween(mob.targetX, mob.targetY - 8, mob.targetX, mob.targetY + 8);
      } else if (mob.attackKind === 'charge') {
        const end = { x: mob.targetX, y: mob.targetY };
        const fraction = terrainHit({ x, y }, end, rules.radius, this.net.map.obstacles) ?? 1;
        const tx = x + (end.x - x) * fraction,
          ty = y + (end.y - y) * fraction;
        const dx = -Math.sin(mob.attackAngle) * rules.radius,
          dy = Math.cos(mob.attackAngle) * rules.radius;
        g.beginPath()
          .moveTo(x + dx, y + dy)
          .lineTo(tx + dx, ty + dy)
          .lineTo(tx - dx, ty - dy)
          .lineTo(x - dx, y - dy)
          .closePath()
          .fillPath()
          .strokePath();
        g.lineStyle(3, color, 0.9).lineBetween(
          x,
          y,
          x + (tx - x) * progress,
          y + (ty - y) * progress,
        );
      } else if (mob.attackKind === 'slam' || mob.attackKind === 'strike') {
        // Clip sectors and shockwaves at cover, using the same sight test as damage.
        const half = mob.attackKind === 'slam' ? Math.PI : Math.PI / 3;
        g.beginPath().moveTo(x, y);
        for (let i = 0; i <= 40; i++) {
          const angle = mob.attackAngle - half + (half * 2 * i) / 40;
          const end = {
            x: x + Math.cos(angle) * pattern.radius,
            y: y + Math.sin(angle) * pattern.radius,
          };
          const fraction = terrainHit({ x, y }, end, 0, this.net.map.obstacles) ?? 1;
          g.lineTo(x + (end.x - x) * fraction, y + (end.y - y) * fraction);
        }
        g.closePath().fillPath().strokePath();
      } else {
        for (const angle of attackAngles(mob.attackKind, mob.attackAngle, enemyRole(mob.role))) {
          g.lineStyle(2, color, 0.3 + progress * 0.5).lineBetween(
            x,
            y,
            x + Math.cos(angle) * 130,
            y + Math.sin(angle) * 130,
          );
        }
        g.lineStyle(2, color, 0.8).strokeCircle(x, y, rules.radius + 8 + progress * 6);
      }
    }

    for (const p of state.players.values()) {
      if (p.hp <= 0) {
        continue;
      }
      const age = now - p.sweepAt;
      if (age >= 0 && age < COMBAT.sweepMs) {
        const progress = age / COMBAT.sweepMs,
          alpha = 1 - progress;
        const x = p.sweepX,
          y = p.sweepY,
          start = p.sweepAngle - COMBAT.swordHalfAngle;
        // Clip the displayed sector at terrain, matching the server's line-of-sight rule.
        g.fillStyle(0xe8d49b, alpha * 0.24)
          .lineStyle(2, 0xf9e6ab, alpha * 0.8)
          .beginPath()
          .moveTo(x, y);
        for (let i = 0; i <= 24; i++) {
          const angle = start + (COMBAT.swordHalfAngle * 2 * i) / 24;
          const end = {
            x: x + Math.cos(angle) * COMBAT.swordReach,
            y: y + Math.sin(angle) * COMBAT.swordReach,
          };
          const fraction = terrainHit({ x, y }, end, 0, this.net.map.obstacles) ?? 1;
          g.lineTo(x + (end.x - x) * fraction, y + (end.y - y) * fraction);
        }
        g.closePath().fillPath().strokePath();
        const angle = start + COMBAT.swordHalfAngle * 2 * progress;
        const tip = {
          x: x + Math.cos(angle) * COMBAT.swordReach,
          y: y + Math.sin(angle) * COMBAT.swordReach,
        };
        const fraction = terrainHit({ x, y }, tip, 0, this.net.map.obstacles) ?? 1;
        g.lineStyle(4, 0xfff8d8, alpha).lineBetween(
          x,
          y,
          x + (tip.x - x) * fraction,
          y + (tip.y - y) * fraction,
        );
      }
      if (p.invulnerableUntil > now) {
        const x = this.net.predict.value(p, 'x'),
          y = this.net.predict.value(p, 'y');
        const pulse = 0.65 + Math.sin(this.scene.time.now / 120) * 0.2;
        g.fillStyle(0xe1c279, 0.1).fillCircle(x, y, 27);
        g.lineStyle(2, 0xf2dca2, pulse).strokeCircle(x, y, 27);
        g.lineStyle(3, 0xf7edc7, 0.9)
          .beginPath()
          .arc(
            x,
            y,
            30,
            -Math.PI / 2,
            -Math.PI / 2 +
              Math.PI * 2 * Math.min(1, (p.invulnerableUntil - now) / COMBAT.immunityMs),
          )
          .strokePath();
      }
    }
  }
}
