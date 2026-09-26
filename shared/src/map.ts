export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface Obstacle extends Rect { kind: 'tree' | 'stone' }
export const WORLD = { width: 1440, height: 1080, border: 32 } as const;
export const SPAWNS: readonly Point[] = [{ x: 250, y: 790 }, { x: 290, y: 830 }, { x: 210, y: 830 }];
export const MOB_SPAWNS: readonly Point[] = [{ x: 650, y: 710 }, { x: 1010, y: 750 }, { x: 1040, y: 330 }, { x: 560, y: 340 }];
export const PATHS: readonly Rect[] = [
  { x: 170, y: 760, width: 980, height: 100 },
  { x: 650, y: 250, width: 100, height: 610 },
  { x: 480, y: 290, width: 640, height: 95 },
  { x: 1040, y: 300, width: 90, height: 550 },
];
const stone = (x: number, y: number, width: number, height: number): Obstacle => ({ x, y, width, height, kind: 'stone' });
const tree = (x: number, y: number): Obstacle => ({ x, y, width: 30, height: 30, kind: 'tree' });
export const OBSTACLES: readonly Obstacle[] = [
  stone(470, 470, 150, 28), stone(470, 470, 28, 155), stone(810, 470, 175, 28),
  stone(957, 470, 28, 155), stone(570, 590, 50, 40), stone(810, 610, 45, 40),
  stone(800, 210, 28, 85), stone(850, 900, 150, 28), stone(380, 220, 30, 110),
  tree(150, 210), tree(230, 300), tree(170, 420), tree(300, 560), tree(340, 690),
  tree(170, 660), tree(400, 940), tree(590, 925), tree(1130, 950), tree(1260, 770),
  tree(1200, 550), tree(1260, 370), tree(1140, 160), tree(950, 130), tree(600, 160),
  tree(820, 370), tree(790, 780), tree(1160, 660), tree(370, 430), tree(1040, 560),
];
