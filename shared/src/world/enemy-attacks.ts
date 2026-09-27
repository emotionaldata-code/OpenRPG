import type { EnemyRole, MapId } from './map.js';

export type EnemyAttack =
  'strike' | 'bolt' | 'slam' | 'fan' | 'ring' | 'burst' | 'charge' | 'eruption' | 'cross';
export interface AttackPattern {
  reach: number;
  windupMs: number;
  recoveryMs: number;
  damage: number;
  count: number;
  radius: number;
}
// Geometry is shared by damage and warnings. Damage is relative to the enemy's base hit.
export const ENEMY_ATTACKS: Readonly<Record<EnemyAttack, AttackPattern>> = {
  strike: { reach: 50, windupMs: 350, recoveryMs: 180, damage: 1, count: 0, radius: 50 },
  bolt: { reach: 310, windupMs: 350, recoveryMs: 140, damage: 1, count: 1, radius: 0 },
  slam: { reach: 120, windupMs: 650, recoveryMs: 300, damage: 1, count: 0, radius: 120 },
  fan: { reach: 350, windupMs: 480, recoveryMs: 200, damage: 0.8, count: 5, radius: 0 },
  ring: { reach: 340, windupMs: 650, recoveryMs: 240, damage: 0.7, count: 12, radius: 0 },
  burst: { reach: 380, windupMs: 500, recoveryMs: 480, damage: 0.6, count: 3, radius: 0 },
  charge: { reach: 270, windupMs: 650, recoveryMs: 650, damage: 1.1, count: 0, radius: 22 },
  eruption: { reach: 400, windupMs: 850, recoveryMs: 220, damage: 1.2, count: 0, radius: 76 },
  cross: { reach: 380, windupMs: 550, recoveryMs: 220, damage: 0.8, count: 8, radius: 0 },
};
export interface Encounter {
  tier: number;
  windup: number;
  strafeSpeed: number;
  enrageCooldown: number;
  tactic: string;
  melee: readonly EnemyAttack[];
  ranged: readonly EnemyAttack[];
  boss: readonly EnemyAttack[];
}
export const ENCOUNTERS: Readonly<Record<MapId, Encounter>> = {
  forest: {
    tier: 1,
    strafeSpeed: 0.45,
    windup: 1.35,
    enrageCooldown: 0.9,
    tactic: 'Follow the river trail. Elderroot teaches two slow attacks: a stomp and a spread.',
    melee: ['strike'],
    ranged: ['bolt'],
    boss: ['slam', 'fan'],
  },
  castle: {
    tier: 2,
    strafeSpeed: 0.6,
    windup: 1.15,
    enrageCooldown: 0.82,
    tactic:
      'Break sight behind the ramparts. Knights rush; the King follows volleys with a charge.',
    melee: ['strike', 'charge'],
    ranged: ['bolt', 'burst'],
    boss: ['fan', 'charge', 'slam'],
  },
  paradise: {
    tier: 3,
    strafeSpeed: 0.75,
    windup: 1,
    enrageCooldown: 0.75,
    tactic: 'Find gaps in the sun rings. Leave marked ground before the light falls.',
    melee: ['strike', 'strike', 'charge'],
    ranged: ['fan', 'bolt', 'burst'],
    boss: ['ring', 'eruption', 'fan', 'burst'],
  },
  hell: {
    tier: 4,
    strafeSpeed: 0.9,
    windup: 0.9,
    enrageCooldown: 0.7,
    tactic: 'Keep moving through staggered bursts, marked blasts and charging fiends.',
    melee: ['charge', 'strike'],
    ranged: ['burst', 'eruption', 'fan'],
    boss: ['burst', 'eruption', 'charge', 'ring', 'fan'],
  },
  mountain: {
    tier: 5,
    strafeSpeed: 1,
    windup: 0.8,
    enrageCooldown: 0.65,
    tactic: 'Sidestep frost crosses. The Colossus chains rushes, avalanches and rings.',
    melee: ['charge', 'strike', 'slam'],
    ranged: ['cross', 'burst', 'eruption'],
    boss: ['charge', 'cross', 'eruption', 'ring', 'slam', 'burst', 'fan'],
  },
};
export function enemyAttack(value: string): EnemyAttack {
  return Object.hasOwn(ENEMY_ATTACKS, value) ? (value as EnemyAttack) : 'bolt';
}
export function attackPattern(kind: string, role: string, mapId: MapId = 'forest'): AttackPattern {
  const base = ENEMY_ATTACKS[enemyAttack(kind)];
  const pattern = { ...base, windupMs: Math.round(base.windupMs * ENCOUNTERS[mapId].windup) };
  if (role === 'boss') {
    return pattern;
  }
  // Ordinary enemies teach smaller versions of the bosses' attacks.
  return {
    ...pattern,
    count: kind === 'fan' ? 3 : pattern.count,
    radius:
      kind === 'slam' ? 62 : kind === 'eruption' ? 48 : kind === 'charge' ? 12 : pattern.radius,
    reach: kind === 'slam' ? 62 : kind === 'charge' ? 180 : pattern.reach,
  };
}
export function attackAngles(kind: string, aim: number, role: EnemyRole): number[] {
  const count = attackPattern(kind, role).count;
  return Array.from(
    { length: count },
    (_, i) =>
      aim +
      (kind === 'ring'
        ? (i * Math.PI * 2) / count
        : kind === 'cross'
          ? (Math.floor(i / 2) * Math.PI) / 2 + (i % 2 ? 0.11 : -0.11)
          : kind === 'fan'
            ? (i - (count - 1) / 2) * 0.24
            : 0),
  );
}
export const ENEMY_COMBAT = {
  chargeSpeed: 450,
  burstIntervalMs: 160,
  maxHostileShots: 192,
} as const;
