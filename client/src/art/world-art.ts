import type Phaser from 'phaser';
import { WORLD, MAPS, ENEMY_AI, type GameMap } from '@openrpg/shared';
import { canvas, rect } from './pixel-canvas';
import { paintBiomeDetails } from './biome-details';
import { paintLandmark } from './landmark-art';
import { worldText } from './world-text';

export function terrainCanvas(map: GameMap = MAPS.forest): HTMLCanvasElement {
  return canvas(WORLD.width / 2, WORLD.height / 2, (c) => {
    const p = map.palette,
      width = WORLD.width / 2,
      height = WORLD.height / 2;
    let seed = [...map.id].reduce((n, c) => n * 31 + c.charCodeAt(0), 741) >>> 0;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    rect(c, p.ground, 0, 0, width, height);
    for (let i = 0; i < 26000; i++) {
      rect(c, p.flecks[i % p.flecks.length]!, random() * width, random() * height, 2, 1);
    }
    for (const path of map.paths) {
      rect(c, p.edge, path.x / 2 - 3, path.y / 2 - 3, path.width / 2 + 6, path.height / 2 + 6);
      rect(c, p.path, path.x / 2, path.y / 2, path.width / 2, path.height / 2);
      for (let i = 0; i < (path.width * path.height) / 250; i++) {
        rect(
          c,
          p.ground,
          path.x / 2 + (random() * path.width) / 2,
          path.y / 2 + (random() * path.height) / 2,
          2,
          1,
        );
      }
    }
    // Unique, non-colliding set dressing is baked once into the terrain texture.
    for (let i = 0; i < 320; i++) {
      const x = 25 + random() * (width - 50),
        y = 25 + random() * (height - 50);
      if (map.biome === 'desert') {
        rect(c, p.highlight, x, y, 16, 1);
        rect(c, p.stone, x + 3, y + 3, 10, 1);
        if (i % 7 === 0) {
          rect(c, '#6e8050', x, y - 7, 3, 9);
          rect(c, '#6e8050', x - 3, y - 5, 8, 2);
        }
      } else if (map.biome === 'hell') {
        rect(c, '#dd693f', x, y, 8, 1);
        rect(c, '#933b30', x + 5, y + 1, 2, 4);
      } else if (map.biome === 'castle') {
        rect(c, p.edge, x, y, 14, 1);
        rect(c, p.edge, x, y, 1, 7);
      } else if (map.biome === 'mountain') {
        rect(c, '#dce9e9', x, y, 7, 2);
        rect(c, '#cbdcdf', x + 2, y - 1, 4, 1);
      } else {
        rect(c, p.accent, x, y, 1, 3);
        if (i % 4 === 0) {
          rect(c, map.biome === 'paradise' ? '#f9dce0' : '#d2bd77', x - 1, y - 1, 3, 2);
        }
      }
    }
    // Flat hazards use exactly the impassable geometry, baked once with the ground.
    for (const o of map.obstacles) {
      if (o.kind === 'tree' || o.kind === 'stone') {
        continue;
      }
      const x = o.x / 2,
        y = o.y / 2,
        w = o.width / 2,
        h = o.height / 2;
      rect(c, p.highlight, x - 2, y - 2, w + 4, h + 4);
      rect(
        c,
        o.kind === 'sand'
          ? '#a67b43'
          : o.kind === 'water'
            ? '#284f61'
            : o.kind === 'lava'
              ? '#ba452b'
              : '#263c54',
        x,
        y,
        w,
        h,
      );
      for (let row = 8; row < h - 4; row += 14) {
        for (let col = 6; col < w - 10; col += 24) {
          rect(
            c,
            o.kind === 'sand'
              ? '#c89b58'
              : o.kind === 'water'
                ? '#518494'
                : o.kind === 'lava'
                  ? '#ffad4f'
                  : '#405b76',
            x + col,
            y + row + (o.kind === 'sand' ? Math.sin(col / 24) * 3 : 0),
            o.kind === 'sand' ? 18 : 10,
            1,
          );
        }
      }
    }
    paintBiomeDetails(c, map);
    paintLandmark(c, map);
    const camp = map.spawns[0]!;
    c.strokeStyle = p.accent;
    c.setLineDash([3, 5]);
    c.beginPath();
    c.arc(camp.x / 2, camp.y / 2, ENEMY_AI.campRadius / 2, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    rect(c, '#34302e', camp.x / 2 - 8, camp.y / 2 + 17, 17, 6);
    rect(c, '#a9864d', camp.x / 2 - 5, camp.y / 2 + 15, 12, 3);
    rect(c, '#db9c51', camp.x / 2 - 3, camp.y / 2 + 10, 7, 7);
    rect(c, '#f2d98d', camp.x / 2 - 1, camp.y / 2 + 7, 3, 9);
    rect(c, p.edge, 0, 0, width, 16);
    rect(c, p.edge, 0, height - 16, width, 16);
    rect(c, p.edge, 0, 0, 16, height);
    rect(c, p.edge, width - 16, 0, 16, height);
  });
}
function treeCanvas(map: GameMap): HTMLCanvasElement {
  return canvas(42, 58, (c) => {
    const p = map.palette;
    rect(c, p.edge, 5, 47, 34, 7);
    rect(c, '#594936', 18, 31, 9, 22);
    rect(c, '#806344', 18, 33, 3, 19);
    if (map.biome === 'hell') {
      rect(c, '#6e4145', 19, 7, 7, 42);
      rect(c, '#9d5350', 9, 20, 15, 5);
      rect(c, '#9d5350', 28, 11, 5, 22);
      rect(c, '#ed9458', 20, 11, 2, 25);
      return;
    }
    for (const [x, y, w, h] of [
      [12, 0, 19, 12],
      [5, 9, 31, 14],
      [1, 20, 39, 15],
      [5, 32, 33, 11],
    ]) {
      rect(c, p.edge, x!, y!, w!, h!);
      rect(
        c,
        map.biome === 'paradise' ? '#e6c9d1' : map.biome === 'mountain' ? '#608893' : '#24523c',
        x! + 2,
        y!,
        w! - 5,
        h! - 3,
      );
      rect(
        c,
        map.biome === 'mountain' ? '#e1eef0' : map.biome === 'paradise' ? '#fff0dc' : '#497c52',
        x! + 4,
        y! + 1,
        w! - 11,
        3,
      );
    }
  });
}
export function drawWorld(scene: Phaser.Scene, map: GameMap, fight = false): void {
  scene.textures.addCanvas('terrain', terrainCanvas(map));
  scene.textures.addCanvas('tree', treeCanvas(map));
  scene.add.image(0, 0, 'terrain').setOrigin(0).setScale(2).setDepth(-10);
  const p = map.palette,
    color = (hex: string): number => Number.parseInt(hex.slice(1), 16);
  for (const o of map.obstacles) {
    if (o.kind === 'tree') {
      scene.add
        .image(o.x + o.width / 2, o.y + o.height / 2, 'tree')
        .setOrigin(0.5, 0.86)
        .setScale(2)
        .setDepth(o.y + o.height);
    } else if (o.kind === 'stone') {
      const g = scene.add.graphics().setDepth(o.y + o.height);
      g.fillStyle(color(p.edge)).fillRect(o.x + 6, o.y + 7, o.width, o.height);
      g.fillStyle(color(p.stone)).fillRect(o.x, o.y - 12, o.width, o.height + 12);
      g.fillStyle(color(p.highlight)).fillRect(o.x, o.y - 12, o.width, 4);
      g.lineStyle(2, color(p.edge));
      for (let x = o.x + 22; x < o.x + o.width; x += 25) {
        g.lineBetween(x, o.y - 8, x, o.y + o.height - 2);
      }
      if (map.biome === 'castle') {
        for (let x = o.x; x < o.x + o.width; x += 24) {
          g.fillStyle(color(p.highlight)).fillRect(x, o.y - 20, Math.min(12, o.x + o.width - x), 8);
        }
      }
      if (map.biome === 'hell') {
        g.lineStyle(2, 0xe58b50).lineBetween(o.x + 6, o.y, o.x + o.width / 2, o.y + o.height - 5);
      }
    }
  }
  const label = (x: number, y: number, text: string) =>
    worldText(scene, x, y, text, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: p.accent,
      stroke: p.edge,
      strokeThickness: 2,
      letterSpacing: 2,
    })
      .setOrigin(0.5)
      .setDepth(-1);
  label(
    map.spawns[0]!.x,
    map.spawns[0]!.y + 110,
    fight ? 'FIGHT · NO SAFE ZONE' : 'WAYFARER CAMP · REFUGE',
  );
  label(map.landmark.x, map.landmark.y - 155, map.name.toUpperCase());
  for (const region of map.regions) {
    label(region.x, region.y, region.name);
  }
}
export function paintPreview(
  target: HTMLCanvasElement,
  map: GameMap = MAPS.forest,
  showEnemies = true,
): void {
  target.width = 720;
  target.height = 540;
  const c = target.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.save();
  const scale = Math.min(1440 / WORLD.width, 1080 / WORLD.height);
  rect(c, map.palette.edge, 0, 0, target.width, target.height);
  c.translate(
    (target.width - (WORLD.width / 2) * scale) / 2,
    (target.height - (WORLD.height / 2) * scale) / 2,
  );
  c.scale(scale, scale);
  c.drawImage(terrainCanvas(map), 0, 0);
  const tree = treeCanvas(map);
  for (const o of map.obstacles) {
    if (o.kind === 'tree') {
      c.drawImage(tree, o.x / 2 - 14, o.y / 2 - 42);
    } else if (o.kind === 'stone') {
      rect(c, map.palette.highlight, o.x / 2, o.y / 2 - 6, o.width / 2, o.height / 2 + 6);
      rect(c, map.palette.stone, o.x / 2, (o.y + o.height) / 2 - 4, o.width / 2, 4);
    }
  }
  if (showEnemies) {
    for (const enemy of map.enemies) {
      const r = enemy.role === 'boss' ? 6 : 3;
      rect(
        c,
        enemy.role === 'boss' ? '#f3be7b' : '#d5907d',
        enemy.x / 2 - r,
        enemy.y / 2 - r,
        r * 2,
        r * 2,
      );
    }
  }
  c.restore();
}
