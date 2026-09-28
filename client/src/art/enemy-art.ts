import type Phaser from 'phaser';
import {
  ENEMY_THEMES,
  BESTIARY,
  biomeOf,
  speciesFor,
  type MapId,
  type EnemyRole,
} from '@openrpg/shared';
import { canvas } from './pixel-canvas';
import { paintCreature } from './creature-art';

export function enemyCanvas(
  mapId: MapId,
  role: EnemyRole,
  direction: number,
  frame: number,
  species = '',
): HTMLCanvasElement {
  const biome = biomeOf(mapId),
    theme = ENEMY_THEMES[mapId];
  return canvas(32, 36, (c) =>
    paintCreature(
      c,
      role === 'boss'
        ? biome
        : (speciesFor(species, mapId)?.shape ?? (role === 'melee' ? 'knight' : 'mage')),
      theme.body,
      theme.trim,
      theme.eyes,
      frame,
      direction,
    ),
  );
}

export function createEnemyTextures(scene: Phaser.Scene, mapId: MapId): void {
  const creatures = [
    'melee',
    'ranged',
    'boss',
    ...BESTIARY[biomeOf(mapId)].map((_, i) => `${biomeOf(mapId)}-${i + 1}`),
  ];
  for (const species of creatures) {
    const role: EnemyRole = species === 'boss' ? 'boss' : species === 'melee' ? 'melee' : 'ranged';
    for (let direction = 0; direction < 4; direction++) {
      const key = `enemy-${species}-${direction}`;
      const frames = [0, 1, 2].map((frame) => {
        const name = `${key}-${frame}`;
        scene.textures.addCanvas(name, enemyCanvas(mapId, role, direction, frame, species));
        return { key: name };
      });
      scene.anims.create({ key, frames, frameRate: role === 'boss' ? 5 : 8, repeat: -1 });
    }
  }
}
