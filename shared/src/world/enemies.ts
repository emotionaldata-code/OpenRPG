import { ENCOUNTERS } from './enemy-attacks.js';
import type { EnemyRole, MapId } from './map.js';
export interface EnemyRules {
  health: number;
  radius: number;
  speed: number;
  range: number;
  damage: number;
  cooldownMs: number;
}
export const ENEMY_RULES: Readonly<Record<EnemyRole, EnemyRules>> = {
  melee: {
    health: 100,
    radius: 12,
    speed: 105,
    range: 430,
    damage: 12,
    cooldownMs: 1500,
  },
  ranged: {
    health: 75,
    radius: 11,
    speed: 85,
    range: 430,
    damage: 12,
    cooldownMs: 1700,
  },
  boss: {
    health: 450,
    radius: 22,
    speed: 100,
    range: 520,
    damage: 18,
    cooldownMs: 1800,
  },
};
export const ENEMY_AI = {
  leash: 650,
  campRadius: 125,
  routeMs: 450,
  grid: 48,
  patrolRadius: 55,
} as const;
export interface EnemyTheme {
  names: Readonly<Record<EnemyRole, string>>;
  body: string;
  trim: string;
  eyes: string;
}
export const ENEMY_THEMES: Readonly<Record<MapId, EnemyTheme>> = {
  forest: {
    names: { melee: 'Briar stalker', ranged: 'Hollow mage', boss: 'Elderroot' },
    body: '#647b45',
    trim: '#b8c783',
    eyes: '#e5da88',
  },
  castle: {
    names: { melee: 'Oathless knight', ranged: 'Hex cantor', boss: 'The Hollow King' },
    body: '#787d92',
    trim: '#cb9e6e',
    eyes: '#f4cda3',
  },
  paradise: {
    names: { melee: 'Garden sentinel', ranged: 'Dawn oracle', boss: 'Seraph of Noon' },
    body: '#b8c9b5',
    trim: '#ffe0a1',
    eyes: '#ffffff',
  },
  hell: {
    names: { melee: 'Cinder fiend', ranged: 'Ash invoker', boss: 'Infernal Warden' },
    body: '#ad5142',
    trim: '#f4a557',
    eyes: '#fff2b2',
  },
  mountain: {
    names: { melee: 'Frost raider', ranged: 'Rime shaman', boss: 'Glacier Colossus' },
    body: '#728da2',
    trim: '#c6eef1',
    eyes: '#e6fdff',
  },
};
export function enemyRole(value: string): EnemyRole {
  return value === 'melee' || value === 'boss' ? value : 'ranged';
}
export function enemyRules(value: string, mapId: MapId = 'forest'): EnemyRules {
  const base = ENEMY_RULES[enemyRole(value)];
  const level = ENCOUNTERS[mapId].tier - 1;
  return {
    ...base,
    health: Math.round(base.health * (1 + level * (value === 'boss' ? 0.55 : 0.2))),
    damage: Math.round(base.damage * (1 + level * 0.28)),
    speed: base.speed + level * 20,
    cooldownMs: base.cooldownMs - level * 300,
  };
}
