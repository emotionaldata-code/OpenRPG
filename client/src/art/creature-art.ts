import type { BiomeId, CreatureShape } from '@openrpg/shared';
import { rect } from './pixel-canvas';
/** Small authored silhouettes; body parts animate independently of world movement. */
export function paintCreature(
  c: CanvasRenderingContext2D,
  shape: CreatureShape | BiomeId,
  body: string,
  trim: string,
  eyes: string,
  frame: number,
  direction: number,
): void {
  const bob = frame === 1 ? -1 : 0,
    step = frame === 2 ? 2 : 0;
  const r = (color: string, x: number, y: number, w: number, h: number) =>
    rect(c, color, x, y + bob, w, h);
  c.save();
  if (direction === 2) {
    c.translate(32, 0);
    c.scale(-1, 1);
  }
  r('#20252a', 5, 31, 24, 3);
  switch (shape) {
    case 'snake':
      r(body, 5, 24, 20, 6);
      r(trim, 3, 20 + step, 10, 5);
      r(body, 18, 13, 7, 14);
      r(trim, 17, 11, 13, 7);
      r(eyes, 26, 12, 2, 2);
      r('#bf6654', 29, 16, 3, 1);
      break;
    case 'worm':
      for (let i = 0; i < 4; i++) {
        r(i % 2 ? trim : body, 5 + i * 5, 24 - i * 3 + (i % 2 ? step : 0), 7, 9);
      }
      r('#302820', 21, 12, 9, 7);
      r(eyes, 22, 12, 2, 3);
      break;
    case 'scorpion':
    case 'spider':
      for (let i = 0; i < 4; i++) {
        r(trim, 1 + i * 2, 16 + i * 4, 10, 2);
        r(trim, 22 - i * 2, 16 + i * 4 + step, 9, 2);
      }
      r(body, 10, 16, 14, 13);
      r(eyes, 20, 17, 2, 2);
      if (shape === 'scorpion') {
        r(body, 7, 4, 4, 16);
        r(trim, 7, 3, 12, 4);
        r(eyes, 17, 6, 3, 4);
      } else {
        r(trim, 12, 15, 7, 4);
      }
      break;
    case 'tree':
    case 'bush':
      r('#674832', 11, 18, 10, 14);
      r(body, 4, 12, 25, 12);
      r(trim, 8, 6, 17, 10);
      r(body, 1, 20, 7, 6);
      r(body, 26, 18, 6, 7);
      r(eyes, 11, 17, 3, 3);
      r(eyes, 19, 17, 3, 3);
      if (shape === 'tree') {
        r('#805435', 5, 1, 3, 17);
        r('#805435', 25, 0, 3, 19);
        r(trim, 1, 2, 9, 4);
      }
      break;
    case 'bat':
    case 'eagle':
    case 'harpy':
    case 'cherub':
    case 'drake':
    case 'hell':
    case 'paradise':
      for (let i = 0; i < 3; i++) {
        r(trim, i * 3, 6 + i * 5 + step, 5, 16 - i * 3);
        r(shape === 'paradise' ? '#665779' : trim, 27 - i * 3, 6 + i * 5 - step, 5, 16 - i * 3);
      }
      r(body, 11, 13, 12, 16);
      r(trim, 12, 5, 10, 10);
      r(eyes, 19, 8, 3, 2);
      if (shape === 'hell' || shape === 'drake') {
        r(trim, 10, 0, 3, 9);
        r(trim, 23, 0, 3, 9);
        r(body, 21, 27, 10, 3);
      } else {
        r('#ffe6a1', 11, 1, 13, 2);
      }
      break;
    case 'wolf':
    case 'hound':
    case 'mountain':
    case 'desert':
    case 'forest':
      r(body, 4, 17, 23, 11);
      r(body, 21, 9, 10, 13);
      r(trim, 26, 15, 6, 6);
      r(body, 5, 26, 5, 7 - step);
      r(body, 22, 26, 5, 5 + step);
      r(eyes, 27, 11, 2, 2);
      if (shape === 'desert') {
        r('#a96c31', 17, 7, 12, 18);
        r(trim, 23, 10, 8, 12);
        r(eyes, 27, 12, 2, 2);
        r(body, 0, 15, 6, 3);
      } else if (shape === 'forest') {
        for (const x of [18, 26]) {
          r(trim, x, 0, 2, 13);
          r(trim, x - 4, 2, 5, 2);
          r(trim, x, 6, 5, 2);
        }
      } else {
        r(trim, 20, 5, 4, 6);
        r(trim, 28, 5, 4, 6);
        if (shape === 'mountain') {
          r(trim, 7, 18, 14, 8);
        }
      }
      break;
    case 'wisp':
      r(body, 8, 9 + step, 18, 16);
      r(trim, 12, 4 + step, 10, 23);
      r(eyes, 18, 12 + step, 4, 5);
      r(trim, 9, 29 - step, 3, 3);
      break;
    default:
      r(body, 8, 14, 18, 16);
      r(trim, 9, 6, 16, 10);
      r('#272932', 12, 10, 12, 4);
      r(eyes, 20, 11, 2, 2);
      r(body, 9, 28, 5, 5 - step);
      r(body, 21, 28, 5, 3 + step);
      if (shape === 'skeleton') {
        r('#252936', 12, 19, 9, 2);
        r('#252936', 12, 24, 9, 2);
        r(trim, 28, 8, 2, 22);
        r(trim, 26, 8, 5, 2);
      } else if (['mage', 'oracle', 'cultist', 'imp'].includes(shape)) {
        r(body, 12, 1, 10, 9);
        r(trim, 28, 9, 2, 23);
        r(eyes, 26, 6, 6, 5);
        r(body, 5, 28, 24, 4);
      } else {
        r(trim, 1, 16, 7, 12);
        r('#e0d4bc', 29, 5, 2, 20);
        if (shape === 'executioner') {
          r(trim, 24, 4, 8, 9);
        }
        if (shape === 'golem') {
          r(trim, 3, 9, 8, 21);
        }
      }
      if (shape === 'castle') {
        r('#eac36e', 8, 2, 18, 4);
        for (const x of [8, 15, 23]) {
          r('#eac36e', x, 0, 3, 5);
        }
        r('#88394c', 8, 16, 5, 16);
      }
  }
  c.restore();
}
