import { CLASS_COMBAT, COMBAT, type ClassCombat } from '../combat/combat.js';
import { item, POTIONS, type Loadout, type GearSlot } from './items.js';

export const emptyLoadout = (): Loadout => ({ weapon: '', armor: '', potions: 0 });
export function parseLoadout(value: unknown): Loadout {
  if (value === undefined) {
    return emptyLoadout();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid expedition equipment.');
  }
  const raw = value as Record<string, unknown>;
  const gear = (slot: GearSlot): string => {
    const id = raw[slot] ?? '';
    if (typeof id !== 'string' || (id !== '' && item(id)?.slot !== slot)) {
      throw new Error(`Choose a valid ${slot}.`);
    }
    return id;
  };
  const potions = raw.potions ?? 0;
  if (
    typeof potions !== 'number' ||
    !Number.isInteger(potions) ||
    potions < 0 ||
    potions > POTIONS.maxCarry
  ) {
    throw new Error('Bring between 0 and 5 potions.');
  }
  return { weapon: gear('weapon'), armor: gear('armor'), potions };
}
interface Equipped {
  characterClass: string;
  weapon: string;
  armor: string;
}
export function equipmentStats(player: Equipped): {
  damageMultiplier: number;
  cooldownMultiplier: number;
  immunityMs: number;
} {
  const weapon = item(player.weapon),
    armor = item(player.armor);
  const validWeapon = weapon?.characterClass === player.characterClass ? weapon : undefined;
  const validArmor = armor?.characterClass === player.characterClass ? armor : undefined;
  return {
    damageMultiplier: 1 + (validWeapon?.damageBonus ?? 0),
    cooldownMultiplier: validArmor?.cooldownMultiplier ?? 1,
    immunityMs: COMBAT.immunityMs + (validArmor?.immunityBonusMs ?? 0),
  };
}
export function equippedCombat(player: Equipped): ClassCombat {
  const base =
    CLASS_COMBAT[
      player.characterClass === 'mage' || player.characterClass === 'warrior'
        ? player.characterClass
        : 'archer'
    ];
  const multiplier = equipmentStats(player).cooldownMultiplier;
  return {
    primary: { ...base.primary, chargeMs: base.primary.chargeMs * multiplier },
    special: { ...base.special, cooldownMs: base.special.cooldownMs * multiplier },
  };
}
