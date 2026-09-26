import Phaser from 'phaser';
import { WORLD, PATHS, OBSTACLES } from '@openrpg/shared';
type Paint = (ctx: CanvasRenderingContext2D) => void;
function canvas(w: number, h: number, paint: Paint): HTMLCanvasElement {
  const element = document.createElement('canvas'); element.width = w; element.height = h;
  const ctx = element.getContext('2d')!; ctx.imageSmoothingEnabled = false; paint(ctx); return element;
}
function rect(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h);
}
export function terrainCanvas(): HTMLCanvasElement {
  return canvas(WORLD.width / 2, WORLD.height / 2, (c) => {
    rect(c, '#294837', 0, 0, 720, 540);
    let seed = 741;
    const random = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 15000; i++) {
      const x = random() * 720, y = random() * 540;
      rect(c, ['#2e503b', '#35593f', '#274332', '#3c6044'][i % 4]!, x, y, 2, 1);
    }
    for (const p of PATHS) {
      rect(c, '#46523c', p.x / 2 - 6, p.y / 2 - 6, p.width / 2 + 12, p.height / 2 + 12);
      rect(c, '#706b4c', p.x / 2, p.y / 2, p.width / 2, p.height / 2);
      for (let i = 0; i < p.width * p.height / 180; i++) rect(c, i % 2 ? '#817653' : '#626447', p.x / 2 + random() * p.width / 2, p.y / 2 + random() * p.height / 2, 3, 2);
    }
    // Weathered paving at the heart of the old watchtower.
    for (let y = 250; y < 315; y += 11) for (let x = 255; x < 479; x += 16) {
      rect(c, '#52655a', x, y, 15, 10); rect(c, '#617265', x + 1, y, 14, 1);
      if (random() > .7) rect(c, '#3b5941', x + 2, y + 5, 6, 3);
    }
    // Safe camp: concentric worn stones and a warm campfire.
    c.strokeStyle = '#8a8b66'; c.lineWidth = 2; c.beginPath(); c.ellipse(125, 412, 47, 35, 0, 0, Math.PI * 2); c.stroke();
    rect(c, '#343d30', 117, 418, 17, 6); rect(c, '#a9864d', 120, 416, 12, 3);
    rect(c, '#db9c51', 122, 411, 7, 7); rect(c, '#f2d98d', 124, 408, 3, 9);
    for (let i = 0; i < 170; i++) {
      const x = 20 + random() * 680, y = 20 + random() * 500;
      rect(c, '#799467', x, y, 1, 3); if (i % 5 === 0) rect(c, '#d2bd77', x - 1, y - 1, 3, 2);
    }
    rect(c, '#142d25', 0, 0, 720, 16); rect(c, '#142d25', 0, 524, 720, 16);
    rect(c, '#142d25', 0, 0, 16, 540); rect(c, '#142d25', 704, 0, 16, 540);
  });
}
function treeCanvas(): HTMLCanvasElement {
  return canvas(42, 58, (c) => {
    rect(c, '#172e26', 5, 47, 34, 7); rect(c, '#594936', 18, 31, 9, 22); rect(c, '#806344', 18, 33, 3, 19);
    const layers = [[12, 0, 19, 12], [5, 9, 31, 14], [1, 20, 39, 15], [5, 32, 33, 11]];
    for (const [x, y, w, h] of layers) {
      rect(c, '#183c30', x!, y!, w!, h!); rect(c, '#24523c', x! + 2, y!, w! - 5, h! - 3);
      rect(c, '#37694a', x! + 4, y! + 1, w! - 11, 3); rect(c, '#497c52', x! + 5, y! + 1, 6, 1);
    }
  });
}
export function actorCanvas(kind: 'archer' | 'mage', direction: number, frame: number): HTMLCanvasElement {
  return canvas(24, 28, (c) => {
    const robe = kind === 'archer' ? '#587f64' : '#80688e';
    const light = kind === 'archer' ? '#8fac79' : '#b69abe';
    const bob = frame === 1 ? -1 : 0;
    rect(c, '#162b27', 5, 24, 15, 3);
    rect(c, '#292e2b', 7, 22 + (frame === 1 ? 1 : 0), 4, 4);
    rect(c, '#292e2b', 14, 22 + (frame === 2 ? 1 : 0), 4, 4);
    rect(c, '#203b33', 5, 10 + bob, 15, 13); rect(c, robe, 6, 10 + bob, 13, 12);
    rect(c, light, 7, 12 + bob, 3, 9); rect(c, '#554b37', 6, 19 + bob, 13, 2);
    rect(c, '#203b33', 5, 2 + bob, 15, 12); rect(c, robe, 6, 1 + bob, 13, 10);
    rect(c, light, 8, 1 + bob, 8, 2);
    if (direction !== 3) {
      const x = direction === 2 ? 6 : direction === 0 ? 12 : 9;
      rect(c, '#253630', x, 6 + bob, 7, 6); rect(c, kind === 'archer' ? '#d6b58b' : '#d4d4aa', x + 1, 8 + bob, 5, 3);
      rect(c, '#172921', x + (direction === 2 ? 1 : 4), 8 + bob, 1, 1);
    } else rect(c, light, 9, 4 + bob, 2, 5);
    if (kind === 'archer') {
      rect(c, '#ba935d', 20, 11 + bob, 2, 11); rect(c, '#ba935d', 18, 9 + bob, 2, 3); rect(c, '#ba935d', 18, 21 + bob, 2, 3);
      rect(c, '#e4d6ac', 18, 12 + bob, 1, 9);
    } else {
      rect(c, '#947450', 21, 9 + bob, 2, 17); rect(c, '#bc9fde', 19, 6 + bob, 5, 5); rect(c, '#f1dbff', 20, 7 + bob, 2, 2);
    }
  });
}
export function createTextures(scene: Phaser.Scene): void {
  scene.textures.addCanvas('terrain', terrainCanvas()); scene.textures.addCanvas('tree', treeCanvas());
  for (const kind of ['archer', 'mage'] as const) for (let direction = 0; direction < 4; direction++) {
    const keys = [0, 1, 2].map((frame) => {
      const key = `${kind}-${direction}-${frame}`; scene.textures.addCanvas(key, actorCanvas(kind, direction, frame)); return { key };
    });
    scene.anims.create({ key: `${kind}-${direction}`, frames: keys, frameRate: 8, repeat: -1 });
  }
  scene.textures.addCanvas('arrow', canvas(16, 6, (c) => {
    rect(c, '#9d7448', 1, 2, 12, 2); rect(c, '#ecdfb0', 11, 1, 3, 4); rect(c, '#f8edcb', 14, 2, 2, 2); rect(c, '#8eae83', 0, 0, 4, 2); rect(c, '#8eae83', 0, 4, 4, 2);
  }));
  scene.textures.addCanvas('bolt', canvas(12, 10, (c) => {
    rect(c, '#74558e', 0, 3, 10, 4); rect(c, '#b69be0', 3, 1, 7, 8); rect(c, '#ece5fb', 7, 3, 5, 4);
  }));
}
export function drawWorld(scene: Phaser.Scene): void {
  scene.add.image(0, 0, 'terrain').setOrigin(0).setScale(2).setDepth(-10);
  for (const o of OBSTACLES) {
    if (o.kind === 'tree') scene.add.image(o.x + o.width / 2, o.y + o.height / 2, 'tree').setOrigin(.5, .86).setScale(2).setDepth(o.y + o.height);
    else {
      const g = scene.add.graphics().setDepth(o.y + o.height);
      g.fillStyle(0x20352d).fillRect(o.x + 6, o.y + 7, o.width, o.height);
      g.fillStyle(0x68796c).fillRect(o.x, o.y - 12, o.width, o.height + 12);
      g.fillStyle(0x93a08a).fillRect(o.x, o.y - 12, o.width, 4);
      g.fillStyle(0x4a6053).fillRect(o.x, o.y + o.height - 8, o.width, 8);
      g.lineStyle(2, 0x3c5447);
      for (let x = o.x + 22; x < o.x + o.width; x += 25) g.lineBetween(x, o.y - 8, x, o.y + o.height - 2);
      g.fillStyle(0x3e6447).fillRect(o.x + 3, o.y - 12, Math.min(o.width - 6, 18), 6);
    }
  }
  scene.add.text(250, 886, 'THE WAYFARER’S CAMP', { fontFamily: 'monospace', fontSize: '11px', color: '#c6cca0', letterSpacing: 2 }).setOrigin(.5).setDepth(-1);
  scene.add.text(720, 420, 'THE OLD WATCH', { fontFamily: 'monospace', fontSize: '12px', color: '#b3bd94', letterSpacing: 4 }).setOrigin(.5).setDepth(-1);
}
export function paintPreview(target: HTMLCanvasElement): void {
  target.width = 720; target.height = 540;
  const c = target.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(terrainCanvas(), 0, 0);
  const tree = treeCanvas();
  for (const o of OBSTACLES) {
    if (o.kind === 'tree') c.drawImage(tree, o.x / 2 - 14, o.y / 2 - 42);
    else { rect(c, '#87937e', o.x / 2, o.y / 2 - 6, o.width / 2, o.height / 2 + 6); rect(c, '#52695a', o.x / 2, (o.y + o.height) / 2 - 4, o.width / 2, 4); }
  }
  c.drawImage(actorCanvas('archer', 0, 0), 126, 384);
  c.drawImage(actorCanvas('archer', 1, 1), 153, 399);
  c.drawImage(actorCanvas('mage', 2, 0), 306, 340);
  c.drawImage(actorCanvas('mage', 1, 0), 510, 160);
}
