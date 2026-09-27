import { guard, rect, surround, wall, type Route } from './layout.js';

// Enclosed courtyards with offset doorways: south gate → north hall → south throne entry.
const floors = [
  rect(100, 640, 650, 300),
  rect(750, 700, 150, 180),
  rect(900, 180, 600, 700),
  rect(1500, 240, 200, 140),
  rect(1700, 160, 650, 680),
  rect(2350, 650, 220, 140),
  rect(2570, 140, 780, 740),
];
export const castle: Route = {
  obstacles: [
    wall(1150, 430, 130, 200),
    ...surround('stone', floors),
    wall(1930, 340, 60, 60),
    wall(2140, 340, 60, 60),
    wall(2780, 240, 55, 55),
    wall(2780, 720, 55, 55),
  ],
  paths: floors,
  enemies: [
    guard(800, 780, 'ranged'),
    guard(1040, 500),
    guard(1370, 300, 'ranged'),
    guard(1840, 310),
    guard(2200, 600, 'ranged'),
    guard(2480, 720),
  ],
  boss: { x: 3060, y: 410 },
  regions: [
    { x: 500, y: 710, name: 'SOUTH GATE' },
    { x: 1200, y: 270, name: 'BANNER HALL' },
    { x: 2020, y: 740, name: 'INNER COURT' },
  ],
};
