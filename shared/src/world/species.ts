import type { EnemyAttack } from './enemy-attacks.js';
import { biomeOf, type BiomeId, type MapId } from './biomes.js';
export type CreatureShape =
  | 'snake'
  | 'worm'
  | 'skeleton'
  | 'scorpion'
  | 'bush'
  | 'tree'
  | 'wisp'
  | 'spider'
  | 'knight'
  | 'hound'
  | 'mage'
  | 'executioner'
  | 'bat'
  | 'wolf'
  | 'golem'
  | 'eagle'
  | 'cherub'
  | 'sentinel'
  | 'oracle'
  | 'harpy'
  | 'imp'
  | 'fiend'
  | 'cultist'
  | 'drake';
export interface Species {
  name: string;
  shape: CreatureShape;
  attacks: readonly EnemyAttack[];
  speed: number;
  health: number;
  range: number;
}
const creature = (
  name: string,
  shape: CreatureShape,
  attacks: readonly EnemyAttack[],
  speed: number,
  health: number,
  range: number,
): Species => ({ name, shape, attacks, speed, health, range });
export const BESTIARY: Readonly<Record<BiomeId, readonly [Species, Species, Species, Species]>> = {
  desert: [
    creature('Dune snake', 'snake', ['bolt'], 1.15, 0.8, 380),
    creature('Dune monster', 'worm', ['charge', 'slam'], 0.8, 1.4, 420),
    creature('Sand skeleton', 'skeleton', ['burst', 'bolt'], 0.9, 1, 460),
    creature('Amber scorpion', 'scorpion', ['strike', 'fan', 'charge'], 1.25, 1.2, 420),
  ],
  forest: [
    creature('Thorn bush', 'bush', ['fan', 'bolt'], 0.6, 1.1, 400),
    creature('Demon tree', 'tree', ['roots', 'slam'], 0.55, 1.6, 420),
    creature('Spore wisp', 'wisp', ['eruption', 'fan'], 1.1, 0.75, 470),
    creature('Briar spider', 'spider', ['charge', 'strike', 'roots'], 1.3, 0.9, 430),
  ],
  castle: [
    creature('Hex cantor', 'mage', ['burst', 'bolt'], 0.85, 0.9, 480),
    creature('Oathless knight', 'knight', ['strike', 'royal'], 0.85, 1.4, 430),
    creature('Bone arbalist', 'skeleton', ['cross', 'burst'], 1, 1, 490),
    creature('Royal executioner', 'executioner', ['charge', 'royal', 'slam'], 1.1, 1.6, 450),
  ],
  mountain: [
    creature('Rime bat', 'bat', ['cross', 'bolt'], 1.3, 0.75, 460),
    creature('Frost wolf', 'wolf', ['charge', 'strike'], 1.4, 1, 450),
    creature('Storm eagle', 'eagle', ['fan', 'avalanche'], 1.2, 0.9, 500),
    creature('Glacier golem', 'golem', ['slam', 'avalanche', 'charge'], 0.65, 1.8, 440),
  ],
  paradise: [
    creature('Weeping cherub', 'cherub', ['ring', 'bolt'], 0.9, 0.9, 460),
    creature('Garden sentinel', 'sentinel', ['strike', 'halo', 'charge'], 0.85, 1.4, 430),
    creature('Dawn oracle', 'oracle', ['halo', 'burst'], 0.8, 1.1, 500),
    creature('Exiled harpy', 'harpy', ['charge', 'fan', 'ring'], 1.35, 1.1, 480),
  ],
  hell: [
    creature('Cinder imp', 'imp', ['burst', 'fan'], 1.25, 0.85, 470),
    creature('Ash hound', 'hound', ['charge', 'strike', 'fissure'], 1.4, 1.1, 470),
    creature('Obsidian cultist', 'cultist', ['fissure', 'cross', 'eruption'], 0.8, 1.2, 510),
    creature('Lava drake', 'drake', ['charge', 'fan', 'fissure'], 1.05, 1.7, 490),
  ],
};
export function speciesFor(value: string, mapId: MapId): Species | undefined {
  const biome = biomeOf(mapId);
  if (!value.startsWith(`${biome}-`)) {
    return undefined;
  }
  return BESTIARY[biome][Number(value.split('-')[1]) - 1];
}
