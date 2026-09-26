# Prototype boundaries and future RPG model

## Implemented ownership

| Module | Owns |
| --- | --- |
| `shared/src/map.ts` | One authored world, collision rectangles, paths, safe player and mob spawns |
| `shared/src/config.ts` | Tick/patch rates, room limits, speeds, health, cooldowns, damage, respawn and protection durations |
| `shared/src/input.ts`, `state.ts` | Input schema, validated room options, synchronized entities |
| `shared/src/collision.ts`, `movement.ts` | DOM-free deterministic movement, wall sliding, swept collision |
| `server/src/rooms/Expedition.ts` | Colyseus room lifecycle, bounded input channels, one input per fixed tick, reconnection |
| `server/src/simulation/world.ts` | Isolated authoritative room simulation, AI, combat, timers |
| `client/src/main.ts` | Guest lobby, room discovery, joins/invites, HUD and session lifecycle |
| `client/src/network.ts` | Colyseus prediction, remote interpolation, resets and development telemetry |
| `client/src/scene.ts`, `controls.ts`, `art.ts` | Rendering, camera/input, original generated pixel art |

Colyseus consumes one sanitized input per living connection per 30 Hz simulation step. Missing inputs cause no player movement; world timers and AI continue. A channel retains at most eight inputs. Overflow discards oldest inputs using the SDK's acknowledged drop semantics; it never simulates a burst in a single step. The 120-message/second cap disconnects flooding clients. Projectiles start at the owner center so a muzzle offset cannot bypass adjacent walls. Earliest swept collisions resolve terrain before an equally distant target. Collision footprints are axis-aligned squares, independent of the artwork.

State patches arrive every 50 ms. The local reconciler mirrors authoritative scalars and runs only the shared movement function. It replays pending input after acknowledgments and corrections. Remote players, mages, and projectiles are interpolated 100 ms behind the snapshot stream. Death/respawn generations reset prediction and interpolation; no combat or presentation events execute during replay. Disconnects stop input sends and clear held controls. The SDK resets the input epoch on reconnect; a fixed 15-second UI deadline bounds recovery even if retries repeatedly fail.

SDK 0.18's browser offline handler iterates a listener list that changes as sockets close. The gameplay connection also handles the offline event explicitly so a simultaneous lobby disconnect cannot leave movement running. Leaving during recovery disables further retries and closes any already-scheduled successful reconnect. Empty gameplay rooms dispose once the last active or reserved reconnecting seat is gone.

## Future story instances — not implemented

Every story is an independent instance of the same authored world. Each will save its own progression and allow up to three players. An ephemeral Colyseus room is a live connection/simulation container, not a story record, character, account, or ownership grant.

Accounts will own characters and their inventories. Story ownership and guest access require durable identity and separate authorization. Joining with a room ID currently grants only temporary entry; it does not establish that future ownership model.

Future game content includes levels, bosses, loot, equipment, and progression. Add durable story/character models and explicit save/load boundaries when that work begins. The prototype deliberately has no database or persistence abstraction.

## Future skin editor and discovery — not implemented

A browser editor will offer a standard sprite and animation template, live preview, validation, publishing, and shop discovery. A cosmetic asset can change appearance only: collision footprints, combat stats, movement, and server authority remain independent of skins.

Asset storage, persistence, publishing authorization, and moderation belong with that feature. Accounts, inventory, shop, payments, editor, chat, and deployment infrastructure are outside this prototype.
