import { MAP_IDS, type MapId } from './map.js';

export const EXPEDITION_MODES = { testing: 'Testing', story: 'Story', fight: 'Fight' } as const;
export type ExpeditionMode = keyof typeof EXPEDITION_MODES;
export function parseMode(value: unknown): ExpeditionMode {
  if (value === undefined) {
    return 'testing';
  }
  if (value !== 'testing' && value !== 'story' && value !== 'fight') {
    throw new Error('Choose Testing, Story or Fight.');
  }
  return value;
}
export function mapUnlocked(mapId: MapId, completedMaps: number): boolean {
  return MAP_IDS.indexOf(mapId) <= completedMaps;
}
