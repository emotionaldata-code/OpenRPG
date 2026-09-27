# Simulation and gameplay

[Documentation index](README.md) · [Extension recipes](extending.md)

## Fixed-step ownership

`rooms/Expedition.ts` consumes at most one input per connected player, calls `Simulation.applyInput`, advances the world once, checks loot collection, then queues completion rewards. It pauses while admission is pending or reward storage is blocked. The step never awaits database work.

| Source under `server/src/simulation/` | Owns                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `world.ts`                            | Composition, player movement/respawns and mode outcomes                 |
| `combat.ts`                           | Player attacks, damage, projectile sweeps; steps enemy attack execution |
| `enemies.ts`                          | Enemy lifecycle, target selection, movement and attack decisions        |
| `enemy-combat.ts`                     | Attack execution and bounded multi-tick continuations                   |
| `navigation.ts`                       | Cached paths through terrain                                            |
| `loot.ts`                             | Personal ground drops and collection checks                             |

## Player combat

Shared `combat/combat.ts` defines charge timing, damage multipliers, projectile rules and abilities; `inventory/loadout.ts` applies equipment modifiers. Normal attacks have no cooldown. Held primary starts charging, release attacks, and the server derives damage from simulation time. Specials have their own cooldowns, preserved through respawn/reconnect.

Charge cancels on blur, disconnect, death, completion or 500 ms of missing charge input. The local ring gives immediate cosmetic feedback; remote rings use synchronized timestamps. Reconciliation never executes attacks. Jitter near the sweet-spot boundary can affect the server's final multiplier.

The warrior releases an 82-unit, 140° sword sector while still moving. Each eligible target is checked once, including its edge overlap and terrain line of sight. Arrow/fireball creation and all damage remain authoritative.

## Maps and AI

`shared/src/world/map.ts` combines themes with authored `routes/`, registered in `regions.ts`. Geometry is bundled in client/server, not streamed each patch. `mapId` and mode are immutable room state; joining inherits the room's choice.

`enemies.ts` contains role stats/themes; `enemy-attacks.ts` contains difficulty, rotations and warning geometry. AI patrols, pursues, flanks, strafes and returns home when leashed. Clear sight skips path search; obstructed paths refresh at most every 450 ms per mob, with walkability cached by footprint.

Warnings lock origin, target and aim during wind-up. Enrage increases movement and shortens pauses without shortening an already displayed warning. Attack continuations cancel on owner death/removal/generation changes. Enemy projectiles are capped at 192 per room; attacks add no asynchronous AI jobs or per-shot timers.

Bosses fight while guards are alive. Confirmed damage sets `engaged` for music; respawn or leash reset clears it.

## Mode rules

| Mode    | Targets       | Player lives                | Enemy lives                 | Completion                                           |
| ------- | ------------- | --------------------------- | --------------------------- | ---------------------------------------------------- |
| Testing | Mobs          | Unlimited, 3-second respawn | Unlimited, 8-second respawn | None                                                 |
| Story   | Mobs          | One per account per room    | One each, including boss    | Every enemy defeated; survivors earn the next unlock |
| Fight   | Other players | Unlimited, 3-second respawn | No mobs                     | None; room-local kills, no loot                      |

Story enemies can die in any order. Party wipe fails the run. Failure stops movement/combat; completion stops combat while survivors can collect remaining drops. Reconnect preserves the same life; leaving/rejoining cannot restore it.

## Collision and loot invariants

- Shared movement normalizes diagonals and slides axis-aligned footprints against terrain rectangles. Players do not block each other. Movement/projectile box tests use the parameter `radius` as a square half-extent.
- Projectile sweeps test the whole segment between ticks against expanded terrain/target boxes. Earliest impact wins; terrain wins ties. Shots start at actor centers so muzzle art cannot bypass walls. Skins never define hitboxes.
- A lethal mob hit emits one callback. Drops belong to living connected players; collection requires proximity, pickup delay and line of sight. Drops cap at 216, expire after two minutes and disappear when their owner leaves. Only collection queues persistence.
- Equipment is an admission snapshot. Packed potions are deducted then and never refunded/refilled on respawn; loot potions enter storage for later runs. A potion request supplies no target or amount: the server checks health, carried count and cooldown. See [persistence](persistence.md).
