import Phaser from 'phaser';
import { ENEMY_THEMES, type MapId, type EnemyRole } from '@openrpg/shared';
import { canvas, rect } from './pixel-canvas';

export function enemyCanvas(mapId: MapId, role: EnemyRole, direction: number, frame: number): HTMLCanvasElement {
  return canvas(32, 36, c => {
    const theme = ENEMY_THEMES[mapId], boss = role === 'boss', bob = frame === 1 ? -1 : 0;
    const draw = (color: string, x: number, y: number, w: number, h: number) => rect(c, color, x, y + bob, w, h);
    rect(c, '#20252a', 7, 31, 20, 4);
    draw('#30313c', 9, 28 + (frame === 1 ? 1 : 0), 5, 5); draw('#30313c', 20, 28 + (frame === 2 ? 1 : 0), 5, 5);
    draw('#242c33', 6, 13, 21, 17); draw(theme.body, 7, 14, 19, 15); draw(theme.trim, 8, 15, 3, 11);
    draw('#242c33', 8, 4, 17, 13); draw(theme.body, 9, 4, 15, 11); draw(theme.trim, 10, 4, 12, 2);
    if (direction !== 3) {
      const x = direction === 2 ? 9 : direction === 0 ? 15 : 12;
      draw('#262530', x, 9, 9, 5); draw(theme.eyes, x + 1, 10, 2, 2); draw(theme.eyes, x + 6, 10, 2, 2);
    }
    if (role === 'ranged') {
      draw(theme.trim, 28, 11, 2, 22); draw(theme.body, 26, 7, 6, 6); draw(theme.eyes, 28, 8, 2, 3);
      draw(theme.body, 12, 0, 8, 5); draw(theme.trim, 14, 0, 4, 2);
    } else {
      draw(theme.trim, 28, 10, 2, 17); draw('#e1d9be', 27, 8, 4, 12); draw(theme.body, 2, 18, 7, 9);
    }
    if (mapId === 'forest') { // Branches and bark, larger on the ancient guardian.
      draw('#9d8054', 4, 3, 3, 10); draw('#9d8054', 24, 0, 3, 11); draw(theme.trim, 1, 2, 7, 3);
      draw('#453f33', 14, 18, 2, 9); if (boss) { draw(theme.trim, 1, 10, 8, 6); draw(theme.trim, 23, 12, 8, 6); }
    } else if (mapId === 'castle') {
      draw('#c1c1ba', 9, 5, 15, 4); draw('#373743', 12, 9, 10, 2); draw(theme.trim, 15, 16, 3, 11);
      if (boss) { draw('#dfbc72', 8, 2, 18, 4); for (const x of [8, 15, 23]) draw('#dfbc72', x, 0, 3, 5); }
    } else if (mapId === 'paradise') {
      draw('#f8ecd0', 1, 9, 6, 15); draw('#f8ecd0', 26, 9, 5, 15); draw(theme.trim, 10, 0, 13, 2);
      if (boss) { draw('#fff9e5', 0, 4, 4, 16); draw('#fff9e5', 29, 4, 3, 16); }
    } else if (mapId === 'hell') {
      draw('#e8c592', 6, 0, 4, 10); draw('#e8c592', 24, 0, 4, 10); draw('#efb36b', 14, 18, 5, 5);
      if (boss) { draw('#74382f', 0, 10, 7, 17); draw('#74382f', 26, 10, 6, 17); }
    } else {
      draw('#e2eff0', 5, 13, 23, 4); draw('#cadfe5', 8, 3, 18, 4); draw('#436276', 14, 18, 8, 5);
      if (boss) { draw('#bcf4f5', 3, 2, 4, 12); draw('#bcf4f5', 27, 0, 4, 14); }
    }
  });
}
export function createEnemyTextures(scene: Phaser.Scene, mapId: MapId): void {
  for (const role of ['melee', 'ranged', 'boss'] as const) for (let direction = 0; direction < 4; direction++) {
    const key = `enemy-${role}-${direction}`;
    const frames = [0, 1, 2].map(frame => { const name = `${key}-${frame}`; scene.textures.addCanvas(name, enemyCanvas(mapId, role, direction, frame)); return { key: name }; });
    scene.anims.create({ key, frames, frameRate: role === 'boss' ? 5 : 8, repeat: -1 });
  }
}
