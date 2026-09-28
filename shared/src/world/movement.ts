import { RULES } from '../config.js';
import { moveBody } from './collision.js';
import { OBSTACLES, type Rect } from './map.js';
import type { Intent } from '../protocol/input.js';
import type { CharacterClass } from '../profiles/account.js';

interface ClassMovement {
  speed: number;
  dash: { name: string; distance: number; durationMs: number; cooldownMs: number };
}
export const CLASS_MOVEMENT: Readonly<Record<CharacterClass, ClassMovement>> = {
  warrior: {
    speed: 210,
    dash: { name: 'Quickstep', distance: 90, durationMs: 150, cooldownMs: 2500 },
  },
  archer: {
    speed: 180,
    dash: { name: 'Evasion', distance: 120, durationMs: 180, cooldownMs: 4000 },
  },
  mage: {
    speed: 150,
    dash: { name: 'Arcane dash', distance: 160, durationMs: 200, cooldownMs: 6000 },
  },
};
export function classMovement(kind: string): ClassMovement {
  return CLASS_MOVEMENT[kind === 'warrior' || kind === 'mage' ? kind : 'archer'];
}
export interface MovingPlayer {
  x: number;
  y: number;
  hp: number;
  connected: boolean;
  aim: number;
  characterClass?: string;
}
export function movePlayer(
  player: MovingPlayer,
  input: Intent,
  dt: number,
  walls: readonly Rect[] = OBSTACLES,
): void {
  if (player.hp <= 0 || !player.connected) {
    return;
  }
  // Normalize diagonals identically during server simulation and client input replay.
  const length = Math.max(1, Math.hypot(input.moveX, input.moveY));
  const speed = player.characterClass
    ? classMovement(player.characterClass).speed
    : RULES.playerSpeed;
  moveBody(
    player,
    (input.moveX / length) * speed * dt,
    (input.moveY / length) * speed * dt,
    RULES.playerRadius,
    walls,
  );
  player.aim = input.aim;
}

export interface FighterMovement extends MovingPlayer {
  characterClass: string;
  movementAt: number;
  nextDashAt: number;
  dashRemaining: number;
  dashAngle: number;
  stunnedUntil: number;
}
/** Copy schema accessors into a plain replay state; never mutate decoded server state. */
export function movementState(p: FighterMovement): FighterMovement {
  return {
    x: p.x,
    y: p.y,
    aim: p.aim,
    hp: p.hp,
    connected: p.connected,
    characterClass: p.characterClass,
    movementAt: p.movementAt,
    nextDashAt: p.nextDashAt,
    dashRemaining: p.dashRemaining,
    dashAngle: p.dashAngle,
    stunnedUntil: p.stunnedUntil,
  };
}

/** Movement only: identical on the server and during prediction/replay. */
export function moveFighter(
  player: FighterMovement,
  input: Intent,
  dt: number,
  walls: readonly Rect[],
): void {
  if (player.hp <= 0 || !player.connected) {
    return;
  }
  const now = player.movementAt;
  if (now < player.stunnedUntil) {
    player.aim = input.aim;
    player.dashRemaining = 0;
    player.movementAt += dt * 1000;
    return;
  }
  const { dash } = classMovement(player.characterClass);
  if (input.dash && now >= player.nextDashAt) {
    player.dashAngle = input.aim;
    player.dashRemaining = dash.durationMs;
    player.nextDashAt = now + dash.cooldownMs;
  }
  const dashMs = Math.max(0, Math.min(dt * 1000, player.dashRemaining));
  if (dashMs > 0) {
    const distance = (dash.distance * dashMs) / dash.durationMs;
    moveBody(
      player,
      Math.cos(player.dashAngle) * distance,
      Math.sin(player.dashAngle) * distance,
      RULES.playerRadius,
      walls,
    );
  }
  player.dashRemaining = Math.max(0, player.dashRemaining - dashMs);
  movePlayer(player, input, dt - dashMs / 1000, walls);
  player.movementAt += dt * 1000;
}
