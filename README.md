# OpenRPG — The Verdant Watch

A guest-only cooperative combat prototype for up to three players in a desktop browser. Enter a woodland ruin, move with WASD or arrow keys, aim with the mouse, and hold the left mouse button to fire. Four hostile mages patrol the ruins and fight nearby adventurers.

## Run locally

Requires Node.js 22.12+ and npm 10+.

```sh
npm ci
npm run dev
```

Open http://localhost:5173 in up to three browser sessions. The Colyseus server runs on port 2567. Create a public expedition, browse public rooms, or create an invite room and share its link. A room ID grants access to an invite room. Rooms are ephemeral and disappear when empty.

```sh
npm run build       # shared, server, and client production builds
npm run typecheck   # all TypeScript packages
npm test            # deterministic simulation and real-server integration tests
npx playwright install chromium # one-time browser test setup
npm run test:browser # desktop browser acceptance tests
```

The root development command builds shared code before starting its compiler watcher, Vite, and the server. The root `package-lock.json` locks all three workspaces. Use `VITE_SERVER_URL` to override the browser's WebSocket endpoint; `PORT` overrides the server port. This is a local prototype, with no deployment infrastructure.

## Playing

- WASD / arrow keys: move. Mouse: aim. Left click / hold: shoot.
- Trees, stone walls, and map edges stop movement and shots. Players neither block nor hurt teammates.
- Defeated players return after three seconds with brief protection. Mages return after eight seconds.
- The camera follows you. The HUD shows health, party, and room information. Copy invite shares this room; Leave returns to the lobby.
- Controls clear when focus is lost. A dropped connection pauses input and allows 15 seconds to recover, then returns to the lobby.

## Module ownership and networking

`shared/` owns the authored map, balance constants, input contracts, synchronized schema, collision geometry, and deterministic movement. It compiles to JavaScript and declarations. It uses no Phaser or DOM APIs.

`server/` owns room lifecycle and the authoritative simulation: input validation, movement, AI, cooldowns, projectiles, damage, deaths, and respawns. Each room has an isolated simulation, a maximum of three players, a 30 Hz fixed step, and a 50 ms patch interval. Public discovery uses Colyseus's built-in lobby; invite rooms use its private setting.

`client/` owns the HTML/CSS lobby and Phaser rendering, generated pixel art, input sampling, local prediction, and remote interpolation. Colyseus prediction acknowledges inputs and replays pending movement against authoritative state. Local terrain collisions use the shared movement function. Remote entities use a 100 ms interpolation buffer; respawns snap. Projectiles and damage remain authoritative. Development diagnostics expose latency and reconciliation drift. Add `?debug=1` to enable the Colyseus SDK panel.

Inputs carry movement, aim, and fire intent, never positions or hit results. Server processing is bounded to one input per player per fixed step with bounded queues. Swept collision detects projectile impacts between steps. Reconciliation performs movement only, avoiding repeated presentation effects.

## Verification and limitations

Unit tests cover movement normalization, walls, corners, boundaries, swept projectile collision, cooldowns, respawns, input sanitation, flooding, and prediction/replay. Integration tests use real Colyseus rooms to cover isolation, discovery/privacy, capacity, leave/reconnect, and authoritative combat. Browser tests exercise three sessions and delayed/jittered network traffic. See [verification results](docs/verification.md) for the recorded results and reproducible checks.

Browser verification targets Chromium; Firefox and Safari have not been tested.

Original placeholder pixel textures and directional sprite frames are generated in Canvas. There are no external art assets. Desktop keyboard/mouse only; no touch controls or audio. There is one map and one enemy type. No projectile prediction, historical hit rewinding, persistent progression, or production security/operations layer.

For file-level ownership and future boundaries, see [architecture notes](docs/architecture.md).

## Long-term RPG vision (not implemented)

Each story will be an independent instance of the same authored world with saved progression and up to three players. Accounts will own characters and inventories. Story ownership and guest access will be distinct from temporary room connections. Future content includes levels, bosses, loot, equipment, and progression.

A future browser skin editor will provide a standard sprite/animation template, preview, validation, publishing, and shop discovery. Cosmetics will remain separate from gameplay hitboxes and stats. Persistence, asset storage, and moderation arrive with that feature.

Accounts, databases, saved stories, inventory, loot, bosses, editor, shop, payments, chat, and deployment infrastructure are deliberately outside this prototype.

## Upstream foundations

Scaffolded with the official [Phaser Vite + TypeScript flow](https://docs.phaser.io/phaser/getting-started/installation) and [Colyseus application generator](https://docs.colyseus.io/getting-started). Networking follows [Colyseus client prediction](https://docs.colyseus.io/netcode/client-prediction). Repository-local agent skills come from [phaserjs/phaser](https://github.com/phaserjs/phaser/tree/master/skills) and [colyseus/skill](https://github.com/colyseus/skill); their bundled references and licenses are retained.

Repository-local Phaser and Colyseus agent skills are installed under `.agents/skills` and available on subsequent agent turns.
