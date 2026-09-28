# Extension recipes

[Documentation index](README.md) · [Code conventions](development.md) · [Test selection](testing.md)

Paths below are repository-relative. Prefer extending an existing catalog or owner before adding a new abstraction. Typechecking finds missing typed entries; it cannot detect forgotten hardcoded UI/art branches.

## Map or realm

1. Author a `Route` in `shared/src/world/routes/`; register it in `world/regions.ts`. Geometry, spawns and arena location belong here, not in the renderer.
2. Add the ID, description/palette and `MAPS` entry in `world/map.ts`. Add its theme/stats in `world/enemies.ts` and difficulty/rotations in `world/enemy-attacks.ts`.
3. Extend map-specific art in `client/src/art/world-art.ts`, `landmark-art.ts` and `enemy-art.ts`; check previews and `features/adventure/map-selection.ts`.
4. `MAP_IDS` also defines saved Story order. Append new realms; reordering existing IDs changes what `completedMaps` means. The DB currently constrains `completed_maps` to 0–5: add a forward migration before supporting a sixth realm, and review progression/UI limits.
5. Test every spawn and route with player and boss footprints, walls blocking shots, and Story admission/completion. See `tests/maps.test.ts`, `enemy-tactics.test.ts`, `adventure.test.ts` and `integration.test.ts`.

Decorative paths do not create walkable space; shared obstacles define collision. Wider art does not automatically enlarge the hitbox.

## Mob or boss attack

For another appearance/rotation of an existing role, edit shared theme/encounter data and map spawns. For a genuinely new role, extend `EnemyRole` and inspect role parsers, stat fallbacks, targeting, loot and sprite branches; several currently distinguish exactly melee/ranged/boss.

Boss area specials share geometry in `world/boss-attacks.ts`; extend that function for new marked shapes. For a new attack, extend `EnemyAttack` and pattern geometry in `shared/src/world/enemy-attacks.ts`, choose it in `server/src/simulation/enemies.ts`, execute it in `enemy-combat.ts`, and draw matching warnings in `client/src/game/views/combat-view.ts`. Keep warned origin/target fixed during wind-up. Bound multi-tick continuations; cancel on owner death/removal/generation change. Test terrain, immunity, cancellation and projectile budgets.

## Player ability or class

Tune class speeds/dodges in `shared/src/world/movement.ts`; keep the shared movement step and `movementState` consistent with prediction. Tune existing abilities in `shared/src/combat/combat.ts`; implement behavior in `server/src/simulation/combat.ts`. Update controls only for new intent, and shared schema only for state clients need. Update charge/effect views, HUD and audio together. Tune player contact push/stun/recovery and normal-mob dash push/stun in `CONTACT`; `simulation/enemy-contact.ts` owns contact history and reactions. `PERFECT_STUN` tunes primary-hit chances/durations; `Combat` carries release quality to impact and rolls server-side. `EnemyCombat.stun` cancels warnings/continuations for both sources. Q never stuns bosses; perfect primary hits can. Ordinary shots and specials never stun. Test looping charge/cancellation, damage, terrain, stun interruption/expiry, specials and Fight targets.

A new class also touches `profiles/account.ts`, equipment/loadout rules, class-selection markup/controller, default skin generation and art. Add a migration for the skin table's class constraint. Search existing class branches: current defaults often fall back to Archer/Warrior. Keep the selected class out of the account row; it is validated at room admission.

## Item or modifier

1. Add a stable ID, slot, class, description and prices to `shared/src/inventory/items.ts`; adjust `loot.ts` or `shop.ts` if distribution changes. Current loot grants every matching class/slot item, so adding gear also changes drops unless you revise that rule.
2. Derive new modifiers in `inventory/loadout.ts`, then consume them in authoritative combat and the HUD. Never infer stats from rendered equipment.
3. Add icon/overlay art in `client/src/art/item-art.ts`; check `game/views/equipment-view.ts`, collection and shop presentation. Current art has item-ID branches, so a new ID needs visual review.
4. Gear quantities already persist by item ID. A normal catalog addition needs no table; a new persisted property does. Keep saved IDs stable or migrate them.
5. Test ownership/class rejection, duplicate stacks, concurrent buy/sell, reward retries and default/custom-skin overlays.

## Village, UI or sound

Follow [village station steps](village.md#adding-a-station) for a new interaction point. Place feature UI in `client/src/features/<feature>/`, shared controls in `ui/`, and styles in the feature stylesheet. Wire lifecycle in `main.ts` or `village/hub.ts`; preserve dialog focus, Escape and input freezing.

For an effect, add a typed recipe in `audio/sounds.ts` and trigger it from a UI action or confirmed state change in `audio/game-audio.ts`. Music belongs in `audio/music.ts`. See [presentation](presentation.md) for caching and cleanup; never play a cue during reconciliation.

## New saved feature

Follow [persistence](persistence.md#adding-persistent-data): migration → store/transaction → authenticated HTTP boundary → typed client UI. Use the room only when the feature needs live shared simulation. Add future characters/stories as durable models with explicit ownership; do not turn a room ID into a save ID.
