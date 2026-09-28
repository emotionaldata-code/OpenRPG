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

`biomes.ts` defines the campaign order: Desert → Forest → Castle → Mountain → Paradise → Hell. Each biome has four combat stages (6, 10, 14 and 18 enemies), then one boss-only arena. `map.ts` combines palettes with authored routes. Original first-stage routes remain in their biome modules; `routes/campaign.ts` owns the additional itineraries and arenas. Geometry is bundled in client/server, not streamed each patch. The room's map and mode are immutable.

`species.ts` defines four creatures per biome, introduced cumulatively across the combat stages. Species control appearance, attack rotation, movement speed, health and detection range; the synchronized `species` ID selects the same definition on client/server. `enemies.ts` applies biome/stage difficulty, while `enemy-attacks.ts` defines attack timings and rotations. Patrols, pursuit, flanking, strafing and leashes share the existing AI. Obstructed paths refresh at most every 450 ms per mob.

| Boss | Signature | Dodge response |
| --- | --- | --- |
| Sand Lion | Sirocco spiral: three expanding, rotating rings of sand marks, between fast charges | Use the center and gaps, then sidestep the locked rush |
| Forest Deer | Wild Hunt: four successive rows of branching roots | Move between branches or behind the deer |
| Demoniac King | King's checkmate: three rotating cleaves | Move into a cleared sector before the next cleave |
| Grizzly | Mountain Breaker: three advancing avalanche walls | Dodge across a cleared row or around the wall |
| Fallen Angel | Fall from Grace: outer halo, inner blast, then a targeted fall | Start inside, move outside, then leave the final mark |
| Demon Gargoyle | Wings of Damnation: four spreading waves of fire | Move between the rays or behind the gargoyle |

`boss-attacks.ts` supplies locked geometry and wave delays for both warnings and damage. Overlapping marks deal one hit per wave. Cover, camp protection and Iron Will apply. Continuations advance inside the existing simulation step and cancel on stun, death, removal or respawn; there are no independent timers. Enrage shortens pauses, never an already displayed warning. Hostile projectiles remain capped at 192 per room.

Bosses occupy their own arenas. Confirmed damage sets `engaged` for the biome's boss music; death, retreat, respawn or leash reset returns to its travel score. Story requires every creature on each combat map, then its biome boss on the fifth stage. Testing retains unlimited respawns.

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
