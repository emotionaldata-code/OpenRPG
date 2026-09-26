import { schema, t, type SchemaType } from '@colyseus/schema';
import { RULES } from './config.js';
export const Player = schema({
  name: t.string(), x: t.float64(), y: t.float64(), aim: t.float64().default(0),
  hp: t.number().default(RULES.playerHealth), connected: t.boolean().default(true),
  respawnAt: t.number().default(0), protectedUntil: t.number(), generation: t.uint32().default(0), kills: t.uint32().default(0),
}, 'Player');
export type Player = SchemaType<typeof Player>;
export const Mob = schema({
  x: t.float64(), y: t.float64(), aim: t.float64().default(0), hp: t.number().default(RULES.mobHealth),
  respawnAt: t.number().default(0), generation: t.uint32().default(0),
}, 'Mob');
export type Mob = SchemaType<typeof Mob>;
export const Projectile = schema({
  x: t.float64(), y: t.float64(), angle: t.float64(), kind: t.string(), owner: t.string(),
}, 'Projectile');
export type Projectile = SchemaType<typeof Projectile>;
export const WorldState = schema({
  players: t.map(Player), mobs: t.map(Mob), projectiles: t.map(Projectile),
  elapsed: t.number().default(0), visibility: t.string().default('public'),
}, 'WorldState');
export type WorldState = SchemaType<typeof WorldState>;
