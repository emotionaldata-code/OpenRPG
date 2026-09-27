import { banks, guard, road, tree, wall, type Route } from './layout.js';
export const forest: Route = {
  obstacles: [
    ...banks('water', [
      [0, 1050, 430, 944],
      [1050, 650, 260, 800],
      [1700, 650, 120, 650],
      [2350, 1106, 180, 880],
    ]),
    wall(470, 470, 150, 28),
    wall(470, 470, 28, 155),
    wall(957, 470, 28, 155),
    tree(780, 870),
    tree(1280, 300),
    wall(1290, 440, 100, 160, 'water'),
    tree(1560, 710),
    tree(1920, 160),
    tree(2170, 570),
    wall(2680, 690, 60, 50),
    tree(3230, 760),
  ],
  paths: [
    ...road([
      { x: 250, y: 790 },
      { x: 1120, y: 710 },
      { x: 1450, y: 460 },
      { x: 2000, y: 390 },
      { x: 2480, y: 480 },
      { x: 3080, y: 480 },
    ]),
    ...road([
      { x: 1180, y: 710 },
      { x: 1180, y: 360 },
      { x: 1480, y: 360 },
      { x: 1480, y: 460 },
    ]),
  ],
  enemies: [
    guard(650, 710, 'ranged'),
    guard(1010, 750),
    guard(1500, 450),
    guard(2130, 400, 'ranged'),
  ],
  boss: { x: 3080, y: 480 },
  regions: [
    { x: 800, y: 670, name: 'BRIAR TRAIL' },
    { x: 1500, y: 390, name: 'MOONWATER BEND' },
    { x: 2260, y: 300, name: 'ELDERROOT APPROACH' },
  ],
};
