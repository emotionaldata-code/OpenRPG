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

export const MAP_IDS = ['forest', 'castle', 'paradise', 'hell', 'mountain'] as const;
export type MapId = typeof MAP_IDS[number];
export type EnemyRole = 'melee' | 'ranged' | 'boss';
export interface EnemySpawn extends Point { role: EnemyRole }
export interface MapPalette {
  ground: string; flecks: readonly string[]; path: string; edge: string; stone: string; highlight: string; accent: string;
}
export interface GameMap {
  id: MapId; name: string; subtitle: string; description: string;
  palette: MapPalette; obstacles: readonly Obstacle[]; paths: readonly Rect[];
  spawns: readonly Point[]; enemies: readonly EnemySpawn[]; landmark: Point;
}
const camp = SPAWNS;
const enemies = (ranged: Point, melee: Point, guard: Point, boss: Point): readonly EnemySpawn[] => [
  { ...ranged, role: 'ranged' }, { ...melee, role: 'melee' }, { ...guard, role: 'melee' }, { ...boss, role: 'boss' },
];
export const MAPS: Readonly<Record<MapId, GameMap>> = {
  forest: {
    id: 'forest', name: 'The Verdant Watch', subtitle: 'Forest', description: 'Overgrown ruins, restless roots and a fallen woodland guardian.',
    palette: { ground: '#294837', flecks: ['#2e503b', '#35593f', '#274332'], path: '#706b4c', edge: '#142d25', stone: '#68796c', highlight: '#93a08a', accent: '#a9c77d' },
    obstacles: OBSTACLES, paths: PATHS, spawns: camp,
    enemies: enemies(MOB_SPAWNS[0]!, MOB_SPAWNS[1]!, MOB_SPAWNS[3]!, MOB_SPAWNS[2]!), landmark: { x: 1040, y: 330 },
  },
  castle: {
    id: 'castle', name: 'The Hollow Keep', subtitle: 'Castle', description: 'Breach the courtyards and challenge the king beneath his broken banners.',
    palette: { ground: '#353744', flecks: ['#3f424e', '#30333d', '#484952'], path: '#686373', edge: '#20212d', stone: '#777a89', highlight: '#abb0bd', accent: '#cf9c75' },
    obstacles: [stone(420, 230, 32, 340), stone(420, 650, 32, 240), stone(780, 200, 32, 380), stone(780, 690, 32, 220), stone(1050, 200, 230, 32), stone(1050, 490, 230, 32), stone(1080, 630, 55, 55), stone(580, 360, 55, 55), stone(590, 770, 55, 55)],
    paths: [{ x: 190, y: 760, width: 1020, height: 110 }, { x: 540, y: 280, width: 110, height: 580 }, { x: 1020, y: 260, width: 240, height: 200 }, { x: 870, y: 330, width: 110, height: 500 }],
    spawns: camp, enemies: enemies({ x: 660, y: 650 }, { x: 620, y: 300 }, { x: 1010, y: 760 }, { x: 1150, y: 370 }), landmark: { x: 1150, y: 370 },
  },
  paradise: {
    id: 'paradise', name: 'The Sunlit Garden', subtitle: 'Paradise', description: 'Ivory terraces and luminous gardens guarded by a zealous sun sentinel.',
    palette: { ground: '#70917f', flecks: ['#7d9c89', '#809f8d', '#668a79'], path: '#c9c49e', edge: '#455f69', stone: '#bdcabb', highlight: '#f4edd1', accent: '#ffe3a0' },
    obstacles: [stone(530, 450, 210, 32), stone(530, 450, 32, 170), stone(900, 480, 32, 160), stone(940, 230, 45, 45), stone(1190, 230, 45, 45), tree(380, 290), tree(410, 640), tree(780, 770), tree(1160, 710), tree(830, 230), tree(260, 430)],
    paths: [{ x: 200, y: 760, width: 980, height: 100 }, { x: 670, y: 280, width: 100, height: 540 }, { x: 680, y: 280, width: 560, height: 110 }],
    spawns: camp, enemies: enemies({ x: 630, y: 710 }, { x: 1020, y: 780 }, { x: 680, y: 330 }, { x: 1090, y: 340 }), landmark: { x: 1090, y: 340 },
  },
  hell: {
    id: 'hell', name: 'The Ember Maw', subtitle: 'Hell', description: 'Cross black basalt ridges and evade the infernal warden’s burning volleys.',
    palette: { ground: '#482d31', flecks: ['#543035', '#60382f', '#392b30'], path: '#73504a', edge: '#251c25', stone: '#503f4b', highlight: '#967064', accent: '#ffab61' },
    obstacles: [stone(430, 390, 55, 270), stone(580, 540, 220, 40), stone(820, 780, 220, 45), stone(960, 440, 48, 190), stone(600, 200, 50, 130), tree(280, 310), tree(340, 550), tree(1120, 900), tree(1230, 570), tree(1080, 160)],
    paths: [{ x: 190, y: 730, width: 600, height: 120 }, { x: 690, y: 240, width: 130, height: 590 }, { x: 780, y: 290, width: 450, height: 110 }, { x: 1100, y: 290, width: 100, height: 470 }],
    spawns: camp, enemies: enemies({ x: 620, y: 720 }, { x: 1130, y: 700 }, { x: 730, y: 370 }, { x: 1120, y: 320 }), landmark: { x: 1120, y: 320 },
  },
  mountain: {
    id: 'mountain', name: 'The Frostbound Pass', subtitle: 'Mountain', description: 'Snowy switchbacks, crystal crags and an ancient frost giant.',
    palette: { ground: '#91a5b1', flecks: ['#aebec5', '#9daeb8', '#8196a5'], path: '#bfc8c9', edge: '#455c72', stone: '#697f95', highlight: '#e1eef0', accent: '#bceafa' },
    obstacles: [stone(440, 330, 160, 70), stone(420, 500, 65, 180), stone(750, 580, 180, 55), stone(880, 210, 65, 210), stone(1060, 530, 160, 65), tree(240, 260), tree(600, 890), tree(1190, 860), tree(1250, 400), tree(710, 200)],
    paths: [{ x: 180, y: 760, width: 890, height: 110 }, { x: 610, y: 280, width: 100, height: 580 }, { x: 650, y: 280, width: 560, height: 110 }, { x: 970, y: 350, width: 100, height: 470 }],
    spawns: camp, enemies: enemies({ x: 660, y: 710 }, { x: 1040, y: 720 }, { x: 710, y: 440 }, { x: 1100, y: 310 }), landmark: { x: 1100, y: 310 },
  },
};
export function parseMapId(value: unknown): MapId {
  if (typeof value !== 'string' || !MAP_IDS.includes(value as MapId)) throw new Error('Choose an available destination.');
  return value as MapId;
}
export function getMap(id: string): GameMap { return MAPS[parseMapId(id)]; }
