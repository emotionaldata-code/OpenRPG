import type { WorldState } from '@openrpg/shared';
import {
  RULES,
  POTIONS,
  Player,
  getMap,
  type GameMap,
  type Mob,
  type Loadout,
  movePlayer,
  type Intent,
  type CharacterClass,
} from '@openrpg/shared';
import { Combat } from './combat.js';
import { Enemies } from './enemies.js';
export class Simulation {
  private combat: Combat;
  private enemies?: Enemies;
  readonly map: GameMap;
  private joins = 0;
  constructor(
    readonly state: WorldState,
    defeated: (mob: Mob) => void = () => {},
  ) {
    this.map = getMap(state.mapId);
    this.combat = new Combat(state, defeated);
    if (state.mode !== 'fight') {
      this.enemies = new Enemies(state, this.map, this.combat);
    }
  }
  addPlayer(
    id: string,
    name: string,
    characterClass: CharacterClass = 'archer',
    loadout?: Loadout,
  ): void {
    const spawn = this.map.spawns[this.joins++ % this.map.spawns.length]!;
    this.state.players.set(
      id,
      new Player({
        name,
        characterClass,
        ...loadout,
        ...spawn,
        protectedUntil: this.state.elapsed + RULES.protectionMs,
      }),
    );
  }
  removePlayer(id: string): void {
    this.state.players.delete(id);
    this.combat.removeOwner(id);
  }
  /** World timers advance once, irrespective of the number of input packets received. */
  advance(dt: number): void {
    if (this.state.outcome === 'failed') {
      return;
    }
    if (this.state.outcome === 'complete') {
      this.state.elapsed += dt * 1000;
      return;
    }
    this.state.elapsed += dt * 1000;
    for (const [id, player] of this.state.players) {
      if (this.state.mode !== 'story' && player.hp <= 0 && this.state.elapsed >= player.respawnAt) {
        const index = [...this.state.players.keys()].indexOf(id);
        Object.assign(player, this.map.spawns[index % this.map.spawns.length]!, {
          hp: RULES.playerHealth,
          respawnAt: 0,
          protectedUntil: this.state.elapsed + RULES.protectionMs,
          generation: player.generation + 1,
          invulnerableUntil: 0,
          sweepAt: -1000,
          chargeStartedAt: -1,
        });
      }
    }
    this.enemies?.step(dt);
    this.combat.step(dt);
    if (this.state.mode === 'story' && this.state.players.size > 0) {
      if ([...this.state.players.values()].every((p) => p.hp <= 0)) {
        this.state.outcome = 'failed';
      } else if ([...this.state.mobs.values()].every((m) => m.hp <= 0)) {
        this.state.outcome = 'complete';
      }
      if (this.state.outcome !== 'active') {
        this.state.projectiles.clear();
        for (const player of this.state.players.values()) {
          player.chargeStartedAt = -1;
        }
      }
    }
  }
  usePotion(id: string): void {
    const player = this.state.players.get(id);
    if (
      this.state.outcome !== 'active' ||
      !player?.connected ||
      player.hp <= 0 ||
      player.hp >= RULES.playerHealth ||
      player.potions <= 0 ||
      this.state.elapsed < player.nextPotionAt
    ) {
      return;
    }
    player.potions--;
    player.hp = Math.min(RULES.playerHealth, player.hp + POTIONS.heal);
    player.nextPotionAt = this.state.elapsed + POTIONS.cooldownMs;
  }
  applyInput(id: string, input: Intent, dt: number): void {
    const player = this.state.players.get(id);
    if (this.state.outcome === 'failed' || !player || !player.connected || player.hp <= 0) {
      return;
    }
    movePlayer(player, input, dt, this.map.obstacles);
    if (this.state.outcome === 'active') {
      this.combat.attack(id, player, input);
    }
  }
}
