import type { GameMap } from '@openrpg/shared';
import { rect } from './pixel-canvas';

/** Ground-level arena motifs; decorative marks never create invisible collision. */
export function paintLandmark(c: CanvasRenderingContext2D, map: GameMap): void {
  const x = map.landmark.x / 2,
    y = map.landmark.y / 2,
    p = map.palette;
  c.save();
  c.translate(x, y);
  c.strokeStyle = p.highlight;
  c.lineWidth = 2;
  if (map.id === 'castle') {
    rect(c, p.edge, -76, -62, 152, 124);
    rect(c, p.path, -72, -58, 144, 116);
    for (let row = -50; row < 50; row += 14) {
      for (let col = -64; col < 65; col += 16) {
        if ((Math.round(row / 14) + Math.round(col / 16)) % 2 === 0) {
          rect(c, p.stone, col, row, 14, 12);
        }
      }
    }
    rect(c, '#74444f', -16, -48, 32, 130);
    rect(c, p.accent, -17, -48, 2, 130);
    rect(c, p.accent, 15, -48, 2, 130);
  } else {
    const spokes = map.id === 'mountain' ? 6 : map.id === 'hell' ? 5 : 12;
    c.beginPath();
    c.ellipse(0, 0, 83, 67, 0, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < spokes; i++) {
      const angle = (i * Math.PI * 2) / spokes - Math.PI / 2;
      const sx = Math.cos(angle),
        sy = Math.sin(angle);
      c.beginPath();
      if (map.id === 'hell') {
        const other = angle + (Math.PI * 4) / spokes;
        c.moveTo(sx * 70, sy * 56);
        c.lineTo(Math.cos(other) * 70, Math.sin(other) * 56);
      } else {
        c.moveTo(sx * 20, sy * 16);
        c.lineTo(sx * 74, sy * 59);
        if (map.id === 'forest' || map.id === 'mountain') {
          c.lineTo(sx * 57 - sy * 10, sy * 45 + sx * 10);
        }
      }
      c.stroke();
      rect(c, p.accent, sx * 79 - 2, sy * 63 - 2, 4, 4);
    }
    c.beginPath();
    c.ellipse(0, 0, 25, 20, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}
