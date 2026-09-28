# Simulation and gameplay

[Documentation index](README.md) · [Extension recipes](extending.md)

## Fixed-step ownership

`rooms/Expedition.ts` consumes at most one input per connected player, calls `Simulation.applyInput`, advances the world once, checks loot collection, then queues completion rewards. It pauses while admission is pending or reward storage is blocked. The step never awaits database work.

| Source under `server/src/simulation/` | Owns                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `world.ts`                            | Composition, player movement/respawns and mode outcomes                 |
| `combat.ts`                           | Player attacks, damage, projectile sweeps; steps enemy attack execution |
| `enemies.ts`                          | Enemy lifecycle, target selection, movement and attack decisions        |
| `enemy-contact.ts`                   | Movement contact, player stun and normal-mob dash reactions              |
| `enemy-combat.ts`                     | Attack execution and bounded multi-tick continuations                   |
| `navigation.ts`                       | Cached paths through terrain                                            |
| `loot.ts`                             | Personal ground drops and collection checks                             |

## Player combat

Shared `combat/combat.ts` defines charge timing, damage multipliers, projectile rules and abilities; `inventory/loadout.ts` applies equipment modifiers. Normal attacks have no cooldown. Held primary starts charging, release attacks, and the server derives damage from simulation time. Specials have their own cooldowns, preserved through respawn/reconnect. Charge progress wraps each revolution. The 65–80% window gives 1.75× damage; a fourth-power curve falls to 0.025× away from it (about 1 damage for bare quick taps). No automatic release or accumulating damage bonus. Confirmed release quality drives the perfect-shot accent and a short bad-shot cue at ≤10% of maximum damage (local shooter only). Charging uses one steady 220 Hz tone across every class and cycle, with no window chimes.

Charge cancels on stun, blur, disconnect, death, completion or 500 ms of missing charge input. The local ring gives immediate cosmetic feedback; remote rings use synchronized timestamps. Reconciliation never executes attacks. Jitter near the sweet-spot boundary can affect the server's final multiplier.

The warrior releases a 100-unit, 140° sword sector while still moving. Each eligible target is checked once, including its edge overlap and terrain line of sight. Arrow/fireball creation and all damage remain authoritative.

### Class movement and Q dodge

| Class | Speed (units/s) | Dash distance | Duration | Cooldown |
| --- | --- | --- | --- | --- |
| Warrior | 210 | 90 | 150 ms | 2.5 s |
| Archer | 180 | 120 | 180 ms | 4 s |
| Mage | 150 | 160 | 200 ms | 6 s |

Q starts one burst per press toward mouse aim, regardless of movement keys. Direction locks for the burst; terrain and world bounds still block movement. Dodging grants no immunity, so escape the warned area before impact. Charging/attacking remains available during movement. Cooldowns survive respawn/reconnect; death cancels the current burst. Holding Q does not repeat it.

`world/movement.ts` owns the typed class catalog and shared `moveFighter` step. The server seeds `movementAt` from simulation time before each input; prediction advances it from acknowledged state during replay. Reconciliation includes class, movement clock, dash angle/remaining duration and cooldown, and never creates damage or sound. Only position enters the SDK render pose, so timer corrections cannot cause snaps or pollute pixel drift. Dash travel consumes movement steps (including idle input), preserving distance through short packet gaps; disconnect/death cancels remaining travel. Village walking uses class speed; Q is an expedition control.

### Enemy contact and player stuns

`simulation/enemy-contact.ts` owns contact rules using shared `CONTACT` tuning. Walking into a living normal mob stuns the player for 1 second. Walking or dashing into a boss stuns the player for 2 seconds; dash contact never pushes or stuns bosses. Contact adds no damage, moves the player to contact then pushes them 120 units away from the enemy (terrain and world bounds apply), cancels charge/dash, and prevents movement, attacks and potion use until the synchronized deadline expires. Damage protection, including Iron will, does not prevent contact stuns. Stationary overlap, terrain-blocked contact and Fight do not trigger them.

Q contact instead pushes normal mobs 34 units and stuns them for 1 second, once per target per dash. Terrain constrains the push. This cancels their warning and any burst/rush continuation; already-fired projectiles remain live. Perfect primary hits, including sword sweeps, roll once per surviving enemy hit: 20% for a 1.5-second normal-mob stun; 7% for a 0.7-second boss stun. `PERFECT_STUN` owns these values. Projectile quality is captured at release and retained until impact. Ordinary shots and specials never stun; no shot pushes enemies. Both dash and perfect stuns share `EnemyCombat.stun`, which cancels warnings/continuations and never shortens a longer existing stun.

Players cannot be stunned again until 1.5 seconds after their stun expires, against any enemy; this grants no damage immunity and does not block Q from stunning normal mobs. Recovery uses the existing `stunnedUntil` deadline plus `CONTACT.recoveryMs`, without another synchronized field or timer. Private contact sets also require separation before another walking stun. They reset with player generation/removal; respawn clears stun. Shared movement prediction replays the player deadline without applying contact effects. Gold sparks identify stunned actors, the HUD shows “Stunned”, and the charge ring/audio stop during stun. A short impact/ringing cue plays once on the local player’s confirmed stun, without replay on reconnect or recovery. The expedition camera eases toward the knocked-back player using frame-rate-independent follow smoothing (220 ms time constant), active during stun and tapering back to direct follow over the next 300 ms. Ordinary movement retains direct camera follow; authoritative movement and the fixed HUD are unchanged.

## Maps and AI

`shared/src/world/map.ts` combines themes with authored `routes/`, registered in `regions.ts`. Geometry is bundled in client/server, not streamed each patch. `mapId` and mode are immutable room state; joining inherits the room's choice.

`enemies.ts` contains role stats/themes; `enemy-attacks.ts` contains difficulty, rotations and warning geometry. AI patrols, pursues, flanks, strafes and returns home when leashed. Clear sight skips path search; obstructed paths refresh at most every 450 ms per mob, with walkability cached by footprint.

Ordinary rotations add Castle fans, Paradise/Hell melee slams and Mountain ranged rings. Attack pauses scale by realm (Forest 0.90, Castle 0.82, Paradise 0.74, Hell 0.66, Mountain 0.58) on top of existing tier cooldowns; warning durations remain unchanged.

Each boss has one exclusive move in its rotation:

| Boss | Special | Dodge response |
| --- | --- | --- |
| Elderroot | Root grasp: three circles from the boss to the locked target | Sidestep the root line |
| Hollow King | Royal cleave: a broad 205-unit forward sector | Get behind the King or outside its reach |
| Seraph of Noon | Solar halo: a 100–210-unit annulus | Stay inside the safe center or move beyond the ring |
| Infernal Warden | Hell fissure: five circles in a cross at the locked target | Move diagonally out of the cross |
| Glacier Colossus | Avalanche: five circles across the target’s approach direction | Dodge forward/backward out of the marked wall |

`world/boss-attacks.ts` supplies the same locked areas for warnings and damage. Overlapping marks deal one hit per attack; cover, spawn protection and Iron will still apply. These are bounded, immediate attacks after wind-up, with no lingering hazards or extra timers.

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
