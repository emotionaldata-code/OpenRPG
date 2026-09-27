import { ITEMS, type Reward } from './items.js';

/** Every kill supplies a potion; melee drops a weapon, ranged/boss drops armor for your class. */
export function enemyLoot(role: string, characterClass: string): Reward {
  const slot = role === 'melee' ? 'weapon' : 'armor';
  return {
    items: ITEMS.filter(
      (entry) => entry.characterClass === characterClass && entry.slot === slot,
    ).map((entry) => entry.id),
    potions: 1,
  };
}

export const LOOT = { pickupRadius: 28, lifetimeMs: 120000, maxDrops: 216, graceMs: 500 } as const;
