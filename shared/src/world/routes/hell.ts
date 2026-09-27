import { guard, rect, surround, wall, type Route } from './layout.js';

// Separate basalt islands connected by exposed, right-angle bridges over lava.
const floors = [
  rect(100, 640, 600, 300),
  rect(700, 740, 300, 130),
  rect(1000, 540, 400, 380),
  rect(1160, 320, 130, 220),
  rect(1040, 100, 650, 220),
  rect(1690, 140, 260, 130),
  rect(1950, 100, 370, 400),
  rect(2100, 500, 130, 240),
  rect(1940, 740, 600, 200),
  rect(2540, 780, 200, 130),
  rect(2740, 220, 600, 720),
];
export const hell: Route = {
  obstacles: [
    wall(1070, 770, 65, 65),
    ...surround('lava', floors),
    wall(1430, 140, 60, 60),
    wall(2200, 220, 55, 65),
    wall(2920, 730, 70, 60),
  ],
  paths: floors,
  enemies: [
    guard(830, 800, 'ranged'),
    guard(1240, 720),
    guard(1220, 410),
    guard(1580, 210, 'ranged'),
    guard(1810, 200),
    guard(2050, 290, 'ranged'),
    guard(2160, 620),
    guard(2210, 840, 'ranged'),
    guard(2590, 840),
  ],
  boss: { x: 3120, y: 530 },
  regions: [
    { x: 1190, y: 630, name: 'CINDER ISLE' },
    { x: 2070, y: 180, name: 'FURNACE CROSSING' },
    { x: 2330, y: 800, name: 'LAST EMBER BRIDGE' },
  ],
};
