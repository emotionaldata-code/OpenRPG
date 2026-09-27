# Shared village

[Documentation index](README.md) · [Networking](networking.md)

`shared/src/village/village.ts` owns the authored village bounds, collision rectangles, typed station catalog, proximity helper and compact social schema. Add a station there, paint it in `client/src/village/art.ts`, then route its dialog in `hub.ts`. Building silhouettes (including roofs) supply both scenery bounds and shared collision rectangles. Static Canvas scenery is generated once per scene; animated portals and existing character/skin/gear renderers sit above it. `client/src/art/world-text.ts` supersamples world labels with their own texture filtering, leaving pixel-art textures unchanged.

`server/src/rooms/Village.ts` is an authenticated Colyseus room with up to 24 visitors. It reuses sanitized MoveInput, bounded queues, shared movement and the 30 Hz fixed-step / 50 ms patch cadence. It consumes one input per tick. Interaction requests resolve only near a catalog station and freeze movement until closing. Presence contains names, class/skin/gear IDs and a catalog activity ID, never account IDs or inventories. Appearance changes validate class, skin ownership and collected equipment; DB work happens on admission or explicit appearance changes, never during movement. Concurrent appearance requests are bounded and throttled. Session expiry/revocation, 15-second reconnection and empty-room disposal follow expedition lifecycle rules.

`client/src/village/` separates connection/dialog ownership (`hub.ts`), prediction (`network.ts`), keys (`controls.ts`), rendering (`scene.ts`) and static art (`art.ts`). Colyseus predicts/reconciles local movement and interpolates other visitors. Native dialogs pause village input, retain keyboard focus and reuse account, shop, preparation and skin features. Recovery resets prediction; blur clears held keys. Successful expedition entry leaves the village and destroys its canvas; returning joins an available village. Failed expedition entry keeps the existing village and restores the portal dialog. Login/logout switches between the auth screen and village. No new persistence, combat simulation or generalized scene framework is introduced.

## Matchmaking and lifetime

`joinOrCreate('village')` selects an available village; a full village is locked at 24 connections, and another room is created if none has capacity. Reserved reconnecting seats can temporarily occupy capacity. These rooms contain real authenticated visitors, with no fake-player population.

Village rooms stay out of expedition discovery. The built-in lobby lists public expeditions globally, so visitors in different villages can join the same expedition. Invite rooms are hidden but can be joined by ID. Expedition capacity (three), authentication and Story unlock checks still apply.

## Adding a station

1. Add its typed ID, position and interaction metadata in `shared/src/village/village.ts`.
2. For a building, define its full silhouette in `VILLAGE_BUILDINGS`; rendering and collision must use the same bounds. Keep its interaction point reachable outside the footprint.
3. Paint it in `client/src/village/art.ts`; route its dialog in `hub.ts`, reusing a feature controller where appropriate.
4. If it mutates state, validate the activity/proximity and payload on the server. Extend the appearance station allowlist only if the new station actually edits appearance.
5. Check reachability/collision in `tests/village.test.ts`, server permissions in `tests/integration.test.ts`, and walking/focus/cleanup in `tests/browser/village.spec.ts`.
