import { RULES } from './config.js';
import { moveBody } from './collision.js';
import type { Intent } from './input.js';
export interface MovingPlayer { x: number; y: number; hp: number; connected: boolean; aim: number }
export function movePlayer(player: MovingPlayer, input: Intent, dt: number): void {
  if (player.hp <= 0 || !player.connected) return;
  const length = Math.max(1, Math.hypot(input.moveX, input.moveY));
  moveBody(player, input.moveX / length * RULES.playerSpeed * dt, input.moveY / length * RULES.playerSpeed * dt, RULES.playerRadius);
  player.aim = input.aim;
}
