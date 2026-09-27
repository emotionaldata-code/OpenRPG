import { guard, rect, road, surround, tree, wall, type Route } from './layout.js';

// Two garden loops offer flanking routes around reflecting pools, joined by a single bridge.
const floors = [
  rect(100, 560, 700, 380),
  rect(700, 160, 1050, 720),
  rect(1750, 460, 300, 150),
  rect(2050, 200, 600, 650),
  rect(2650, 100, 700, 820),
];
export const paradise: Route = {
  obstacles: [
    wall(760, 650, 46, 46),
    ...surround('water', floors),
    wall(1000, 360, 440, 320, 'water'),
    wall(2250, 380, 190, 290, 'water'),
    tree(900, 220),
    tree(1590, 760),
    tree(2600, 240),
    wall(2860, 690, 46, 46),
  ],
  paths: [
    ...road([
      { x: 250, y: 790 },
      { x: 880, y: 790 },
      { x: 880, y: 270 },
      { x: 1560, y: 270 },
      { x: 1560, y: 535 },
      { x: 2140, y: 535 },
    ]),
    ...road([
      { x: 880, y: 790 },
      { x: 1560, y: 790 },
      { x: 1560, y: 535 },
    ]),
    ...road([
      { x: 2140, y: 535 },
      { x: 2140, y: 290 },
      { x: 2540, y: 290 },
      { x: 2540, y: 750 },
      { x: 2140, y: 750 },
      { x: 2140, y: 535 },
    ]),
    ...road([
      { x: 2540, y: 350 },
      { x: 3110, y: 350 },
    ]),
  ],
  enemies: [
    guard(650, 780, 'ranged'),
    guard(870, 460),
    guard(1240, 260, 'ranged'),
    guard(1540, 730),
    guard(1880, 535, 'ranged'),
    guard(2140, 300),
    guard(2540, 750, 'ranged'),
  ],
  boss: { x: 3110, y: 350 },
  regions: [
    { x: 1210, y: 210, name: 'MIRROR GARDEN' },
    { x: 1880, y: 490, name: 'SUN BRIDGE' },
    { x: 2360, y: 280, name: 'PETAL CLOISTER' },
  ],
};
