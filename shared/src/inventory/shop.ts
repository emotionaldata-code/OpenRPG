import { item } from './items.js';

export const ECONOMY = {
  starterCoins: 30,
  maxCoins: 999999,
  maxStack: 999,
  potionBuy: 10,
  potionSell: 3,
} as const;
export interface Trade {
  action: 'buy' | 'sell';
  itemId: string;
}
export function parseTrade(raw: unknown): Trade {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Choose an item to trade.');
  }
  const { action, itemId } = raw as Record<string, unknown>;
  if (
    (action !== 'buy' && action !== 'sell') ||
    typeof itemId !== 'string' ||
    (itemId !== 'potion' && !item(itemId))
  ) {
    throw new Error('Choose a valid shop item.');
  }
  return { action, itemId };
}
