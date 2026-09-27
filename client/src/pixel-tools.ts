import { SKIN } from '@openrpg/shared';
export type PixelTool = 'pencil' | 'eraser' | 'fill' | 'picker';
/** Four-connected flood fill, bounded to one 24 × 28 frame. */
export function fillPixels(pixels: number[], start: number, color: number): void {
  const target = pixels[start];
  if (target === undefined || target === color) return;
  const pending = [start]; pixels[start] = color;
  while (pending.length) {
    const at = pending.pop()!;
    const neighbors = [at - SKIN.width, at + SKIN.width];
    if (at % SKIN.width > 0) neighbors.push(at - 1);
    if (at % SKIN.width < SKIN.width - 1) neighbors.push(at + 1);
    for (const next of neighbors) if (next >= 0 && next < pixels.length && pixels[next] === target) { pixels[next] = color; pending.push(next); }
  }
}
/** Interpolate drag events so a fast stroke has no gaps. */
export function pencilLine(pixels: number[], from: number, to: number, color: number): void {
  const x = from % SKIN.width, y = Math.floor(from / SKIN.width);
  const dx = to % SKIN.width - x, dy = Math.floor(to / SKIN.width) - y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i++) {
    const fraction = steps ? i / steps : 0;
    pixels[Math.round(y + dy * fraction) * SKIN.width + Math.round(x + dx * fraction)] = color;
  }
}
