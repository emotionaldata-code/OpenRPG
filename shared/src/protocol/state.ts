import { schema, t, type SchemaType } from '@colyseus/schema';
import { ENEMY_RULES } from '../world/enemies.js';
import { RULES } from '../config.js';
// Only synchronized data belongs here; transient timers/caches stay with their owner.
export const Player = schema(
  {
    name: t.string(),
    skinId: t.string().default(''),
    characterClass: t.string().default('archer'),
    x: t.float64(),
    y: t.float64(),
    aim: t.float64().default(0),
    hp: t.number().default(RULES.playerHealth),
    connected: t.boolean().default(true),
    ready: t.boolean().default(false),
    weapon: t.string().default(''),
    armor: t.string().default(''),
    potions: t.uint8().default(0),
    nextPotionAt: t.number().default(0),
    lootNotice: t.string().default(''),
    lootAt: t.number().default(-10000),
    lastAttackAt: t.number().default(-1),
    lastAttackMultiplier: t.float32().default(0),
    nextSpecialAt: t.number().default(0),
    movementAt: t.number().default(0),
    nextDashAt: t.number().default(0),
    dashRemaining: t.number().default(0),
    dashAngle: t.float64().default(0),
    stunnedUntil: t.number().default(0),
    invulnerableUntil: t.number().default(0),
    chargeStartedAt: t.number().default(-1),
    sweepAt: t.number().default(-1000),
    sweepX: t.float64().default(0),
    sweepY: t.float64().default(0),
    sweepAngle: t.float64().default(0),
    respawnAt: t.number().default(0),
    protectedUntil: t.number(),
    generation: t.uint32().default(0),
    kills: t.uint32().default(0),
  },
  'Player',
);
export type Player = SchemaType<typeof Player>;
export const Mob = schema(
  {
    role: t.string().default('ranged'),
    species: t.string().default(''),
    attackAt: t.number().default(0),
    attackStartedAt: t.number().default(0),
    attackX: t.float64().default(0),
    attackY: t.float64().default(0),
    targetX: t.float64().default(0),
    targetY: t.float64().default(0),
    enraged: t.boolean().default(false),
    engaged: t.boolean().default(false),
    stunnedUntil: t.number().default(0),
    attackAngle: t.float64().default(0),
    attackKind: t.string().default(''),
    lastAttackAt: t.number().default(-1000),
    x: t.float64(),
    y: t.float64(),
    aim: t.float64().default(0),
    hp: t.number().default(ENEMY_RULES.ranged.health),
    respawnAt: t.number().default(0),
    generation: t.uint32().default(0),
  },
  'Mob',
);
export type Mob = SchemaType<typeof Mob>;
export const Projectile = schema(
  {
    x: t.float64(),
    y: t.float64(),
    angle: t.float64(),
    kind: t.string(),
    owner: t.string(),
  },
  'Projectile',
);
export type Projectile = SchemaType<typeof Projectile>;
export const LootDrop = schema(
  {
    owner: t.string(),
    itemId: t.string(),
    quantity: t.uint16(),
    x: t.float64(),
    y: t.float64(),
    availableAt: t.number(),
    expiresAt: t.number(),
  },
  'LootDrop',
);
export type LootDrop = SchemaType<typeof LootDrop>;
export const WorldState = schema(
  {
    drops: t.map(LootDrop),
    players: t.map(Player),
    mobs: t.map(Mob),
    projectiles: t.map(Projectile),
    mode: t.string().default('testing'),
    outcome: t.string().default('active'),
    saveStatus: t.string().default('saved'),
    mapId: t.string().default('forest'),
    elapsed: t.number().default(0),
    visibility: t.string().default('public'),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;
