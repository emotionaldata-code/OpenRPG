import { RULES } from '../config.js';
import { moveBody } from './collision.js';
import { OBSTACLES, type Rect } from './map.js';
import type { Intent } from '../protocol/input.js';
export interface MovingPlayer {
  x: number;
  y: number;
  hp: number;
  connected: boolean;
  aim: number;
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
  moveBody(
    player,
    (input.moveX / length) * RULES.playerSpeed * dt,
    (input.moveY / length) * RULES.playerSpeed * dt,
    RULES.playerRadius,
    walls,
  );
  player.aim = input.aim;
}
