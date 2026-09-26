import { schema, t, type SchemaType } from '@colyseus/schema';
export interface Intent { moveX: number; moveY: number; aim: number; fire: boolean }
export interface RoomOptions { name: string; visibility: 'public' | 'invite' }
export const MoveInput = schema({ moveX: t.float64().default(0), moveY: t.float64().default(0), aim: t.float64().default(0), fire: t.boolean().default(false) }, 'MoveInput');
export type MoveInput = SchemaType<typeof MoveInput>;
export function sanitizeInput(input: Intent): void {
  input.moveX = Number.isFinite(input.moveX) ? Math.max(-1, Math.min(1, input.moveX)) : 0;
  input.moveY = Number.isFinite(input.moveY) ? Math.max(-1, Math.min(1, input.moveY)) : 0;
  input.aim = Number.isFinite(input.aim) ? Math.atan2(Math.sin(input.aim), Math.cos(input.aim)) : 0;
  input.fire = input.fire === true;
}
export function parseName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Choose a name (2–18 letters, numbers, spaces, or dashes).');
  const name = value.trim();
  if (!/^[\p{L}\p{N} _-]{2,18}$/u.test(name)) throw new Error('Choose a name (2–18 letters, numbers, spaces, or dashes).');
  return name;
}
export function parseRoomOptions(value: unknown): RoomOptions {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid room options.');
  const options = value as Record<string, unknown>;
  const name = parseName(options.name);
  if (options.visibility !== 'public' && options.visibility !== 'invite') throw new Error('Choose public or invite visibility.');
  return { name, visibility: options.visibility };
}
