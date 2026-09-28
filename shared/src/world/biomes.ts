export const BIOME_IDS = ['desert', 'forest', 'castle', 'mountain', 'paradise', 'hell'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];
export type Stage = 1 | 2 | 3 | 4 | 5;
export type MapId = BiomeId | `${BiomeId}-${2 | 3 | 4 | 'boss'}`;
export const MAP_IDS: readonly MapId[] = BIOME_IDS.flatMap(
  (id) => [id, `${id}-2`, `${id}-3`, `${id}-4`, `${id}-boss`] as MapId[],
);
export function biomeOf(id: MapId): BiomeId {
  return id.split('-')[0] as BiomeId;
}
export function stageOf(id: MapId): Stage {
  const suffix = id.split('-')[1];
  return suffix === 'boss' ? 5 : suffix ? (Number(suffix) as Stage) : 1;
}
/** A complete record in campaign order, shared by content catalogs. */
export function mapCatalog<T>(build: (id: MapId) => T): Record<MapId, T> {
  return Object.fromEntries(MAP_IDS.map((id) => [id, build(id)])) as Record<MapId, T>;
}
