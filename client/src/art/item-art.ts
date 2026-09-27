import { canvas, rect } from './pixel-canvas';
import { item } from '@openrpg/shared';
const ink = '#172723',
  gold = '#d9b46a',
  shine = '#fff0b5';
/** Original pixel art shared by inventory cards, shop shelves and ground pickups. */
export function itemCanvas(id: string): HTMLCanvasElement {
  return canvas(32, 32, (c) => {
    if (id === 'potion') {
      rect(c, ink, 10, 3, 12, 8);
      rect(c, '#8b603a', 12, 2, 8, 4);
      rect(c, gold, 12, 5, 8, 2);
      rect(c, '#8daeb0', 11, 8, 10, 5);
      rect(c, ink, 7, 12, 18, 16);
      rect(c, '#99c3ba', 9, 12, 14, 15);
      rect(c, '#8e303c', 10, 17, 12, 9);
      rect(c, '#de5860', 11, 16, 10, 7);
      rect(c, '#ff9791', 11, 16, 3, 5);
      rect(c, '#e4f4d7', 10, 12, 2, 4);
      rect(c, gold, 13, 20, 6, 2);
      rect(c, gold, 15, 18, 2, 6);
    } else if (id === 'coins') {
      for (const [x, y] of [
        [4, 19],
        [16, 16],
        [9, 9],
      ]) {
        rect(c, ink, x!, y!, 11, 10);
        rect(c, '#997137', x! + 1, y! + 1, 9, 8);
        rect(c, gold, x! + 1, y! + 1, 9, 6);
        rect(c, shine, x! + 2, y! + 1, 6, 2);
        rect(c, '#af813c', x! + 5, y! + 3, 2, 3);
      }
    } else if (item(id)?.slot === 'armor') {
      const mage = id === 'ember-robe',
        warrior = id === 'iron-armor';
      const dark = warrior ? '#596d78' : mage ? '#743e66' : '#31584a';
      const light = warrior ? '#b7d1cc' : mage ? '#bb6887' : '#73a77b';
      rect(c, ink, 8, 7, 16, 21);
      rect(c, ink, 3, 8, 26, 10);
      rect(c, dark, 5, 9, 22, 7);
      rect(c, dark, 9, 8, 14, 18);
      rect(c, light, 10, 9, 5, 14);
      rect(c, light, 5, 9, 4, 5);
      rect(c, light, 23, 9, 4, 5);
      rect(c, ink, 12, 6, 8, 4);
      rect(c, gold, 11, 9, 2, 7);
      rect(c, gold, 19, 9, 2, 7);
      rect(c, gold, 9, 22, 14, 2);
      rect(c, shine, 15, 21, 3, 4);
      if (mage) {
        rect(c, dark, 7, 25, 18, 4);
        rect(c, gold, 7, 28, 18, 1);
      }
      if (warrior) {
        rect(c, '#e8eee1', 11, 11, 3, 6);
        rect(c, gold, 16, 13, 3, 5);
      }
    } else if (id === 'oak-bow') {
      rect(c, ink, 9, 2, 5, 4);
      rect(c, gold, 12, 4, 4, 4);
      rect(c, '#b77c42', 15, 7, 4, 5);
      rect(c, '#e0b976', 18, 11, 3, 10);
      rect(c, '#b77c42', 15, 21, 4, 5);
      rect(c, gold, 12, 25, 4, 4);
      rect(c, '#e5dfbf', 11, 5, 1, 22);
      rect(c, '#678c69', 16, 13, 5, 5);
      rect(c, '#a17b50', 4, 15, 24, 1);
      rect(c, shine, 25, 13, 3, 5);
      rect(c, '#83bba1', 4, 13, 4, 5);
    } else if (id === 'ember-rod') {
      rect(c, ink, 14, 11, 5, 19);
      rect(c, '#996341', 15, 10, 3, 19);
      rect(c, gold, 15, 18, 3, 3);
      rect(c, '#59342e', 9, 5, 15, 9);
      rect(c, gold, 10, 6, 13, 7);
      rect(c, '#bf4b36', 12, 4, 9, 10);
      rect(c, '#f18c42', 14, 2, 5, 11);
      rect(c, shine, 15, 5, 3, 5);
    } else if (id === 'iron-sword') {
      rect(c, ink, 13, 2, 7, 21);
      rect(c, '#7d9eaa', 14, 3, 5, 19);
      rect(c, '#e1ece2', 14, 3, 2, 18);
      rect(c, gold, 8, 21, 17, 3);
      rect(c, shine, 9, 20, 3, 2);
      rect(c, shine, 21, 20, 3, 2);
      rect(c, '#784b38', 14, 24, 5, 5);
      rect(c, gold, 13, 29, 7, 2);
    }
  });
}
const urls = new Map<string, string>();
export function itemIcon(id: string): HTMLImageElement {
  if (!urls.has(id)) {
    urls.set(id, itemCanvas(id).toDataURL());
  }
  const image = document.createElement('img');
  image.src = urls.get(id)!;
  image.width = 64;
  image.height = 64;
  image.alt = '';
  image.className = 'item-icon';
  return image;
}
/** Transparent clothing/equipment layer; never edits the default or custom skin pixels. */
export function equipmentCanvas(id: string, direction: number, frame: number): HTMLCanvasElement {
  return canvas(24, 28, (c) => {
    const bob = frame === 1 ? -1 : 0;
    c.translate(0, bob);
    if (item(id)?.slot === 'armor') {
      const warrior = id === 'iron-armor',
        mage = id === 'ember-robe';
      const base = warrior ? '#829eaa' : mage ? '#8c4569' : '#386b50';
      const light = warrior ? '#d0e3dc' : mage ? '#d483a0' : '#98be7a';
      rect(c, ink, 5, 12, 15, 11);
      rect(c, base, 6, 12, 13, 10);
      rect(c, light, direction === 2 ? 14 : 7, 12, 3, 8);
      rect(c, gold, 6, 20, 13, 2);
      rect(c, shine, 11, 19, 3, 3);
      if (direction !== 3) {
        rect(c, gold, 10, 12, 1, 5);
        rect(c, gold, 14, 12, 1, 5);
      } else {
        rect(c, gold, 11, 13, 3, 5);
      }
      if (warrior) {
        rect(c, gold, 4, 11, 5, 4);
        rect(c, light, 5, 11, 3, 2);
        rect(c, gold, 17, 11, 4, 4);
      }
      if (mage) {
        rect(c, base, 6, 22, 13, 2);
        rect(c, gold, 6, 23, 13, 1);
      }
    } else if (id === 'oak-bow') {
      rect(c, '#58492f', 19, 10, 4, 13);
      rect(c, gold, 20, 11, 2, 11);
      rect(c, gold, 18, 9, 3, 3);
      rect(c, gold, 18, 21, 3, 3);
      rect(c, shine, 18, 12, 1, 9);
      rect(c, '#a2dab2', 20, 15, 3, 3);
    } else if (id === 'ember-rod') {
      rect(c, '#61382e', 20, 9, 4, 17);
      rect(c, gold, 21, 9, 2, 17);
      rect(c, '#c74f33', 18, 5, 6, 7);
      rect(c, '#ffa854', 19, 4, 4, 6);
      rect(c, shine, 20, 6, 2, 3);
    } else if (id === 'iron-sword') {
      rect(c, '#557386', 20, 3, 4, 17);
      rect(c, '#e7f7df', 21, 4, 2, 15);
      rect(c, gold, 18, 18, 6, 3);
      rect(c, '#774a34', 21, 21, 2, 4);
      rect(c, gold, 20, 25, 4, 2);
    }
  });
}
