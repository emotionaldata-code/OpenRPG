import type Phaser from 'phaser';
import {
  CHARGE,
  chargeProgress,
  equippedCombat,
  updateCharge,
  type ChargeState,
  type Intent,
} from '@openrpg/shared';
import type { GameNetwork } from '../network';

/** Cosmetic local timing responds immediately; damage always uses server timing. */
export class ChargeView {
  private ring: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private local: ChargeState = { chargeStartedAt: -1 };
  private generation = -1;
  progress: number | null = null;
  constructor(
    scene: Phaser.Scene,
    private net: GameNetwork,
  ) {
    this.ring = scene.add.graphics().setDepth(2001);
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#f9df94',
        stroke: '#172b25',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(2002);
  }
  draw(input: Intent): void {
    const { room } = this.net,
      now = this.net.serverTime,
      self = room.state.players.get(room.sessionId);
    const g = this.ring.clear();
    this.label.setVisible(false);
    this.progress = null;
    const available =
      self &&
      self.hp > 0 &&
      self.connected &&
      self.stunnedUntil <= now &&
      this.net.connected &&
      room.state.outcome === 'active' &&
      room.state.saveStatus !== 'error';
    if (!available || self.generation !== this.generation) {
      this.local = { chargeStartedAt: -1 };
      this.generation = self?.generation ?? -1;
    }
    if (available) {
      updateCharge(
        this.local,
        input.fire,
        input.cancelFire === true,
        now,
        equippedCombat(self).primary.chargeMs,
      );
    }
    for (const [id, p] of room.state.players) {
      if (
        p.hp <= 0 ||
        p.stunnedUntil > now ||
        !p.connected ||
        !this.net.connected ||
        room.state.outcome !== 'active'
      ) {
        continue;
      }
      const mine = id === room.sessionId,
        charge = mine ? this.local : p;
      const charging = charge.chargeStartedAt >= 0,
        duration = equippedCombat(p).primary.chargeMs;
      if (!mine && !charging) {
        continue;
      }
      const progress = charging ? chargeProgress(now - charge.chargeStartedAt, duration) : 0;
      const sweet = charging && progress >= CHARGE.sweetStart && progress <= CHARGE.sweetEnd;
      const color = sweet ? 0xffdf85 : progress > CHARGE.sweetEnd ? 0xe69771 : 0x93cfba;
      const x = this.net.position(p, 'x'),
        y = this.net.position(p, 'y') - 12,
        radius = 34;
      const angle = (fraction: number): number => -Math.PI / 2 + fraction * Math.PI * 2;
      g.lineStyle(6, 0x142b27, 0.85).strokeCircle(x, y, radius);
      g.lineStyle(4, 0xffda75, charging ? 0.9 : 0.35)
        .beginPath()
        .arc(x, y, radius, angle(CHARGE.sweetStart), angle(CHARGE.sweetEnd))
        .strokePath();
      if (charging) {
        g.lineStyle(2, color, 0.9)
          .beginPath()
          .arc(x, y, radius - 5, angle(0), angle(progress))
          .strokePath();
        g.fillStyle(color).fillCircle(
          x + Math.cos(angle(progress)) * radius,
          y + Math.sin(angle(progress)) * radius,
          sweet ? 4 : 3,
        );
      }

      if (mine && charging) {
        this.progress = progress;
        const labelColor = sweet ? '#ffe59b' : '#b2e0c9';
        if (this.label.style.color !== labelColor) {
          this.label.setColor(labelColor);
        }
        this.label
          .setVisible(true)
          .setPosition(x, y + 48)
          .setText(sweet ? `PERFECT · ${CHARGE.maxDamage}×` : 'RELEASE IN GOLD');
      }
    }
  }
}
