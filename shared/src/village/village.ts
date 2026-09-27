import { schema, t, type SchemaType } from '@colyseus/schema';
import type { Point, Rect } from '../world/map.js';

export const VILLAGE = {
  width: 1280,
  height: 900,
  capacity: 24,
  spawn: { x: 640, y: 660 },
  reach: 95,
} as const;
export const VILLAGE_STATIONS = [
  {
    id: 'shop',
    name: 'The Quartermaster',
    hint: 'Class · equipment · trade',
    activity: 'At the quartermaster',
    x: 300,
    y: 410,
    color: '#d9ad68',
  },
  {
    id: 'wardrobe',
    name: 'The Moonlit Tailor',
    hint: 'Choose & create skins',
    activity: 'At the tailor',
    x: 980,
    y: 410,
    color: '#b7a1de',
  },
  {
    id: 'account',
    name: 'The Wayfarer Inn',
    hint: 'Your adventurer · log out',
    activity: 'Resting at the inn',
    x: 300,
    y: 700,
    color: '#d6c190',
  },
  {
    id: 'testing',
    name: 'Training Grounds',
    hint: 'TEST · all realms · endless lives',
    activity: 'Preparing a test expedition',
    x: 490,
    y: 235,
    color: '#91c792',
  },
  {
    id: 'story',
    name: 'The Five Realms',
    hint: 'STORY · unlock your journey',
    activity: 'Preparing a story expedition',
    x: 790,
    y: 235,
    color: '#e2c37b',
  },
  {
    id: 'fight',
    name: 'The Dueling Gate',
    hint: 'FIGHT · player versus player',
    activity: 'Preparing a duel',
    x: 980,
    y: 700,
    color: '#d98c7c',
  },
] as const;
export type VillageStation = (typeof VILLAGE_STATIONS)[number];
export type StationId = VillageStation['id'];
// Full visible silhouettes, including roofs. Rendering and movement share these bounds.
export const VILLAGE_BUILDINGS = [
  { station: 'shop', x: 186, y: 205, width: 228, height: 165 },
  { station: 'wardrobe', x: 866, y: 205, width: 228, height: 165 },
  { station: 'account', x: 186, y: 485, width: 228, height: 165 },
] as const;
export const VILLAGE_WALLS: readonly Rect[] = [
  { x: 0, y: 0, width: 1280, height: 70 },
  { x: 0, y: 0, width: 70, height: 900 },
  { x: 1210, y: 0, width: 70, height: 900 },
  { x: 0, y: 830, width: 1280, height: 70 },
  ...VILLAGE_BUILDINGS,
  { x: 602, y: 452, width: 76, height: 66 },
];
export function nearbyStation(point: Point): VillageStation | undefined {
  return VILLAGE_STATIONS.find(
    (station) => Math.hypot(point.x - station.x, point.y - station.y) <= VILLAGE.reach,
  );
}
// Social presence only: no combat, inventory contents, or account identifiers in patches.
export const Villager = schema(
  {
    name: t.string(),
    x: t.float64(),
    y: t.float64(),
    aim: t.float64().default(Math.PI / 2),
    hp: t.uint8().default(100),
    connected: t.boolean().default(true),
    characterClass: t.string().default('archer'),
    skinId: t.string().default(''),
    weapon: t.string().default(''),
    armor: t.string().default(''),
    activity: t.string().default(''),
  },
  'Villager',
);
export type Villager = SchemaType<typeof Villager>;
export const VillageState = schema({ players: t.map(Villager) }, 'VillageState');
export type VillageState = SchemaType<typeof VillageState>;
