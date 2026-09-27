# Architecture

[Documentation index](README.md) · [Folder map and conventions](development.md)

## Package boundaries

| Package   | Owns                                                                             | Must not own                                        |
| --------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| `shared/` | Typed contracts, schemas, content catalogs, collision and deterministic movement | DOM, Phaser, HTTP or database operations            |
| `server/` | Authentication, room admission, authoritative simulation and persistence         | Rendering or trusting client damage/positions       |
| `client/` | Input intent, prediction, rendering, audio and feature dialogs                   | Authoritative combat, inventory balances or unlocks |

Client and server import compiled JavaScript and declarations through `@openrpg/shared`. Inside shared code, use direct relative imports; `shared/src/index.ts` exports its public API. Build shared first. The server runs without Phaser or a DOM.

## Entry points and runtime flow

1. `server/src/index.ts` loads configuration, applies migrations, creates the pool/stores and starts the server. `app.config.ts` wires authenticated HTTP endpoints, the lobby and room implementations.
2. `client/src/boot.ts` handles initial loading; `main.ts` composes account, preparation, wardrobe, village and expedition lifecycles.
3. Login opens a shared village. Stations reuse feature dialogs; portals browse/create/join expeditions. Successful entry leaves the village; leaving an expedition joins an available village again.
4. Each `rooms/Expedition.ts` owns its simulation, input channels, loot and reward queue. `rooms/Village.ts` owns social presence and station interactions. Rooms share service objects, never mutable combat state.
5. Inputs cross the network to the server. Authoritative state returns to client views; collected rewards go asynchronously to PostgreSQL.

```text
client controls → shared intent → server room → simulation → synchronized state
      ↓                                                        ↓
local movement prediction ← acknowledgments/corrections ← client network → views/audio
                                               simulation loot → reward queue → PostgreSQL
```

## State ownership

| Data                                                                     | Canonical owner                            | Lifetime                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| Map geometry, balance, item definitions                                  | Shared source catalogs                     | Versioned application code                               |
| HP, positions, attacks, ground drops, room outcome                       | Server room/simulation                     | Ephemeral room                                           |
| AI paths, pending bursts, authentication metadata                        | Private server objects                     | Owning room/session                                      |
| Accounts, sessions, skins, gear quantities, supplies, coins, map unlocks | PostgreSQL feature stores                  | Persistent                                               |
| Prediction history, texture caches, dialog state                         | Client controllers/views                   | Connection, scene or UI lifecycle                        |
| Selected class/loadout/skin                                              | Preparation choice, validated at admission | Fixed expedition snapshot; not saved account preferences |

Put a field in synchronized state only when clients need it. Room IDs identify temporary connections, not durable story ownership. Account IDs and session/password hashes stay out of broadcast state.

## Design rules

Use small concrete modules and explicit types. Compose stateful owners such as `Simulation`, `Combat` and `Rewards`; use functions for calculations and parsers. A new feature normally needs a catalog/rule, its authoritative implementation, a view and focused tests—not a new framework.

Keep simulation steps synchronous and bounded. Keep rendering and replay free of damage or persistence side effects. Every listener, timer, room and texture cache needs one owner and a cleanup path. See [networking](networking.md), [gameplay](gameplay.md) and [persistence](persistence.md) for the corresponding invariants.
