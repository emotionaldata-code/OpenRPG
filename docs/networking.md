# Networking and authority

[Documentation index](README.md) · [Tests](testing.md)

## Source map

| Source                                                           | Responsibility                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `shared/src/config.ts`                                           | Tick, patch, interpolation, queue and reconnect limits            |
| `shared/src/protocol/input.ts`                                   | `Intent`, `MoveInput`, input sanitation, join/create parsers      |
| `shared/src/protocol/state.ts`                                   | Public expedition schemas                                         |
| `server/src/rooms/Expedition.ts`                                 | Admission, input consumption, lifecycle, simulation/reward wiring |
| `client/src/game/network.ts`                                     | SDK prediction/reconciliation, interpolation and resets           |
| `client/src/game/controls.ts`                                    | Keyboard/pointer intent and cancellation                          |
| `shared/src/village/village.ts`, `client/src/village/network.ts` | Village schema/geometry and movement networking                   |

## Input to frame

1. Controls produce movement, aim and held attack intent. Mouse aim uses world coordinates relative to the camera. The client never sends authoritative positions, damage or hit results.
2. Colyseus prediction schedules 30 Hz inputs. The server sanitizes values and consumes at most one queued input per connected player per tick; extra messages cannot grant extra movement or attacks.
3. Movement calls the same deterministic function and selected terrain on both sides. Server world timers, AI and combat advance once per step. A missing input does not move that player.
4. Authoritative state is patched every 50 ms with input acknowledgments. The local reconciler corrects movement and replays pending inputs. It tracks `x`, `y`, `aim`, `hp`, `connected`; it never replays damage, sound, loot or database writes.
5. Other players, mobs and projectiles render with a 100 ms interpolation buffer. Local aiming/charge feedback is immediate; projectile creation and damage wait for server confirmation.

The input queue retains at most eight commands; overflow acknowledges discarded commands rather than simulating a burst. The 120-message/second cap disconnects flooding clients. Keep these bounds when adding input types.

## Lifetime and recovery

`onDrop` marks the player disconnected, cancels charge and permits 15 seconds of SDK recovery. `onReconnect` revalidates the session and restores the existing player; it must not recreate the loadout or spend potions. `onLeave` owns final player cleanup. Room timers handle expiry; logout/deletion revokes seats in this process.

The client stops input while disconnected, clears held controls on blur and resets prediction on recovery. Death/respawn signatures reset interpolation, so a new life snaps instead of sliding across the map. Keep the explicit browser-offline handler: multiple SDK connections can otherwise interfere during offline handling.

Leaving during recovery disables retries and closes a late reconnect. Scene shutdown and game destruction both release listeners/caches. Empty rooms dispose after active and reconnect-reserved seats are gone.

## Changing a contract

- Add a typed field/parser in shared code; validate every untrusted request on the server. TypeScript alone does not validate network payloads.
- Keep AI paths, pending attack continuations and credentials out of schemas. Broadcast only presentation-relevant state; schema classes must stay within Colyseus's 63-field limit.
- Update local prediction only for new deterministic movement behavior, using the same inputs and geometry as the server.
- Build shared and update client/server together; do not assume old open clients understand a changed schema.
- Test malformed/flooded inputs, replay against corrections, respawns and recovery. Use `?debug=1` and development diagnostics to inspect RTT/drift; test delayed traffic before changing buffer/tick rates.

Public expedition discovery uses Colyseus's lobby; invite rooms use its private setting. Both still enforce authentication, three-player capacity and Story admission. Village membership does not restrict expedition joining.
