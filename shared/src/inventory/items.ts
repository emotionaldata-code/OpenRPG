import type { CharacterClass } from '../profiles/account.js';
import { type MapId } from '../world/map.js';

export type GearSlot = 'weapon' | 'armor';
export interface ItemDefinition {
  id: string;
  name: string;
  slot: GearSlot;
  characterClass: CharacterClass;
  description: string;
  buy: number;
  sell: number;
  damageBonus?: number;
  cooldownMultiplier?: number;
  immunityBonusMs?: number;
}
export const ITEMS: readonly ItemDefinition[] = [
  {
    id: 'oak-bow',
    name: 'Oathwood bow',
    slot: 'weapon',
    buy: 80,
    sell: 20,
    characterClass: 'archer',
    description: '+20% arrow damage, including Arrow storm.',
    damageBonus: 0.2,
  },
  {
    id: 'ember-rod',
    name: 'Ember rod',
    slot: 'weapon',
    buy: 80,
    sell: 20,
    characterClass: 'mage',
    description: '+20% damage to both fireballs.',
    damageBonus: 0.2,
  },
  {
    id: 'iron-sword',
    name: 'Kingsguard sword',
    slot: 'weapon',
    buy: 80,
    sell: 20,
    characterClass: 'warrior',
    description: '+20% sword damage.',
    damageBonus: 0.2,
  },
  {
    id: 'scout-vest',
    name: 'Windrunner vest',
    slot: 'armor',
    buy: 100,
    sell: 25,
    characterClass: 'archer',
    description: 'Charge time and special cooldown are 15% shorter.',
    cooldownMultiplier: 0.85,
  },
  {
    id: 'ember-robe',
    name: 'Emberweave robe',
    slot: 'armor',
    buy: 100,
    sell: 25,
    characterClass: 'mage',
    description: 'Charge time and special cooldown are 15% shorter.',
    cooldownMultiplier: 0.85,
  },
  {
    id: 'iron-armor',
    name: 'Kingsguard armor',
    slot: 'armor',
    buy: 100,
    sell: 25,
    characterClass: 'warrior',
    description: 'Iron will lasts 5 seconds instead of 4.',
    immunityBonusMs: 1000,
  },
];
export const POTIONS = {
  heal: 50,
  cooldownMs: 1000,
  maxCarry: 5,
  starter: 3,
  maxStored: 999,
} as const;
export interface Loadout {
  weapon: string;
  armor: string;
  potions: number;
}
export interface InventoryStack {
  id: string;
  quantity: number;
}
export interface AdventureProfile {
  items: InventoryStack[];
  potions: number;
  coins: number;
  completedMaps: number;
}
export interface Reward {
  items: string[];
  potions: number;
  coins?: number;
  completedMap?: MapId;
}
export function item(id: string): ItemDefinition | undefined {
  return ITEMS.find((entry) => entry.id === id);
}
export function ownedQuantity(profile: AdventureProfile | null, id: string): number {
  return profile?.items.find((stack) => stack.id === id)?.quantity ?? 0;
}
