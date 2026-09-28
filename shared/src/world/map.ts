import { ROUTES, type Region } from './regions.js';
import { MAP_IDS, biomeOf, stageOf, mapCatalog, type MapId, type BiomeId } from './biomes.js';
import { campaignRoute, STAGE_NAMES } from './routes/campaign.js';
import { overlaps } from './collision.js';
export { MAP_IDS, BIOME_IDS, biomeOf, stageOf } from './biomes.js';
export type { MapId, BiomeId, Stage } from './biomes.js';
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface Obstacle extends Rect {
  kind: 'tree' | 'stone' | 'water' | 'lava' | 'chasm' | 'sand';
}
export { WORLD } from './bounds.js';
export const SPAWNS: readonly Point[] = [
  { x: 250, y: 790 },
  { x: 290, y: 830 },
  { x: 210, y: 830 },
];
export type EnemyRole = 'melee' | 'ranged' | 'boss';
export interface EnemySpawn extends Point {
  role: EnemyRole;
  species?: string;
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
  biome: BiomeId;
  stage: 1 | 2 | 3 | 4 | 5;
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
  Record<BiomeId, Pick<GameMap, 'id' | 'name' | 'subtitle' | 'description' | 'palette'>>
> = {
  desert: {
    id: 'desert',
    name: 'The Saffron Wastes',
    subtitle: 'Desert',
    description: 'Cross wind-carved dunes, an oasis and buried ruins beneath the burning sun.',
    palette: {
      ground: '#b89055',
      flecks: ['#c59b5c', '#d4ad70', '#a47d46'],
      path: '#e1bc7e',
      edge: '#674d36',
      stone: '#aa784d',
      highlight: '#f4d697',
      accent: '#ffe2a1',
    },
  },
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
// Geometry and encounter composition are baked once for both simulation and rendering.
function buildMap(id: MapId): GameMap {
  const biome = biomeOf(id),
    stage = stageOf(id);
  const { boss, ...route } = stage === 1 && biome !== 'desert' ? ROUTES[biome] : campaignRoute(id);
  const enemies: EnemySpawn[] = [];
  if (stage === 5) {
    enemies.push({ ...boss, role: 'boss' });
  } else {
    // Sample only walkable path tiles, with separation from camp and other creatures.
    const candidates: Point[] = [...route.enemies];
    for (const path of route.paths) {
      for (let x = path.x + 35; x < path.x + path.width - 25; x += 95) {
        for (let y = path.y + 35; y < path.y + path.height - 25; y += 95) {
          candidates.push({ x, y });
        }
      }
    }
    const count = 6 + (stage - 1) * 4;
    const valid = candidates.filter(
      (p) =>
        p.x > 540 &&
        p.y > 65 &&
        p.y < 950 &&
        p.x < 3360 &&
        route.obstacles.every((o) => !overlaps(p, 26, o)),
    );
    // Interleave the route so each stage populates its full length.
    for (let i = 0; enemies.length < count && i < valid.length; i++) {
      const p = valid[(i * 37) % valid.length]!;
      if (enemies.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 78)) {
        continue;
      }
      const slot = (enemies.length % stage) + 1;
      enemies.push({
        ...p,
        role: slot % 2 === 1 ? 'ranged' : 'melee',
        species: `${biome}-${slot}`,
      });
    }
  }
  return {
    ...themes[biome],
    ...route,
    id,
    biome,
    stage,
    name: STAGE_NAMES[biome][stage - 1]!,
    subtitle: `${themes[biome].subtitle} · ${stage === 5 ? 'Boss' : `${stage}/4`}`,
    enemies,
    spawns: SPAWNS,
    landmark: boss,
  };
}
export const MAPS: Readonly<Record<MapId, GameMap>> = mapCatalog(buildMap);
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
