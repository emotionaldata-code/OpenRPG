import type { CharacterClass } from './account.js';
import { CLASS_COMBAT, COMBAT, type ClassCombat } from './combat.js';
import { MAP_IDS, type MapId } from './map.js';

export const EXPEDITION_MODES = { testing: 'Testing', story: 'Story', fight: 'Fight' } as const;
export type ExpeditionMode = keyof typeof EXPEDITION_MODES;
export type GearSlot = 'weapon' | 'armor';
export interface ItemDefinition {
  id: string; name: string; slot: GearSlot; characterClass: CharacterClass; description: string;
  buy: number; sell: number; damageBonus?: number; cooldownMultiplier?: number; immunityBonusMs?: number;
}
export const ITEMS: readonly ItemDefinition[] = [
  { id: 'oak-bow', name: 'Oathwood bow', slot: 'weapon', buy: 80, sell: 20, characterClass: 'archer', description: '+20% arrow damage, including Arrow storm.', damageBonus: .2 },
  { id: 'ember-rod', name: 'Ember rod', slot: 'weapon', buy: 80, sell: 20, characterClass: 'mage', description: '+20% damage to both fireballs.', damageBonus: .2 },
  { id: 'iron-sword', name: 'Kingsguard sword', slot: 'weapon', buy: 80, sell: 20, characterClass: 'warrior', description: '+20% sword damage.', damageBonus: .2 },
  { id: 'scout-vest', name: 'Windrunner vest', slot: 'armor', buy: 100, sell: 25, characterClass: 'archer', description: 'Both attack cooldowns are 15% shorter.', cooldownMultiplier: .85 },
  { id: 'ember-robe', name: 'Emberweave robe', slot: 'armor', buy: 100, sell: 25, characterClass: 'mage', description: 'Both attack cooldowns are 15% shorter.', cooldownMultiplier: .85 },
  { id: 'iron-armor', name: 'Kingsguard armor', slot: 'armor', buy: 100, sell: 25, characterClass: 'warrior', description: 'Iron will lasts 5 seconds instead of 4.', immunityBonusMs: 1000 },
];
export const POTIONS = { heal: 50, cooldownMs: 1000, maxCarry: 5, starter: 3, maxStored: 999 } as const;
export interface Loadout { weapon: string; armor: string; potions: number }
export interface InventoryStack { id: string; quantity: number }
export interface AdventureProfile { items: InventoryStack[]; potions: number; coins: number; completedMaps: number }
export interface Reward { items: string[]; potions: number; coins?: number; completedMap?: MapId }
export const emptyLoadout = (): Loadout => ({ weapon: '', armor: '', potions: 0 });
export function item(id: string): ItemDefinition | undefined { return ITEMS.find(entry => entry.id === id); }
export function parseMode(value: unknown): ExpeditionMode {
  if (value === undefined) return 'testing';
  if (value !== 'testing' && value !== 'story' && value !== 'fight') throw new Error('Choose Testing, Story or Fight.');
  return value;
}
export function parseLoadout(value: unknown): Loadout {
  if (value === undefined) return emptyLoadout();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid expedition equipment.');
  const raw = value as Record<string, unknown>;
  const gear = (slot: GearSlot): string => {
    const id = raw[slot] ?? '';
    if (typeof id !== 'string' || (id !== '' && item(id)?.slot !== slot)) throw new Error(`Choose a valid ${slot}.`);
    return id;
  };
  const potions = raw.potions ?? 0;
  if (typeof potions !== 'number' || !Number.isInteger(potions) || potions < 0 || potions > POTIONS.maxCarry) throw new Error('Bring between 0 and 5 potions.');
  return { weapon: gear('weapon'), armor: gear('armor'), potions };
}
export function mapUnlocked(mapId: MapId, completedMaps: number): boolean { return MAP_IDS.indexOf(mapId) <= completedMaps; }
interface Equipped { characterClass: string; weapon: string; armor: string }
export function equipmentStats(player: Equipped): { damageMultiplier: number; cooldownMultiplier: number; immunityMs: number } {
  const weapon = item(player.weapon), armor = item(player.armor);
  const validWeapon = weapon?.characterClass === player.characterClass ? weapon : undefined;
  const validArmor = armor?.characterClass === player.characterClass ? armor : undefined;
  return { damageMultiplier: 1 + (validWeapon?.damageBonus ?? 0), cooldownMultiplier: validArmor?.cooldownMultiplier ?? 1, immunityMs: COMBAT.immunityMs + (validArmor?.immunityBonusMs ?? 0) };
}
export function equippedCombat(player: Equipped): ClassCombat {
  const base = CLASS_COMBAT[player.characterClass === 'mage' || player.characterClass === 'warrior' ? player.characterClass : 'archer'];
  const multiplier = equipmentStats(player).cooldownMultiplier;
  return { primary: { ...base.primary, cooldownMs: base.primary.cooldownMs * multiplier }, special: { ...base.special, cooldownMs: base.special.cooldownMs * multiplier } };
}
/** Every kill supplies a potion; melee drops a weapon, ranged/boss drops armor for your class. */
export function enemyLoot(role: string, characterClass: string): Reward {
  const slot = role === 'melee' ? 'weapon' : 'armor';
  return { items: ITEMS.filter(entry => entry.characterClass === characterClass && entry.slot === slot).map(entry => entry.id), potions: 1 };
}

export const ECONOMY = { starterCoins: 30, maxCoins: 999999, maxStack: 999, potionBuy: 10, potionSell: 3 } as const;
export const LOOT = { pickupRadius: 28, lifetimeMs: 120000, maxDrops: 216, graceMs: 500 } as const;
export interface Trade { action: 'buy' | 'sell'; itemId: string }
export function parseTrade(raw: unknown): Trade {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Choose an item to trade.');
  const { action, itemId } = raw as Record<string, unknown>;
  if ((action !== 'buy' && action !== 'sell') || typeof itemId !== 'string' || (itemId !== 'potion' && !item(itemId))) throw new Error('Choose a valid shop item.');
  return { action, itemId };
}
export function ownedQuantity(profile: AdventureProfile | null, id: string): number { return profile?.items.find(stack => stack.id === id)?.quantity ?? 0; }
