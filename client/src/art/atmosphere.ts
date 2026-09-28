import type Phaser from 'phaser';
import { WORLD, type GameMap } from '@openrpg/shared';
/** One small draw list; no particle timers, textures or listeners survive scene shutdown. */
export class Atmosphere {
  private graphics: Phaser.GameObjects.Graphics;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(
    scene: Phaser.Scene,
    private map: GameMap,
  ) {
    this.graphics = scene.add.graphics().setDepth(1750);
  }
  draw(time: number): void {
    const g = this.graphics.clear(),
      p = this.map.palette;
    const t = this.reduced ? 0 : time / 1000,
      biome = this.map.biome;
    const color = Number.parseInt(p.accent.slice(1), 16);
    for (let i = 0; i < 64; i++) {
      const x =
        (i * 167.3 + t * (biome === 'desert' ? 36 : biome === 'hell' ? -9 : 8)) % WORLD.width;
      const y =
        (((i * 71.7 + t * (biome === 'mountain' ? 24 : biome === 'hell' ? -22 : 4)) %
          WORLD.height) +
          WORLD.height) %
        WORLD.height;
      const pulse = 0.2 + (1 + Math.sin(t * 2 + i)) * 0.16;
      g.fillStyle(color, pulse).lineStyle(1, color, pulse);
      if (biome === 'desert') {
        g.lineBetween(x, y, x + 12, y - 2);
      } else if (biome === 'forest') {
        g.fillEllipse(x, y, 3, 5);
      } else if (biome === 'castle') {
        if (i % 3 === 0) {
          g.fillCircle(x, y, 1.5);
        }
      } else if (biome === 'mountain') {
        g.fillRect(x, y, 3, 3);
      } else if (biome === 'paradise') {
        g.lineBetween(x - 3, y, x + 3, y).lineBetween(x, y - 3, x, y + 3);
      } else {
        g.fillRect(x, y, 2, 5);
      }
    }
    if (this.map.stage === 5) {
      const { x, y } = this.map.landmark;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4,
          radius = 350;
        const px = x + Math.cos(a) * radius,
          py = y + Math.sin(a) * radius;
        g.fillStyle(color, 0.12).fillCircle(px, py, 12 + Math.sin(t * 3 + i) * 3);
        g.fillStyle(color, 0.6).fillRect(px - 2, py - 5, 4, 8);
      }
    }
  }
}
