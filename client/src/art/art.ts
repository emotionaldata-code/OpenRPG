import type Phaser from 'phaser';
import { PROJECTILES, type CharacterClass } from '@openrpg/shared';
import { canvas, rect } from './pixel-canvas';
export { paintPreview } from './world-art';
export function actorCanvas(
  kind: CharacterClass,
  direction: number,
  frame: number,
): HTMLCanvasElement {
  return canvas(24, 28, (c) => {
    const robe = kind === 'archer' ? '#587f64' : kind === 'warrior' ? '#7b8993' : '#466eaa';
    const light = kind === 'archer' ? '#8fac79' : kind === 'warrior' ? '#c3cbd1' : '#9bbef0';
    const bob = frame === 1 ? -1 : 0;
    rect(c, '#162b27', 5, 24, 15, 3);
    rect(c, '#292e2b', 7, 22 + (frame === 1 ? 1 : 0), 4, 4);
    rect(c, '#292e2b', 14, 22 + (frame === 2 ? 1 : 0), 4, 4);
    rect(c, '#203b33', 5, 10 + bob, 15, 13);
    rect(c, robe, 6, 10 + bob, 13, 12);
    rect(c, light, 7, 12 + bob, 3, 9);
    rect(c, '#554b37', 6, 19 + bob, 13, 2);
    rect(c, '#203b33', 5, 2 + bob, 15, 12);
    rect(c, robe, 6, 1 + bob, 13, 10);
    rect(c, light, 8, 1 + bob, 8, 2);
    if (direction !== 3) {
      const x = direction === 2 ? 6 : direction === 0 ? 12 : 9;
      rect(c, '#253630', x, 6 + bob, 7, 6);
      rect(c, kind === 'archer' ? '#d6b58b' : '#d4d4aa', x + 1, 8 + bob, 5, 3);
      rect(c, '#172921', x + (direction === 2 ? 1 : 4), 8 + bob, 1, 1);
    } else {
      rect(c, light, 9, 4 + bob, 2, 5);
    }
    if (kind === 'archer') {
      rect(c, '#ba935d', 20, 11 + bob, 2, 11);
      rect(c, '#ba935d', 18, 9 + bob, 2, 3);
      rect(c, '#ba935d', 18, 21 + bob, 2, 3);
      rect(c, '#e4d6ac', 18, 12 + bob, 1, 9);
    } else if (kind === 'warrior') {
      rect(c, '#dbe1d5', 21, 5 + bob, 2, 15);
      rect(c, '#c6aa66', 19, 18 + bob, 5, 2);
      rect(c, '#725b45', 21, 20 + bob, 2, 5);
      rect(c, '#4c6073', 3, 13 + bob, 7, 9);
      rect(c, '#d4bc7e', 5, 14 + bob, 3, 7);
      rect(c, '#b8c4c9', 6, 3 + bob, 13, 4);
      rect(c, '#775e48', 10, 0 + bob, 5, 3);
    } else {
      if (kind === 'mage') {
        rect(c, light, 8, 0 + bob, 8, 3);
        rect(c, '#d8d7a9', 12, 14 + bob, 2, 3);
      }
      rect(c, '#947450', 21, 9 + bob, 2, 17);
      rect(c, '#bc9fde', 19, 6 + bob, 5, 5);
      rect(c, '#f1dbff', 20, 7 + bob, 2, 2);
    }
  });
}
// Build original textures once per scene; gameplay reuses the texture/animation cache.
export function createTextures(scene: Phaser.Scene): void {
  for (const kind of ['archer', 'mage', 'warrior'] as const) {
    for (let direction = 0; direction < 4; direction++) {
      const keys = [0, 1, 2].map((frame) => {
        const key = `${kind}-${direction}-${frame}`;
        scene.textures.addCanvas(key, actorCanvas(kind, direction, frame));
        return { key };
      });
      scene.anims.create({ key: `${kind}-${direction}`, frames: keys, frameRate: 8, repeat: -1 });
    }
  }
  scene.textures.addCanvas(
    'arrow',
    canvas(16, 6, (c) => {
      rect(c, '#9d7448', 1, 2, 12, 2);
      rect(c, '#ecdfb0', 11, 1, 3, 4);
      rect(c, '#f8edcb', 14, 2, 2, 2);
      rect(c, '#8eae83', 0, 0, 4, 2);
      rect(c, '#8eae83', 0, 4, 4, 2);
    }),
  );
  for (const kind of ['fireball', 'inferno'] as const) {
    const radius = PROJECTILES[kind].radius;
    scene.textures.addCanvas(
      kind,
      canvas(radius * 2 + 12, radius * 2 + 4, (c) => {
        const x = radius + 6,
          y = radius + 2;
        rect(c, '#a73c23', 0, y - 2, x, 4);
        rect(c, '#e46b28', 3, y - radius / 2, x, radius);
        for (let py = -radius; py <= radius; py++) {
          for (let px = -radius; px <= radius; px++) {
            const distance = Math.hypot(px, py) / radius;
            if (distance > 1) {
              continue;
            }
            const core = Math.hypot(px - radius * 0.2, py) / radius;
            const color =
              core < 0.35
                ? '#fff7cd'
                : core < 0.6
                  ? '#ffe49a'
                  : distance < 0.83
                    ? '#f1a43e'
                    : '#d95824';
            rect(c, color, x + px, y + py, 1, 1);
          }
        }
      }),
    );
  }
  scene.textures.addCanvas(
    'bolt',
    canvas(12, 10, (c) => {
      rect(c, '#74558e', 0, 3, 10, 4);
      rect(c, '#b69be0', 3, 1, 7, 8);
      rect(c, '#ece5fb', 7, 3, 5, 4);
    }),
  );
}
