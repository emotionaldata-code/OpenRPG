import { ROUTES, type Region } from './regions.js';
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface Obstacle extends Rect {
  kind: 'tree' | 'stone' | 'water' | 'lava' | 'chasm';
}
export { WORLD } from './bounds.js';
export const SPAWNS: readonly Point[] = [
  { x: 250, y: 790 },
  { x: 290, y: 830 },
  { x: 210, y: 830 },
];
export const MAP_IDS = ['forest', 'castle', 'paradise', 'hell', 'mountain'] as const;
export type MapId = (typeof MAP_IDS)[number];
export type EnemyRole = 'melee' | 'ranged' | 'boss';
export interface EnemySpawn extends Point {
  role: EnemyRole;
}
export interface MapPalette {
  ground: string;
  flecks: readonly string[];
  path: string;
  edge: string;
  stone: string;
  highlight: string;
  accent: string;
}
export interface GameMap {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  palette: MapPalette;
  obstacles: readonly Obstacle[];
  paths: readonly Rect[];
  spawns: readonly Point[];
  enemies: readonly EnemySpawn[];
  landmark: Point;
  regions: readonly Region[];
}
const themes: Readonly<
  Record<MapId, Pick<GameMap, 'id' | 'name' | 'subtitle' | 'description' | 'palette'>>
> = {
  forest: {
    id: 'forest',
    name: 'The Verdant Watch',
    subtitle: 'Forest',
    description: 'Follow woodland forks around moonwater pools to the fallen guardian.',
    palette: {
      ground: '#294837',
      flecks: ['#2e503b', '#35593f', '#274332'],
      path: '#706b4c',
      edge: '#142d25',
      stone: '#68796c',
      highlight: '#93a08a',
      accent: '#a9c77d',
    },
  },
  castle: {
    id: 'castle',
    name: 'The Hollow Keep',
    subtitle: 'Castle',
    description: 'Breach offset gates, cross enclosed halls and enter the throne court.',
    palette: {
      ground: '#353744',
      flecks: ['#3f424e', '#30333d', '#484952'],
      path: '#686373',
      edge: '#20212d',
      stone: '#777a89',
      highlight: '#abb0bd',
      accent: '#cf9c75',
    },
  },
  paradise: {
    id: 'paradise',
    name: 'The Sunlit Garden',
    subtitle: 'Paradise',
    description: 'Choose either garden flank around reflecting pools, then cross the sun bridge.',
    palette: {
      ground: '#70917f',
      flecks: ['#7d9c89', '#809f8d', '#668a79'],
      path: '#c9c49e',
      edge: '#455f69',
      stone: '#bdcabb',
      highlight: '#f4edd1',
      accent: '#ffe3a0',
    },
  },
  hell: {
    id: 'hell',
    name: 'The Ember Maw',
    subtitle: 'Hell',
    description: 'Cross isolated basalt islands and narrow bridges above the lava.',
    palette: {
      ground: '#482d31',
      flecks: ['#543035', '#60382f', '#392b30'],
      path: '#73504a',
      edge: '#251c25',
      stone: '#503f4b',
      highlight: '#967064',
      accent: '#ffab61',
    },
  },
  mountain: {
    id: 'mountain',
    name: 'The Frostbound Pass',
    subtitle: 'Mountain',
    description: 'Climb three ledges, doubling back along the ridge before the final summit.',
    palette: {
      ground: '#91a5b1',
      flecks: ['#aebec5', '#9daeb8', '#8196a5'],
      path: '#bfc8c9',
      edge: '#455c72',
      stone: '#697f95',
      highlight: '#e1eef0',
      accent: '#bceafa',
    },
  },
};
// Each authored route ends in an arena; rendering and simulation share the same geometry.
function buildMap(id: MapId): GameMap {
  const { boss, ...route } = ROUTES[id];
  return {
    ...themes[id],
    ...route,
    enemies: [...route.enemies, { ...boss, role: 'boss' }],
    spawns: SPAWNS,
    landmark: boss,
  };
}
export const MAPS: Readonly<Record<MapId, GameMap>> = {
  forest: buildMap('forest'),
  castle: buildMap('castle'),
  paradise: buildMap('paradise'),
  hell: buildMap('hell'),
  mountain: buildMap('mountain'),
};
export function parseMapId(value: unknown): MapId {
  if (typeof value !== 'string' || !MAP_IDS.includes(value as MapId)) {
    throw new Error('Choose an available destination.');
  }
  return value as MapId;
}
export function getMap(id: string): GameMap {
  return MAPS[parseMapId(id)];
}

// Defaults for deterministic movement outside a selected room.
export const OBSTACLES = MAPS.forest.obstacles;
export const PATHS = MAPS.forest.paths;
export const MOB_SPAWNS = MAPS.forest.enemies;
