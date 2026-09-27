import { guard, rect, surround, wall, type Route } from './layout.js';

// A true switchback: east along the low ledge, west up the ridge, then east to the summit.
const floors = [
  rect(100, 650, 500, 290),
  rect(600, 730, 1760, 160),
  rect(2200, 500, 160, 390),
  rect(1000, 500, 1360, 150),
  rect(1000, 200, 160, 450),
  rect(1000, 200, 1650, 150),
  rect(2650, 100, 700, 750),
];
export const mountain: Route = {
  obstacles: [
    wall(380, 680, 65, 65),
    ...surround('chasm', floors),
    wall(2790, 180, 70, 70),
    wall(3240, 640, 55, 55),
  ],
  paths: floors,
  enemies: [
    guard(680, 820, 'ranged'),
    guard(1020, 810),
    guard(1470, 810),
    guard(1980, 810, 'ranged'),
    guard(2270, 690),
    guard(1920, 570, 'ranged'),
    guard(1510, 570),
    guard(1090, 550, 'ranged'),
    guard(1320, 270),
    guard(1940, 270, 'ranged'),
    guard(2480, 270),
  ],
  boss: { x: 3110, y: 570 },
  regions: [
    { x: 1500, y: 810, name: 'LOWER LEDGE' },
    { x: 1680, y: 570, name: 'WHITEOUT TRAVERSE' },
    { x: 1960, y: 265, name: 'SUMMIT RIDGE' },
  ],
};
