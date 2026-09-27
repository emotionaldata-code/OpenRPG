# Rendering, skins and audio

[Documentation index](README.md) · [Extension recipes](extending.md)

## Ownership

| Path under `client/src/`                    | Responsibility                                                        |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `game/scene.ts`, `game/views/`, `game/hud/` | Scene lifecycle, entity/effect views, DOM status                      |
| `art/`                                      | Canvas recipes, previews, icons, equipment layers and labels          |
| `features/skins/`, `game/room-skins.ts`     | Editor/wardrobe/preview; scene-owned custom texture cache             |
| `audio/`                                    | Synthesis, playback lifetime and state-derived cues                   |
| `ui/`, `styles/`                            | Shared controls and feature styling; markup is in `client/index.html` |

## Generated artwork

Terrain and character textures are generated in the browser and cached, rather than repainted pixel-by-pixel each frame. `world-art.ts` paints shared map geometry, `landmark-art.ts` paints arenas, and `enemy-art.ts` generates themed frames. Phaser positions/animates those textures. There are no external raster assets; the favicon is SVG.

`world-text.ts` supersamples labels at resolution 3 with linear filtering, independently of pixel-art filtering. Terrain collision comes from shared rectangles, never sprite pixels.

`item-art.ts` supplies DOM/Phaser icons and transparent armor/weapon layers. `EquipmentView` follows the base sprite's direction/frame without modifying default or custom skins. `LootView` draws only the local player's drops. Equipment changes appearance, never collision geometry.

## Skin contract and lifetime

Template version 1 is 24 × 28 pixels, four directions (right/down/left/up), three frames each, and at most 64 palette entries with transparent index 0. `shared/src/profiles/skin.ts` validates dimensions, names, colors, indices and nonempty frames. The editor uses the gameplay template and keeps a bounded 30-entry undo history locally.

Saves create immutable UUIDs; editing an existing design saves a copy. PostgreSQL enforces ownership and a 32-design account limit through the store's transaction. Authenticated reads allow teammate rendering, while equipping/deleting requires ownership and equipping checks class compatibility. See [persistence](persistence.md).

Rooms synchronize the design ID, not pixels. `room-skins.ts` fetches each in-use design, creates 12 textures/four animations and releases unused art. Failed loads retain default class art. Deleted designs can remain in an existing scene cache; later loads fall back. Protect async loads against the actor/scene disappearing. Changing the template format requires version-aware validation/storage and a compatibility plan for saved skins.

## Audio flow

| File in `client/src/audio/` | Owns                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `sounds.ts`, `music.ts`     | Typed synth recipes and menu/adventure/boss scores           |
| `synth.ts`                  | Tone/noise rendering, shared noise buffer and bounded voices |
| `audio.ts`, `audio-ui.ts`   | Context/playback lifetime, mute, focus and autoplay gestures |
| `game-audio.ts`             | Cues derived from confirmed state changes                    |

One Web Audio context serves village and adventure; Phaser audio is disabled. Page load attempts playback, then click/tap/key gestures retry if autoplay is blocked. Focus loss stops voices and suspends playback. Synth voices cap at 32, repeated cues are throttled, and music schedules only 200 ms ahead.

Combat audio compares authoritative snapshots. Initial/reconnect/unmute baselines stay silent, preventing replay of old effects. Local charging can supply immediate pitch feedback. Boss music requires a living player near a living, engaged boss; death, retreat, completion or reset returns to exploration. No audio messages or external samples are needed.

## UI and cleanup

Use feature controllers for dialogs, `ui/` for reusable controls and native focus/Escape behavior. Keep visual effects outside prediction. `main.ts` and `village/hub.ts` own room/game transitions; views should not create connections.

Scene shutdown and game destruction both release listeners, views, owned textures and combat-audio observers. Keep the shared audio context alive for the next screen. Review repeated join/leave and async completion paths whenever adding a resource.
