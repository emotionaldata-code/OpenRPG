import type { GameMap } from '@openrpg/shared';
import { rect } from './pixel-canvas';
/** Flat, non-colliding remains and motifs along each authored itinerary. */
export function paintBiomeDetails(c: CanvasRenderingContext2D, map: GameMap): void {
  const p = map.palette;
  for (const [i, path] of map.paths.entries()) {
    if (i % 2 !== 0) {
      continue;
    }
    const x = (path.x + Math.min(path.width - 25, 100 + map.stage * 19)) / 2,
      y = (path.y + path.height / 2) / 2;
    c.save();
    c.translate(x, y);
    switch (map.biome) {
      case 'desert':
        rect(c, '#f0d9a3', -12, -2, 24, 3);
        for (let j = -9; j < 11; j += 5) {
          rect(c, '#f0d9a3', j, -7, 2, 13);
        }
        rect(c, p.edge, 13, -4, 6, 7);
        rect(c, p.highlight, 14, -4, 4, 4);
        break;
      case 'forest':
        for (let j = 0; j < 5; j++) {
          const dx = j * 7 - 15,
            dy = (j % 2) * 8;
          rect(c, '#b4b391', dx, dy, 2, 5);
          rect(c, j % 2 ? '#ab657c' : '#d6b06a', dx - 2, dy - 2, 6, 3);
        }
        break;
      case 'castle':
        rect(c, '#692f42', -25, -9, 50, 18);
        rect(c, p.accent, -25, -9, 50, 1);
        rect(c, p.accent, -25, 8, 50, 1);
        rect(c, p.highlight, -3, -5, 6, 10);
        rect(c, p.highlight, -7, -1, 14, 2);
        break;
      case 'mountain':
        c.strokeStyle = p.edge;
        c.beginPath();
        c.moveTo(-22, -8);
        c.lineTo(-3, 0);
        c.lineTo(18, 9);
        c.moveTo(-3, 0);
        c.lineTo(10, -10);
        c.stroke();
        rect(c, '#d9f9ff', -11, -3, 4, 3);
        rect(c, '#afdae9', 12, 4, 7, 2);
        break;
      case 'paradise':
        c.strokeStyle = p.highlight;
        c.beginPath();
        c.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
        c.stroke();
        for (let j = 0; j < 4; j++) {
          rect(c, '#fff0e0', j * 6 - 10, j - 3, 5, 2);
        }
        break;
      case 'hell':
        c.strokeStyle = p.accent;
        c.beginPath();
        c.moveTo(-20, 0);
        c.lineTo(0, -10);
        c.lineTo(20, 0);
        c.lineTo(0, 10);
        c.closePath();
        c.stroke();
        rect(c, '#e4be95', -3, -3, 6, 5);
        rect(c, p.edge, -2, -2, 1, 2);
        rect(c, p.edge, 1, -2, 1, 2);
        break;
    }
    c.restore();
  }
}
