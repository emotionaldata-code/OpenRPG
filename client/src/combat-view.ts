import Phaser from 'phaser';
import { COMBAT, terrainHit, enemyRules, ENEMY_THEMES } from '@openrpg/shared';
import type { GameNetwork } from './network';

/** Authoritative effects only; movement reconciliation never plays attacks again. */
export class CombatView {
  private shots = new Map<string, Phaser.GameObjects.Image>();
  private effects: Phaser.GameObjects.Graphics;
  constructor(private scene: Phaser.Scene, private net: GameNetwork) {
    this.effects = scene.add.graphics().setDepth(1801);
  }
  draw(): void {
    const state = this.net.room.state, now = this.net.serverTime;
    for (const [id, p] of state.projectiles) {
      let image = this.shots.get(id);
      if (!image) {
        image = this.scene.add.image(p.x, p.y, p.kind).setDepth(1800);
        image.setScale(p.kind === 'arrow' || p.kind === 'bolt' ? 1.6 : 1);
        if (p.kind === 'bolt') image.setTint(Number.parseInt(ENEMY_THEMES[this.net.map.id].eyes.slice(1), 16));
        this.shots.set(id, image);
      }
      image.setPosition(this.net.predict.value(p, 'x'), this.net.predict.value(p, 'y')).setRotation(p.angle);
      if (p.kind === 'fireball' || p.kind === 'inferno') image.setAlpha(.88 + Math.sin(this.scene.time.now / 45) * .12);
    }
    for (const [id, image] of this.shots) if (!state.projectiles.has(id)) { image.destroy(); this.shots.delete(id); }
    const g = this.effects.clear();
    for (const mob of state.mobs.values()) {
      if (mob.hp <= 0) continue;
      const winding = mob.attackAt > 0, flash = now - mob.lastAttackAt;
      if (!winding && (flash < 0 || flash > 250)) continue;
      // Telegraph the authoritative origin, not the buffered moving sprite.
      const x = mob.x, y = mob.y, rules = enemyRules(mob.role);
      const progress = winding ? Math.max(0, Math.min(1, 1 - (mob.attackAt - now) / rules.windupMs)) : 1;
      const alpha = winding ? .16 + progress * .16 : (1 - flash / 250) * .55;
      const color = winding ? 0xf0a75e : 0xffddb0;
      g.fillStyle(color, alpha).lineStyle(2, color, .8);
      if (mob.attackKind === 'slam') {
        g.fillCircle(x, y, rules.reach).strokeCircle(x, y, rules.reach);
        g.lineStyle(3, 0xffdc99, .9).strokeCircle(x, y, rules.reach * progress);
      } else if (mob.attackKind === 'strike') {
        const start = mob.attackAngle - Math.PI / 3, end = mob.attackAngle + Math.PI / 3;
        g.beginPath().moveTo(x, y).arc(x, y, rules.reach, start, end).closePath().fillPath().strokePath();
      } else {
        const count = mob.attackKind === 'ring' ? 12 : mob.attackKind === 'fan' ? 5 : 1;
        for (let i = 0; i < count; i++) {
          const angle = mob.attackAngle + (mob.attackKind === 'ring' ? i * Math.PI * 2 / count : mob.attackKind === 'fan' ? (i - 2) * .24 : 0);
          g.lineStyle(2, color, .3 + progress * .5).lineBetween(x, y, x + Math.cos(angle) * 110, y + Math.sin(angle) * 110);
        }
        g.lineStyle(2, color, .8).strokeCircle(x, y, rules.radius + 8 + progress * 6);
      }
    }
    for (const p of state.players.values()) {
      if (p.hp <= 0) continue;
      const age = now - p.sweepAt;
      if (age >= 0 && age < COMBAT.sweepMs) {
        const progress = age / COMBAT.sweepMs, alpha = 1 - progress;
        const x = p.sweepX, y = p.sweepY, start = p.sweepAngle - COMBAT.swordHalfAngle;
        // Clip the displayed sector at terrain, matching the server's line-of-sight rule.
        g.fillStyle(0xe8d49b, alpha * .24).lineStyle(2, 0xf9e6ab, alpha * .8).beginPath().moveTo(x, y);
        for (let i = 0; i <= 24; i++) {
          const angle = start + COMBAT.swordHalfAngle * 2 * i / 24;
          const end = { x: x + Math.cos(angle) * COMBAT.swordReach, y: y + Math.sin(angle) * COMBAT.swordReach };
          const fraction = terrainHit({ x, y }, end, 0, this.net.map.obstacles) ?? 1;
          g.lineTo(x + (end.x - x) * fraction, y + (end.y - y) * fraction);
        }
        g.closePath().fillPath().strokePath();
        const angle = start + COMBAT.swordHalfAngle * 2 * progress;
        const tip = { x: x + Math.cos(angle) * COMBAT.swordReach, y: y + Math.sin(angle) * COMBAT.swordReach };
        const fraction = terrainHit({ x, y }, tip, 0, this.net.map.obstacles) ?? 1;
        g.lineStyle(4, 0xfff8d8, alpha).lineBetween(x, y, x + (tip.x - x) * fraction, y + (tip.y - y) * fraction);
      }
      if (p.invulnerableUntil > now) {
        const x = this.net.predict.value(p, 'x'), y = this.net.predict.value(p, 'y');
        const pulse = .65 + Math.sin(this.scene.time.now / 120) * .2;
        g.fillStyle(0xe1c279, .1).fillCircle(x, y, 27);
        g.lineStyle(2, 0xf2dca2, pulse).strokeCircle(x, y, 27);
        g.lineStyle(3, 0xf7edc7, .9).beginPath().arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, (p.invulnerableUntil - now) / COMBAT.immunityMs)).strokePath();
      }
    }
  }
}
