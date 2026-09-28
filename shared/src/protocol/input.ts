import { parseMode, type ExpeditionMode } from '../world/expedition.js';
import { parseLoadout } from '../inventory/loadout.js';
import type { Loadout } from '../inventory/items.js';
import { parseMapId, type MapId } from '../world/map.js';
import { parseSkinId } from '../profiles/skin.js';
import { parseClass, type CharacterClass } from '../profiles/account.js';
import { schema, t, type SchemaType } from '@colyseus/schema';
export interface Intent {
  moveX: number;
  moveY: number;
  aim: number;
  fire: boolean;
  special: boolean;
  dash?: boolean;
  cancelFire?: boolean;
}
export interface JoinOptions {
  characterClass: CharacterClass;
  skinId?: string;
  loadout?: Loadout;
}
export interface RoomOptions {
  visibility: 'public' | 'invite';
  mapId: MapId;
  mode: ExpeditionMode;
}
export const MoveInput = schema(
  {
    moveX: t.float64().default(0),
    moveY: t.float64().default(0),
    aim: t.float64().default(0),
    fire: t.boolean().default(false),
    special: t.boolean().default(false),
    dash: t.boolean().default(false),
    cancelFire: t.boolean().default(false),
  },
  'MoveInput',
);
export type MoveInput = SchemaType<typeof MoveInput>;
export function sanitizeInput(input: Intent): void {
  input.moveX = Number.isFinite(input.moveX) ? Math.max(-1, Math.min(1, input.moveX)) : 0;
  input.moveY = Number.isFinite(input.moveY) ? Math.max(-1, Math.min(1, input.moveY)) : 0;
  input.aim = Number.isFinite(input.aim) ? Math.atan2(Math.sin(input.aim), Math.cos(input.aim)) : 0;
  input.fire = input.fire === true;
  input.special = input.special === true;
  if (input.dash !== undefined) {
    input.dash = input.dash === true;
  }
  if (input.cancelFire !== undefined) {
    input.cancelFire = input.cancelFire === true;
  }
}
export function parseRoomOptions(value: unknown): RoomOptions {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid room options.');
  }
  const options = value as Record<string, unknown>;
  if (options.visibility !== 'public' && options.visibility !== 'invite') {
    throw new Error('Choose public or invite visibility.');
  }
  return {
    visibility: options.visibility,
    mapId: parseMapId(options.mapId === undefined ? 'desert' : options.mapId),
    mode: parseMode(options.mode),
  };
}

export function parseJoinOptions(value: unknown): JoinOptions {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Choose a class before joining.');
  }
  const raw = value as Record<string, unknown>;
  return {
    characterClass: parseClass(raw.characterClass),
    ...(raw.loadout === undefined ? {} : { loadout: parseLoadout(raw.loadout) }),
    ...(raw.skinId === undefined ? {} : { skinId: parseSkinId(raw.skinId) }),
  };
}
