import type Phaser from 'phaser';
import { VILLAGE, VILLAGE_BUILDINGS, VILLAGE_STATIONS } from '@openrpg/shared';
import { canvas, rect } from '../art/pixel-canvas';
import { worldText } from '../art/world-text';

/** Paint static scenery once; only portal light and characters animate each frame. */
export function drawVillage(scene: Phaser.Scene): void {
  const terrain = canvas(VILLAGE.width, VILLAGE.height, (c) => {
    rect(c, '#304b39', 0, 0, VILLAGE.width, VILLAGE.height);
    for (let y = 0; y < 900; y += 12) {
      for (let x = 0; x < 1280; x += 12) {
        const seed = (x * 13 + y * 29) % 97;
        if (seed < 32) {
          rect(c, seed < 10 ? '#496246' : '#3b563e', x, y, 3, 3);
        }
      }
    }
    const road = (x: number, y: number, width: number, height: number): void => {
      rect(c, '#756f51', x, y, width, height);
      for (let py = y + 4; py < y + height; py += 16) {
        for (let px = x + 4; px < x + width; px += 22) {
          rect(c, '#827b5b', px + (py % 3), py, 15, 9);
        }
      }
    };
    road(265, 390, 750, 75);
    road(590, 220, 100, 600);
    road(445, 205, 390, 70);
    road(265, 665, 750, 75);
    road(260, 405, 75, 285);
    road(945, 405, 75, 285);
    road(535, 410, 210, 150);
    // A stone well is the central landmark, with a matching shared collision footprint.
    rect(c, '#253b33', 594, 450, 92, 78);
    rect(c, '#a5a38b', 602, 452, 76, 66);
    rect(c, '#566b65', 610, 460, 60, 46);
    rect(c, '#314f58', 618, 468, 44, 30);
    rect(c, '#769794', 624, 474, 26, 4);
    for (const building of VILLAGE_BUILDINGS) {
      const x = building.x + 14,
        y = building.y + 55,
        roof = { shop: '#795441', wardrobe: '#5b5376', account: '#615345' }[building.station],
        banner = VILLAGE_STATIONS.find((station) => station.id === building.station)!.color;
      rect(c, '#1d3029', x - 6, y + 12, 216, 112);
      rect(c, '#b0a184', x, y, 200, 110);
      for (const dx of [0, 94, 190]) {
        rect(c, '#584c38', x + dx, y, 10, 110);
      }
      rect(c, '#514432', x + 79, y + 50, 42, 60);
      rect(c, '#293b31', x + 87, y + 59, 25, 51);
      for (const dx of [22, 144]) {
        rect(c, '#584c38', x + dx, y + 45, 32, 32);
        rect(c, '#e7bd70', x + dx + 5, y + 50, 22, 20);
      }
      for (let row = 0; row < 8; row++) {
        rect(c, roof, building.x + row * 2, building.y + row * 10, building.width - row * 4, 12);
        rect(
          c,
          '#302f2a',
          building.x + row * 2,
          building.y + row * 10,
          building.width - row * 4,
          2,
        );
      }
      rect(c, banner, x + 20, y + 80, 22, 30);
      rect(c, '#ded3a2', x + 28, y + 85, 6, 20);
    }
    for (let x = 50; x < 1250; x += 55) {
      for (const y of [45, 850]) {
        tree(c, x, y);
      }
    }
    for (let y = 110; y < 820; y += 55) {
      for (const x of [40, 1240]) {
        tree(c, x, y);
      }
    }
    for (const [x, y] of [
      [130, 465],
      [1140, 510],
      [455, 590],
      [810, 580],
      [450, 800],
      [800, 805],
    ]) {
      rect(c, '#445b3d', x!, y!, 40, 22);
      for (let i = 0; i < 5; i++) {
        rect(c, i % 2 ? '#ba9abd' : '#d4c58a', x! + i * 7, y! + (i % 2) * 9, 4, 4);
      }
    }
  });
  scene.textures.addCanvas('village-ground', terrain);
  scene.add.image(0, 0, 'village-ground').setOrigin(0).setDepth(-10);
  for (const station of VILLAGE_STATIONS) {
    const portal = ['testing', 'story', 'fight'].includes(station.id);
    if (portal) {
      const glow = scene.add.ellipse(
        station.x,
        station.y - 35,
        64,
        88,
        Number(station.color.replace('#', '0x')),
        0.35,
      );
      glow.setStrokeStyle(4, Number(station.color.replace('#', '0x')), 0.8);
      scene.tweens.add({
        targets: glow,
        alpha: 0.5,
        scaleX: 0.9,
        duration: 1700,
        yoyo: true,
        repeat: -1,
      });
      const stones = scene.add.graphics();
      stones
        .fillStyle(0x888573)
        .fillRect(station.x - 47, station.y - 76, 15, 85)
        .fillRect(station.x + 32, station.y - 76, 15, 85)
        .fillRect(station.x - 35, station.y - 92, 70, 17);
      stones.lineStyle(2, 0xd0ba82).strokeRect(station.x - 35, station.y - 92, 70, 17);
    }
    worldText(scene, station.x, station.y + 28, station.name, {
      fontFamily: 'Georgia',
      fontSize: '19px',
      color: station.color,
      stroke: '#172920',
      strokeThickness: 3,
    }).setOrigin(0.5);
    worldText(scene, station.x, station.y + 53, station.hint, {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#e0dcc4',
      stroke: '#172920',
      strokeThickness: 2,
    }).setOrigin(0.5);
  }
}
function tree(c: CanvasRenderingContext2D, x: number, y: number): void {
  rect(c, '#514833', x - 5, y, 10, 26);
  rect(c, '#1b362b', x - 28, y - 35, 56, 45);
  rect(c, '#294832', x - 22, y - 46, 44, 47);
  rect(c, '#38583a', x - 14, y - 48, 24, 20);
}
