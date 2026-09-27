# Prototype boundaries and future RPG model

## Implemented ownership

| Module | Owns |
| --- | --- |
| `shared/src/map.ts` | Five authored layouts, palettes, collision rectangles, paths and safe spawn points |
| `shared/src/config.ts` | Tick/patch rates, room limits, player movement, respawn and protection durations |
| `shared/src/input.ts`, `state.ts` | Input schema, validated room options, synchronized entities |
| `shared/src/collision.ts`, `movement.ts` | DOM-free deterministic movement, wall sliding, swept collision |
| `server/src/rooms/Expedition.ts` | Colyseus room lifecycle, bounded input channels, one input per fixed tick, reconnection |
| `server/src/auth/` | Password hashing, persisted sessions, HTTP accounts and revocation |
| `server/src/db/`, `server/migrations/` | PostgreSQL pool and versioned startup migrations |
| `shared/src/skin.ts` | Versioned pixel format, dimensions, palette bounds and validation |
| `server/src/skins/` | Owned, immutable skin records and authenticated HTTP loading/saving/deletion |
| `client/src/skin-editor.ts`, `pixel-tools.ts` | Browser workshop, bounded undo/redo and painting |
| `client/src/skin-art.ts`, `skin-preview.ts` | Class templates, pixel textures and live Phaser preview |
| `client/src/wardrobe.ts`, `room-skins.ts` | Account wardrobe, room-entry selection and per-room texture cache |
| `client/src/account.ts` | Login, registration, logout and account deletion |
| `server/src/simulation/world.ts` | Room simulation, player movement and player respawn timers |
| `server/src/simulation/combat.ts` | Class attacks, independent cooldowns, charged attacks, sword sectors and projectile sweeps, damage and immunity |
| `shared/src/enemies.ts` | Enemy roles, stats, map themes and behavior tuning |
| `server/src/simulation/enemies.ts`, `navigation.ts` | Enemy lifecycle, pursuit, patrol, telegraphs and bounded grid search |
| `client/src/world-art.ts`, `enemy-art.ts`, `map-selection.ts` | Map previews, scenery, enemy sprites and destination choice |
| `shared/src/items.ts` | Item catalog, loadout contracts, modifiers, potion limits, and story unlock order |
| `server/src/adventure/` | Relational collection/supplies/progression, authenticated reads, idempotent reward queue |
| `client/src/adventure.ts`, `tabs.ts` | Collection, expedition packing, accessible path/preparation tabs |
| `shared/src/combat.ts` | Typed class abilities, projectile sizes/speeds/damage and combat tuning |
| `client/src/charge-view.ts`, `combat-view.ts`, `combat-hud.ts` | Authoritative combat effects and local cooldown presentation |
| `client/src/class-selection.ts` | Temporary class choice for the next room entry |
| `client/src/main.ts` | Account-aware lobby, room discovery, joins/invites, HUD and session lifecycle |
| `client/src/audio/` | Original synth recipes, bounded browser playback, music, mute preference and authoritative combat cues |
| `client/src/network.ts` | Colyseus prediction, remote interpolation, resets and development telemetry |
| `client/src/scene.ts`, `controls.ts`, `art.ts` | Rendering, camera/input, original generated pixel art |

Colyseus consumes one sanitized input per living connection per 30 Hz simulation step. Missing inputs cause no player movement; world timers and AI continue. A channel retains at most eight inputs. Overflow discards oldest inputs using the SDK's acknowledged drop semantics; it never simulates a burst in a single step. The 120-message/second cap disconnects flooding clients. Projectiles start at the owner center so a muzzle offset cannot bypass adjacent walls. Earliest swept collisions resolve terrain before an equally distant target. Collision footprints are axis-aligned squares, independent of the artwork.

State patches arrive every 50 ms. The local reconciler mirrors movement fields (`x`, `y`, `aim`, `hp`, `connected`) and runs only the shared movement function. It replays pending input after acknowledgments and corrections. Remote players, enemies, and projectiles are interpolated 100 ms behind the snapshot stream. Death/respawn generations reset prediction and interpolation; no combat or presentation events execute during replay. Disconnects stop input sends and clear held controls. The SDK resets the input epoch on reconnect; a fixed 15-second UI deadline bounds recovery even if retries repeatedly fail.

SDK 0.18's browser offline handler iterates a listener list that changes as sockets close. The gameplay connection also handles the offline event explicitly so a simultaneous lobby disconnect cannot leave movement running. Leaving during recovery disables further retries and closes any already-scheduled successful reconnect. Empty gameplay rooms dispose once the last active or reserved reconnecting seat is gone.

## Future story instances — not implemented

Every story is an independent instance of the same authored world. Each will save its own progression and allow up to three players. An ephemeral Colyseus room is a live connection/simulation container, not a story record, character, account, or ownership grant.

Persisted accounts currently own their username, credentials, skins, collected equipment, potion storage, coins, and sequential map unlocks. Future character-specific inventories can reference the same account identity. Story ownership and guest access require durable identity and separate authorization. Joining with a room ID currently grants only temporary entry; it does not establish that future ownership model.

Future game content includes persistent levels, richer boss encounters, and deeper equipment/progression. Add durable story/character models and explicit save/load boundaries when that work begins. PostgreSQL currently persists accounts, sessions, skins, account equipment, supplies, map unlocks and reward receipts. UUID foreign keys provide the extension point; combat and room state remain in memory.

## Skin ownership and rendering

The editor starts from the same 24 × 28 generated class frames used in gameplay. Template version 1 fixes four directions (right, down, left, up), three frames per direction and a palette of up to 64 entries including transparent index 0. Shared validation rejects malformed dimensions, colors, pixel indices, empty frames, names and versions. Editing and the 30-entry undo/redo history are browser-local.

`skins` has an account foreign key with cascade deletion and bounded palette/frame JSON. Saves create immutable UUIDs; loading an existing design edits a copy. A per-account row lock enforces the 32-design limit even for concurrent saves. HTTP writes require the configured origin, JSON, a valid session and a body below 40 KB; requests are rate limited. Readable artwork contains no account or session identifiers. Signed-in players can retrieve a design by ID for teammate rendering; only its owner can equip it, and only with its class. Owner-scoped deletion removes the row, frees capacity and returns 404 for missing or other players’ designs. The wardrobe clears a deleted local selection and retains the independent editor draft.

Room authentication and join validate the selected skin. State synchronizes its UUID alongside the class. Each scene fetches artwork once while in use, creates 12 small textures and four animations, and removes unused textures when players leave. Late joins load the same immutable design; reconnects retain cached textures and the selected ID. Failed loads keep original class art. If a skin is deleted from another tab during gameplay, existing cached art lasts for that room, while new fetches fall back to class art; no combat tick or room-lifecycle work is added. No skin data enters prediction, combat rules or collision calculations.

Publishing, shop discovery, overwriting saved skins, import/export and moderation remain future work. No asset service or additional infrastructure is needed for this bounded first editor.

## Account authority

Static Colyseus authentication verifies the opaque session cookie before room creation/seat reservation. Join rechecks the session and uses its saved username, ignoring client-supplied identity. The requested class is validated separately against Archer/Mage/Warrior and captured in room state only. Room state synchronizes public gameplay data (name, class, skin, equipped gear, carried potions), never password/session hashes or account IDs. Reconnect rechecks the persisted session; a room timer expires active sessions without polling PostgreSQL. Logout/deletion notify active rooms in this server process, removing players immediately, including disconnected seats. Input processing never queries the database. Class selection is captured at join so it cannot change a running character unexpectedly.

The client API uses same-origin cookies, with a Vite `/api` proxy in development. Production serves the built client from the Colyseus HTTP server. API writes enforce the configured browser origin and JSON content type; matchmaking also validates the Origin when supplied. Parameterized SQL, case-insensitive unique usernames, Argon2id hashes and expiring hashed session tokens form the current account boundary. A single process with multiple rooms is supported; cross-process revocation/pubsub and shared rate-limit storage are future deployment work.

## UI controls

`client/src/ui.css` owns shared control styling and workshop polish. Selects keep native semantics and use CSS `base-select` where supported, with a styled control and native popup fallback elsewhere. `confirmation.ts` uses a native modal dialog for draft replacement and skin deletion, with cancel focused by default and Escape support. No component framework or runtime UI dependency is added.

## Class combat

`Simulation` composes one `Combat` per room. Inputs contain held primary/special flags plus a primary cancellation flag. The bounded queue consumes at most one command per player per 30 Hz step. Shared `updateCharge` starts on held primary, releases on false, and sets the independent normal cooldown. The server derives the charge multiplier from elapsed simulation time, never client timestamps or supplied damage. Gear modifies damage and cycle/cooldown duration. Specials retain their existing behavior.

Player state adds one charge-start timestamp (−1 means idle). A server-only map tracks the latest charge input to cancel after 500 ms of silence; blur sends cancellation, while disconnect, death, respawn and expedition completion discard charge. Cooldowns survive reconnects and respawns. No database work or additional messages run per charge tick.

Sword release checks every living mob against an 82-unit, 140° sector at the player's current position and aim, including circular hitbox edge overlap. Terrain line of sight blocks each victim independently; each can take damage once. Movement never stops. State records the sweep origin, aim and timestamp for an animated sector clipped against terrain. Projectiles still use swept box collision and authoritative damage; skins never define hitboxes.

`ChargeView` uses the same timing function for immediate cosmetic local feedback, and authoritative charge timestamps for remote rings. Local state is separate from Colyseus prediction/state; reconciliation cannot replay attacks. `CombatView` reuses its graphics object for authoritative sweep effects. The cooldown HUD shows release guidance while charging. Quick taps latch across fixed steps; overcharging stays weak until release. The server remains the final authority, so jitter near a sweet-window boundary can change the actual multiplier. No projectile prediction or historical rewind is added.


## Map content and enemy AI

Room creation validates `mapId` against the shared catalog before constructing the simulation. It is immutable room state and lobby metadata; joining clients inherit it. The layout is bundled in both packages rather than streamed every patch. Shared movement accepts the selected obstacle list, including during pending-input replay. Combat, line of sight, navigation, and rendering use that same layout. All five maps currently share world dimensions.

`shared/src/map.ts` owns authored paths, obstacles, spawn points, palettes, and landmarks. `shared/src/enemies.ts` owns three role definitions and five visual/name themes. A Testing or Story room creates four enemies (two melee, one ranged, one boss). Add new content through those definitions; add a behavior only when its mechanics differ. `client/src/world-art.ts` bakes static terrain once; `enemy-art.ts` generates only the current theme's animated sprites. User skins remain separate.

`Enemies` composes `Navigation` and `Combat`: patrol, choose a nearby living player, pursue/strafe, lock a wind-up, resolve an attack, recover. Leaving the home leash or losing a distant target returns the enemy home and heals it on arrival. Camp is marked and prevents enemy damage. Melee is a short frontal sector, slam a circle, and fan/ring attacks emit five/twelve ordinary hostile bolts. Terrain blocks all attacks; immunity and respawns share existing combat rules. Bosses have larger collision footprints and health bars.

Navigation uses direct segments first; blocked paths use a four-neighbor breadth-first search on a 48-unit static grid, cached by actor radius. Each enemy refreshes its route at most once per 600 ms. Movement and collision remain 30 Hz. The server sends attack deadlines, locked angles and attack types only when they change; the client draws warnings between patches. No behavioral framework, extra timer loop, database writes, or separate AI messages are introduced.

## Expedition rules and account collection

`mode` is immutable room state and lobby metadata. Testing keeps existing infinite respawns; Story allows no player respawn, one ordinary-enemy respawn, and no boss respawn. In Story, `Simulation` checks the four enemies after combat and ends the room when all final lives are cleared or every remaining player has died. Failed expeditions stop movement and combat. Completed expeditions stop combat but keep movement, timers and pickups active for surviving players. The room remembers participating account IDs so leaving cannot bypass Story's one-life rule. Reconnect keeps the original player object and never spends supplies again.

Fight uses the same room, input, combat and respawn pipeline. It skips constructing enemy AI/navigation and generating enemy art. A shared target iterator in `Combat` switches player attacks from mobs to other living, connected players, excluding the attacker; projectile sweeps, sword sectors, terrain and immunity checks stay authoritative. Player deaths increment the attacker’s room-local kill count without calling monster loot or story rewards. All maps are available, and three-second respawns remain unlimited. Equipment and potion admission rules are unchanged; no new schema fields, database migrations or network messages are needed.

`Adventures.embark` locks the account's adventurer row, checks the map unlock, gear ownership/class, and available potions, then deducts the packed count in one transaction. Equipment is counted per account/item; no equipped choices are saved globally. `Combat` consumes typed shared modifiers, and the cooldown HUD uses the same derived durations. A potion message has no client-supplied target, healing, or quantity; the server checks state, health, carried count and its simulation-time cooldown.

A lethal enemy hit emits one callback. `Loot` creates personal, class-specific ground drops for living connected party members. The server checks proximity, line of sight, life and connection state every fixed step. Only collection appends a write to the room’s `Rewards` queue. Drops are limited to 216 per room and expire after two minutes; collected or abandoned drops are removed. No pickup message or client-supplied reward exists. Each account/event receipt is unique, so retrying a committed-but-unacknowledged transaction cannot duplicate gear, potions or coins. Completion awards unlocks to surviving participants; sequential SQL updates prevent skipped or duplicate chapters. Clients can only request a one-unit buy/sell through the authenticated, same-origin shop endpoint. Server catalog prices and a locked adventurer row serialize trades, rewards and potion packing; balances cannot go negative. Gear stacks cap at 999, coin balances at 999,999.

The queue has one in-flight database write. The fixed loop pauses on storage error or 64 pending entries, and a five-second room timer retries. A voluntary leave requests a flush first; disposal attempts remaining writes. This bounds memory and avoids dropping confirmed loot silently during ordinary connection loss. It is an in-memory queue, so abrupt process failure or prolonged storage failure can lose pending rewards; persistent job infrastructure is intentionally not introduced. Permanent gear, potions already saved, and map unlocks survive room disposal. Reward receipts older than seven days are pruned at server startup.

## Item presentation

`item-art.ts` creates eight original Canvas icons (six gear, a potion, coins) shared across DOM and Phaser. `LootView` caches static icons and adds a small visual bob; it displays only the local player's drops. `EquipmentView` uses two transparent cached layers per player and takes the direction/frame from the base sprite. Default and immutable custom skin textures remain untouched, including when the custom skin loads asynchronously. Equipment never affects hitboxes or adds physics objects. Server room state carries item IDs only; full inventory and balances remain in PostgreSQL and the lobby HTTP profile.

### Browser audio

One Web Audio context serves menu and gameplay. Mounting the audio UI attempts autoplay unless the saved preference is muted; pointer, keyboard and page-wide click listeners retry when browser policy blocks startup. `sounds.ts` holds effect recipes; `music.ts` holds distinct 16-bar menu/adventure scores and a pure step-to-tone arranger. `Synth` owns a shared noise buffer, short-lived voices (maximum 32) and a compressed output, and `GameAudio` owns focus/mute/music/charge lifetime. Music schedules only 200 ms ahead; repeated effects have a 65 ms per-cue limit. Focus loss stops voices before suspending the context. Scene shutdown stops charging and clears its combat observer; the application retains the context for menu audio. Phaser audio remains disabled.

`CombatAudio` compares existing HP, generation, attack/potion deadlines, loot timestamps and outcomes once per state patch. Its initial snapshot, reconnection/unmute baseline and gaps over 500 ms are silent. Combat sounds never run inside prediction replay. Distant enemies are silent and nearby actors attenuate over 550 world pixels. Several same-kind events within one server patch may merge into a single cue; this intentionally avoids extra networking just for sound. The local charge ring supplies immediate charge pitch and one sweet-spot chime.
