import {
  CHARGE,
  type WorldState,
  type Player,
  type Mob,
  type CharacterClass,
} from '@openrpg/shared';
import type { Music } from './music.js';
import type { Sound } from './sounds.js';
interface PlayerSound {
  hp: number;
  generation: number;
  lastAttackAt: number;
  nextSpecialAt: number;
  nextDashAt: number;
  nextPotionAt: number;
  lootAt: number;
  stunnedUntil: number;
}
interface MobSound {
  hp: number;
  generation: number;
  lastAttackAt: number;
}
export function soundClass(kind: string): CharacterClass {
  return kind === 'mage' || kind === 'warrior' ? kind : 'archer';
}
const playerSnapshot = (p: Player): PlayerSound => ({
  hp: p.hp,
  generation: p.generation,
  lastAttackAt: p.lastAttackAt,
  nextSpecialAt: p.nextSpecialAt,
  nextDashAt: p.nextDashAt,
  nextPotionAt: p.nextPotionAt,
  lootAt: p.lootAt,
  stunnedUntil: p.stunnedUntil,
});
const mobSnapshot = (m: Mob): MobSound => ({
  hp: m.hp,
  generation: m.generation,
  lastAttackAt: m.lastAttackAt,
});

/** Compare authoritative snapshots once per patch, outside prediction/reconciliation. */
export class CombatAudio {
  private players = new Map<string, PlayerSound>();
  private mobs = new Map<string, MobSound>();
  private elapsed = -1;
  private outcome = 'active';
  private primed = false;
  constructor(
    private play: (sound: Sound, volume?: number) => void,
    private music: (mode: Music) => void = () => {},
  ) {}
  update(state: WorldState, sessionId: string, active: boolean): void {
    // Persistent server state survives missed patches, mute and reconnects. No hit inference.
    const listener = state.players.get(sessionId);
    const fightingBoss =
      state.outcome === 'active' &&
      listener !== undefined &&
      listener.hp > 0 &&
      [...state.mobs.values()].some(
        (mob) =>
          mob.role === 'boss' &&
          mob.engaged &&
          mob.hp > 0 &&
          Math.hypot(mob.x - listener.x, mob.y - listener.y) < 850,
      );
    this.music(fightingBoss ? 'boss' : 'adventure');
    if (!active) {
      this.primed = false;
      return;
    }
    if (this.primed && state.elapsed === this.elapsed) {
      return;
    }
    const self = state.players.get(sessionId);
    const emit = this.primed && state.elapsed > this.elapsed && state.elapsed - this.elapsed < 500;
    const volume = (p: { x: number; y: number }): number =>
      self ? Math.max(0, 1 - Math.hypot(p.x - self.x, p.y - self.y) / 550) * 0.65 : 0;
    for (const [id, p] of state.players) {
      const old = this.players.get(id),
        mine = id === sessionId,
        gain = mine ? 1 : volume(p);
      if (emit && old) {
        if (p.generation !== old.generation) {
          if (mine) {
            this.play('respawn');
          }
        } else {
          if (mine && p.stunnedUntil > old.stunnedUntil && p.stunnedUntil > state.elapsed) {
            this.play('stun');
          }
          if (mine && p.hp < old.hp) {
            this.play(p.hp <= 0 ? 'death' : 'hurt');
          }
          if (!mine && state.mode === 'fight' && p.hp < old.hp) {
            this.play(p.hp <= 0 ? 'death' : 'hurt', gain);
          }
          if (p.lastAttackAt > old.lastAttackAt) {
            this.play(
              `${soundClass(p.characterClass)}-shot`,
              gain * (0.35 + (0.65 * p.lastAttackMultiplier) / CHARGE.maxDamage),
            );
            if (p.lastAttackMultiplier >= CHARGE.maxDamage) {
              this.play('perfect', gain);
            } else if (mine && p.lastAttackMultiplier <= CHARGE.maxDamage * 0.1) {
              this.play('bad-shot');
            }
          }
          if (p.nextSpecialAt > old.nextSpecialAt) {
            this.play(`${soundClass(p.characterClass)}-special`, gain);
          }
          if (p.nextDashAt > old.nextDashAt) {
            this.play('dash', gain);
          }
          if (mine && p.nextPotionAt > old.nextPotionAt) {
            this.play('potion');
          }
          if (mine && p.lootAt > old.lootAt) {
            this.play('loot');
          }
        }
      }
      this.players.set(id, playerSnapshot(p));
    }
    for (const [id, m] of state.mobs) {
      const old = this.mobs.get(id),
        gain = volume(m);
      if (emit && old && old.generation === m.generation && gain > 0) {
        if (m.hp < old.hp) {
          this.play(m.hp <= 0 ? 'mob-death' : 'mob-hurt', gain);
        }
        if (m.lastAttackAt > old.lastAttackAt) {
          this.play(
            m.role === 'boss' ? 'enemy-boss' : m.role === 'melee' ? 'enemy-melee' : 'enemy-ranged',
            gain,
          );
        }
      }
      this.mobs.set(id, mobSnapshot(m));
    }
    if (emit && state.outcome !== this.outcome && state.outcome !== 'active') {
      this.play(state.outcome === 'complete' ? 'victory' : 'defeat');
    }
    for (const id of this.players.keys()) {
      if (!state.players.has(id)) {
        this.players.delete(id);
      }
    }
    for (const id of this.mobs.keys()) {
      if (!state.mobs.has(id)) {
        this.mobs.delete(id);
      }
    }
    this.elapsed = state.elapsed;
    this.outcome = state.outcome;
    this.primed = true;
  }
  reset(): void {
    this.players.clear();
    this.mobs.clear();
    this.primed = false;
  }
}
