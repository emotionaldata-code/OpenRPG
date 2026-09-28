import type { CharacterClass } from '../profiles/account.js';

export type ProjectileKind = 'arrow' | 'fireball' | 'inferno' | 'bolt';
export interface ProjectileRules {
  speed: number;
  radius: number;
  damage: number;
  lifeMs: number;
}
export interface Ability {
  name: string;
  cooldownMs: number;
}
export interface ClassCombat {
  primary: { name: string; chargeMs: number };
  special: Ability;
}

// Base damage before charge and equipment. Sweet releases offset the time spent charging.
export const CLASS_COMBAT: Record<CharacterClass, ClassCombat> = {
  archer: {
    primary: { name: 'Arrow', chargeMs: 1000 },
    special: { name: 'Arrow storm', cooldownMs: 7000 },
  },
  mage: {
    primary: { name: 'Fireball', chargeMs: 2000 },
    special: { name: 'Inferno', cooldownMs: 10000 },
  },
  warrior: {
    primary: { name: 'Sword sweep', chargeMs: 700 },
    special: { name: 'Iron will', cooldownMs: 12000 },
  },
};
export const PROJECTILES: Record<ProjectileKind, ProjectileRules> = {
  arrow: { speed: 480, radius: 3, damage: 25, lifeMs: 1600 },
  fireball: { speed: 330, radius: 7, damage: 55, lifeMs: 2300 },
  inferno: { speed: 260, radius: 14, damage: 300, lifeMs: 2900 },
  bolt: { speed: 205, radius: 3, damage: 20, lifeMs: 1600 },
};
export const COMBAT = {
  volleyCount: 12,
  swordReach: 100,
  swordHalfAngle: (Math.PI * 7) / 18,
  swordDamage: 24,
  sweepMs: 240,
  immunityMs: 4000,
} as const;
export function classCombat(kind: string): ClassCombat {
  return CLASS_COMBAT[kind === 'mage' || kind === 'warrior' ? kind : 'archer'];
}

/** Each revolution has the same timing window; missed windows can be tried again. */
export const CHARGE = {
  sweetStart: 0.65,
  sweetEnd: 0.8,
  minDamage: 0.025,
  maxDamage: 1.75,
  curvePower: 4,
  inputTimeoutMs: 500,
} as const;
export interface ChargeState {
  chargeStartedAt: number;
}
export function chargeProgress(heldMs: number, durationMs: number): number {
  return (Math.max(0, heldMs) % durationMs) / durationMs;
}
export function chargeMultiplier(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const quality =
    p < CHARGE.sweetStart
      ? p / CHARGE.sweetStart
      : p <= CHARGE.sweetEnd
        ? 1
        : (1 - p) / (1 - CHARGE.sweetEnd);
  return CHARGE.minDamage + quality ** CHARGE.curvePower * (CHARGE.maxDamage - CHARGE.minDamage);
}

export const CONTACT = {
  playerStunMs: { mob: 1000, boss: 2000 },
  playerPush: 120,
  recoveryMs: 1500,
  dash: { stunMs: 1000, push: 34 },
} as const;
export const PERFECT_STUN = {
  mob: { chance: 0.2, durationMs: 1500 },
  boss: { chance: 0.07, durationMs: 700 },
} as const;
/** Shared timing only; the server alone creates attacks and applies this damage. */
export function updateCharge(
  state: ChargeState,
  held: boolean,
  cancel: boolean,
  now: number,
  durationMs: number,
): number | null {
  if (cancel) {
    state.chargeStartedAt = -1;
    return null;
  }
  if (held) {
    if (state.chargeStartedAt < 0) {
      state.chargeStartedAt = now;
    }
    return null;
  }
  if (state.chargeStartedAt < 0) {
    return null;
  }
  const multiplier = chargeMultiplier(chargeProgress(now - state.chargeStartedAt, durationMs));
  state.chargeStartedAt = -1;
  return multiplier;
}
