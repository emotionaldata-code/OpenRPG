import type { EnemyRole, MapId } from './map.js';
export interface EnemyRules {
  health: number; radius: number; speed: number; range: number; reach: number;
  damage: number; cooldownMs: number; windupMs: number;
}
export const ENEMY_RULES: Readonly<Record<EnemyRole, EnemyRules>> = {
  melee: { health: 100, radius: 12, speed: 118, range: 330, reach: 42, damage: 18, cooldownMs: 1200, windupMs: 400 },
  ranged: { health: 75, radius: 11, speed: 68, range: 330, reach: 210, damage: 20, cooldownMs: 1500, windupMs: 350 },
  boss: { health: 900, radius: 22, speed: 80, range: 380, reach: 110, damage: 32, cooldownMs: 2800, windupMs: 1000 },
};
export const ENEMY_AI = { leash: 480, campRadius: 125, routeMs: 600, grid: 48, patrolRadius: 55, recoveryMs: 350 } as const;
export interface EnemyTheme { names: Readonly<Record<EnemyRole, string>>; body: string; trim: string; eyes: string; bossAttack: 'slam' | 'fan' | 'ring' }
export const ENEMY_THEMES: Readonly<Record<MapId, EnemyTheme>> = {
  forest: { names: { melee: 'Briar stalker', ranged: 'Hollow mage', boss: 'Elderroot' }, body: '#647b45', trim: '#b8c783', eyes: '#e5da88', bossAttack: 'slam' },
  castle: { names: { melee: 'Oathless knight', ranged: 'Hex cantor', boss: 'The Hollow King' }, body: '#787d92', trim: '#cb9e6e', eyes: '#f4cda3', bossAttack: 'fan' },
  paradise: { names: { melee: 'Garden sentinel', ranged: 'Dawn oracle', boss: 'Seraph of Noon' }, body: '#b8c9b5', trim: '#ffe0a1', eyes: '#ffffff', bossAttack: 'ring' },
  hell: { names: { melee: 'Cinder fiend', ranged: 'Ash invoker', boss: 'Infernal Warden' }, body: '#ad5142', trim: '#f4a557', eyes: '#fff2b2', bossAttack: 'fan' },
  mountain: { names: { melee: 'Frost raider', ranged: 'Rime shaman', boss: 'Glacier Colossus' }, body: '#728da2', trim: '#c6eef1', eyes: '#e6fdff', bossAttack: 'slam' },
};
export function enemyRole(value: string): EnemyRole { return value === 'melee' || value === 'boss' ? value : 'ranged'; }
export function enemyRules(value: string): EnemyRules { return ENEMY_RULES[enemyRole(value)]; }
