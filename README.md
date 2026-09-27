# OpenRPG — Five Realms

An account-based cooperative and PvP combat prototype for up to three players in a desktop browser. Choose Forest, Castle, Paradise, Hell, or Mountain, move with WASD or arrow keys, aim with the mouse, and hold the left mouse button to charge and release to attack; right click activates your special. Each destination has its own layout and themed melee, ranged, and boss enemies. Testing offers unlimited respawns; Story unlocks each realm in order with one life per player. Fight opens every map for player-versus-player combat without monsters and with unlimited respawns. Permanent loot, class equipment, and packed health potions carry the first progression loop.

## Run locally

For step-by-step setup, testing a compiled build, multiplayer checks and troubleshooting, see [Local setup and testing](README.local.md).

Requires Node.js 22.13+ (22.x) or 24+, npm 10+, and Docker Compose.

```sh
npm ci
cp .env.local.example .env.local
npm run db:up       # PostgreSQL 17 on localhost:5433, persistent Docker volume
npm run dev        # applies pending migrations before listening
```

Open http://localhost:5173. Register with a username and password to enter Hearthwick, the shared Base Village. Walk with WASD/arrows and press E near a building or portal. Use separate browser profiles/incognito contexts for different accounts; ordinary tabs share a login. The Colyseus server runs on port 2567. Create a public expedition, browse public rooms, or create an invite room and share its link. A room ID grants access to an invite room. Rooms are ephemeral and disappear when empty.

```sh
npm run build       # shared, server, and client production builds
npm run typecheck   # all TypeScript packages
npm run lint        # ESLint across source, tests and scripts
npm run format      # Prettier for TypeScript, HTML, CSS and JSON
npm run check       # lint + formatting + types + tests + build
npm test            # simulation + PostgreSQL/account + real-server integration tests (DB must be running)
npx playwright install chromium # one-time browser test setup
npm run test:browser # desktop browser acceptance tests
```

The root development command builds shared code before starting its compiler watcher, Vite, and the server. The root `package-lock.json` locks all three workspaces. Use `VITE_SERVER_URL` to override the browser's WebSocket endpoint; `PORT` overrides the server port. Production serves the built client and API from the same origin. The Vite development server proxies `/api` to port 2567. Keep the browser host consistent with `APP_ORIGIN` (localhost and 127.0.0.1 are different origins).

## Accounts and class selection

Usernames (3–18 ASCII letters, digits, `_` or `-`) are unique ignoring case and appear above your character and in the party HUD. Passwords are 8–128 characters and are stored as Argon2id hashes. No email or password recovery is implemented. Login persists for seven days in an HttpOnly, SameSite=Strict cookie (Secure in production); only a hash of its random token is stored in PostgreSQL. Logout revokes that session. Deleting an account requires its password, removes all its sessions, and disconnects its active players. Account requests have body limits, origin checks, and IP rate limits.

Choose Archer (green hood/bow), Mage (blue robe/staff), or Warrior (armor/sword/shield). Choose a class at the village quartermaster before creating or joining any expedition (including invites). Your selected class stays fixed for that room, including reconnects; it is not stored as an account preference. Each saved skin records which class it belongs to. Registration only asks for username and password. The inn holds account settings and logout; the quartermaster holds your collection and equipment; the tailor holds skins. Each class has its own attacks and cooldowns; health and movement hitboxes stay identical.

## Base Village

The first screen is login/registration only. After signing in you enter **Hearthwick Village**, a peaceful shared space. Walk up to a place and press **E**; Escape or **Return to village** closes its dialog.

- **Quartermaster (west):** choose Archer/Mage/Warrior, equip collected gear, pack potions, buy/sell, and inspect your collection.
- **Moonlit Tailor (east):** equip a skin for your selected class, or open the existing skin editor.
- **Wayfarer Inn (southwest):** account details, logout, and account deletion.
- **Training Grounds (northwest):** Testing, all maps, unlimited respawns.
- **Five Realms (northeast):** Story, map unlocks and limited lives.
- **Dueling Gate (southeast):** Fight, all maps, player-versus-player combat.

Portal dialogs provide destination selection, public/invite creation, matching public rooms and joining by room ID. Invite links retain the ID through login; approach any portal to join. An expedition uses the class, skin, equipment and potion count prepared in the village. Joining spends potions exactly as before; visiting the village never spends them. Leaving an expedition returns to the village.

Up to **24 visitors per village** share names, movement, appearance and station activity. Full villages overflow into another available instance, or create one; expeditions still hold three players. Expedition discovery is shared across villages: join a public expedition or use its invite ID regardless of your village, subject to its capacity and Story admission rules. Village rooms disappear when empty. A temporary disconnect has a 15-second recovery window; if recovery fails, the village offers a reconnect button. There is no village combat, chat, persistent position, party system, or new database table. Class, equipped gear and skin choices remain browser-session preparation choices, not saved account preferences.

## Destinations and enemies

Choose a destination before creating a room. Joining a listed room or invite uses that room’s map. Each authored map is **3456 × 1024**, with a distinct authored route from a safe camp to a final arena. Solid riverbanks, ramparts, lava and chasms prevent shortcuts along the outer border; these are impassable terrain, not damage zones.

| Difficulty | Realm and route | Enemies | Boss attacks |
| --- | --- | --- | --- |
| 1 | Forest — woodland forks around a moonwater pool | 5 | Elderroot: slow slam, fan (2 patterns) |
| 2 | Castle — enclosed chambers with alternating north/south doorways | 7 | Hollow King: fan, charge, slam (3) |
| 3 | Paradise — two garden loops around reflecting pools | 8 | Seraph: ring, ground blast, fan, burst (4) |
| 4 | Hell — basalt islands joined by exposed bridges | 10 | Warden: burst, ground blast, charge, ring, fan (5) |
| 5 | Mountain — three ledges with two long switchbacks | 12 | Colossus: charge, cross, ground blast, ring, slam, burst, fan (7) |

**Fight the boss whenever you reach it.** Bosses can attack and take damage even while ordinary enemies remain alive. Boss music starts on the first confirmed hit. Testing keeps unlimited enemy respawns.

Every realm has melee, ranged and boss enemies. Melee attackers flank and pursue; ranged enemies retreat and strafe. Early enemies have slower movement, gentler damage and longer pauses. Boss health grows from 450 to 1440; movement from 100 to 180 px/s; the cooldown portion drops from 1800 to 600 ms. Later realms add rushing melee, staggered volleys, paired cross shots and marked ground blasts. Wind-ups become progressively shorter, with aim/target locked when shown. Below half health, enrage adds 4–20% movement speed and reduces cooldowns by 10–35%, depending on the realm; it never shortens a warning already shown. Charges stop at terrain and hit each player at most once.

Testing enemies return after eight seconds and players after three seconds with brief protection. Story has no player or enemy respawns. Fight remains player-only. Enemies patrol when idle and return home when pulled too far; camp remains a refuge.

Content lives in `shared/src/world/map.ts` and `routes/` (one layout per realm; `regions.ts` collects them), `enemies.ts` (stats/themes), and `enemy-attacks.ts` (rotations, warning geometry and difficulty). Server AI, navigation and attack continuations live in separate modules under `server/src/simulation/`. Static map art is generated once per scene; warnings use the same geometry as damage. AI stays inside the existing 30 Hz loop, with cached navigation, throttled route searches and a 192-projectile budget for enemy fire. No AI database work or extra network message stream is added.

## Paths, collection, and expedition equipment

**Testing** lets you choose any map with unlimited player/enemy respawns. **Story** unlocks Forest → Castle → Paradise → Hell → Mountain. Every member must have unlocked the destination, including invite joins. Defeat every enemy, including the boss, once to complete a map; enemies never respawn in Story and surviving party members unlock the next realm. Players never respawn during Story. Reconnection preserves the same life and equipment; leaving and joining that story room again cannot grant a new life. A full wipe ends the expedition; start a fresh room to retry. Cleared maps can be replayed. Unlocks persist per account; unfinished rooms are not saved story instances.

Visit the **Quartermaster** to choose your class, collected weapon/armor and 0–5 potions, inspect all six collectible pieces, or buy/sell supplies. Its dialog tabs support arrow keys, Home and End. The **Tailor** manages skins, and the **Inn** holds account settings.

- One collectible weapon per class: +20% attack damage (including damaging specials).
- Archer vest and mage robe: 15% shorter charge times and special cooldowns.
- Warrior armor: Iron will lasts 5 seconds instead of 4.
- Health potion: restores up to 50 HP with R, with a one-second reuse cooldown. New accounts receive three stored potions.

On each kill, every living, connected party member receives personal ground drops: their class weapon from melee enemies or armor from ranged enemies/bosses, one potion, and 5 coins (25 from bosses). Walk within 28 world pixels to collect them; walls block collection. Only your own drops are drawn, so party members cannot steal them. Drops fade after two minutes, disappear when you leave, and are not saved until collected. A half-second delay makes new drops visible even at close range. Story survivors can keep moving after victory to collect the final loot.

Duplicate gear stacks up to 999 copies per item; potions are capped at 999 and coins at 999,999. The Shop buys/sells one unit per click: weapons cost 80 / sell for 20 coins, armor 100 / 25, and potions 10 / 3. New adventurers receive 30 coins. Coins come from loot and sales; no real-money purchases are implemented. All prices, stock and balances are checked in a locked PostgreSQL transaction. Collected gear becomes equippable on the next expedition.

Original pixel icons appear on the ground, collection cards, loadout choices and shop shelves. Equipped armor and weapons use transparent, frame-synchronized layers over the unchanged default or custom skin. Art does not alter collision geometry. Equipment is a snapshot for the room; selling from another browser tab affects future loadouts, not a character already inside.

Packed potions are deducted atomically at entry, never refunded at exit, and do not replenish on respawn. Looted potions go to storage, not the current belt. Equipment is fixed at room entry; the server validates ownership and class. Damage, equipment effects, potion counts, healing, cooldowns, life limits, and unlock awards are server-authoritative.

Reward receipts prevent duplicated saves on retry. Pending writes are bounded; database errors pause the room while a five-second retry runs. Leaving normally waits for rewards to save. Account deletion cascades through all adventure data. As with ephemeral rooms, a process crash or prolonged database outage can lose rewards that have not reached PostgreSQL; durable offline queues are outside this prototype. Old reward receipts are pruned after seven days on startup.

Content, equipment modifiers, drop rules and trading contracts live in `shared/src/inventory/`; persistence in `server/src/adventure/store.ts`, room reward buffering in `rewards.ts`, and collection/loadout UI in `client/src/features/adventure/adventure.ts`. Ground drops live in `server/src/simulation/loot.ts`; `client/src/art/item-art.ts` shares icon art, `loot-view.ts` draws pickups, `equipment-view.ts` layers gear, and `shop.ts` handles the shop. Add item definitions without expanding the synchronized schema or adding per-frame database work.

## Class combat

| Class | Hold left, then release | Right click / hold |
| --- | --- | --- |
| Archer | Arrow: 10–44 damage, 1 s charge cycle; no cooldown | Arrow storm: 12 arrows evenly across 360°, 25 damage each, 7 s cooldown |
| Mage | Fireball: 22–96 damage, 2 s charge cycle; no cooldown | Inferno: larger, slower fireball, 300 damage, 10 s cooldown |
| Warrior | Sword sweep: 10–42 damage, 82-unit reach / 140° sector, 0.7 s charge cycle; no cooldown | Iron will: no damage taken for 4 s, 12 s cooldown from activation |

Hold left to fill the ring around your character, then release to attack in the current aim direction. Its gold window (65–80% of the cycle) gives maximum damage: **0.65–0.8 s for Archer, 1.3–1.6 s for Mage, 0.455–0.56 s for Warrior** before equipment modifiers. Damage rises from 40% of base to 175%, then falls back to 40% at a full ring. Holding longer stays overcharged: it never auto-fires or cycles back to maximum. Quick taps produce weak attacks. Damage rounds once after equipment bonuses.

Normal attacks have no cooldown: release, then press again to begin a fresh charge immediately. The charge ring and sweet spot determine damage. Held right click repeats a special when its cooldown expires. All classes can move while charging and releasing. The warrior hits each enemy overlapping its forward sector once, including edge grazes, with terrain line of sight required. Its sector is larger than the melee mob's 50-unit / 120° attack. Arrows and fireballs stop at their first impact; no splash damage or piercing. Projectiles sweep against square actor footprints (arrow/bolt radius 3, fireball 7, Inferno 14); the sword checks circular enemy footprints against a sector. Hitboxes remain independent of skins.

The local charge ring responds immediately; the server uses its own simulation time for damage, cooldowns and attack creation. Player specials retain their existing balance. Shared tuning is in `shared/src/combat/combat.ts`. Blur, leaving the canvas, death, disconnection, or 500 ms without input cancels a charge without firing. Reconnects and respawns preserve special cooldowns; respawns clear old immunity and sweep effects.

Combat stays server-authoritative at 30 Hz. Charge starts, confirmed release timestamps and special deadlines synchronize on transitions; no per-frame charge messages or database writes. `ChargeView` draws the ring, `CombatView` renders attacks, and neither replays combat during movement reconciliation. Projectile creation and sword effects still wait for authoritative state. Loot writes remain asynchronous outside the fixed simulation.

## Create and wear a skin

Log in, walk to the **Moonlit Tailor**, press E and open **My skins**. Pick Archer, Mage, or Warrior and click **New from template**. Paint with Pencil, Eraser, Fill, or Pick; choose a palette swatch and use **Replace color** to change its color everywhere. Undo/redo keeps the last 30 edits. Zoom changes the drawing view only. Choose Front/Back/Left/Right and a frame to edit; the live Phaser preview can walk or idle.

Each skin uses template version 1: 24 × 28 pixels, four directions, three frames per direction, up to 63 opaque colors plus transparency. All 12 frames start with the original class artwork. Frame 1 is also the idle pose. Every frame must contain visible pixels. Freehand edits affect the selected frame; recoloring affects all frames.

Name it and click **Save new skin**, then choose it under **Your skin** before creating or joining a room. Only skins for the chosen class appear. A saved skin is an immutable design; **Edit a copy** opens it as a draft and saving creates another skin. The wardrobe holds 32 skins per account. Select a saved design and choose **Delete**, then confirm, to permanently remove it and free a slot. Deletion keeps your current draft and resets that skin’s local outfit selection to **Class original**. Overwriting, publishing, marketplace discovery, image import/export and moderation are not implemented. Closing the editor retains the draft in the current page; reloading or changing accounts discards unsaved edits. Saved designs persist across login/reloads. Account deletion removes its skins.

PostgreSQL stores bounded palette/frame JSON alongside the skin's owner, name, class and template version. UUID skin IDs identify immutable artwork. The server checks ownership and class at room entry; game state carries only the ID. Each browser fetches a skin once per room while it is in use and caches its textures; no artwork or database operations are added to combat ticks. Signed-in players can read a skin by ID to render teammates; this is not a private art vault. Unavailable or deleted artwork falls back to the original class appearance. A browser that already cached a deleted skin may keep showing it until that room ends; it cannot be equipped in a new room. Stats and collision geometry remain unchanged.

## Database and migrations

The server uses asynchronous `pg` queries and a pool of at most five connections. Accounts, sessions, skins, adventurers, account_items, and adventure_rewards are relational tables linked by account UUID. The adventure migration adds potion storage, completed-map count, counted equipment stacks, coins, and idempotent reward receipts. A room-owned queue serializes loot writes outside the simulation loop; no generic persistence framework is used.

Configuration lives at the repository root. Existing shell variables win. During development, `.env.local` wins over `.env`; with `NODE_ENV=production`, `.env.local` is never read. Both files are ignored by Git. `DATABASE_URL` is a normal `postgresql://...` URL (Node's driver is already asynchronous; do not use Python's `+asyncpg` scheme). Local Docker credentials are development-only. Change `APP_ORIGIN` to the exact browser origin when using another host.

```sh
npm run db:up                         # start/wait for local DB
npm run db:down                       # stop DB; preserve its data
npm run db:migration -- add_more_items # create a timestamped SQL migration
npm run db:migrate                    # apply pending migrations explicitly
npm run db:rollback                   # undo ONE migration locally (may delete data)
```

Edit the new file in `server/migrations/`, filling in its Up and Down sections, test against local Docker, and commit it with your code. Never edit a migration already deployed. [node-pg-migrate](https://salsita.github.io/node-pg-migrate/) records applied versions, runs pending migrations in a transaction under an advisory lock, and checks ordering. Server startup applies pending **up** migrations before accepting connections. An error or lock conflict stops startup; it never silently serves a partially migrated schema. Production rollbacks are disabled in the helper: use a reviewed forward migration. Back up real data before destructive schema changes. Multiple application processes should run migration startup sequentially (three gameplay rooms in one process need no special coordination).

For production, copy `.env.example` to `.env`, set the real database URL and HTTPS origin, then run:

```sh
npm ci
npm run build
npm start     # sets NODE_ENV=production, migrates, then starts the server
```

Ship `server/migrations/` alongside `server/dist/` and `client/dist/`. Put HTTPS in front of the server, forward WebSocket upgrades, and set `TRUST_PROXY_HOPS` to the actual number of trusted proxy hops (0 locally). Use your provider's verified TLS database URL/CA configuration; certificate verification is not disabled. `npm start` uses production Secure cookies. No database volume reset or seed is performed on startup.

Tests create and drop uniquely named databases on the local PostgreSQL server, leaving your game database intact; the local test role needs CREATEDB. `TEST_DATABASE_URL` can override the local test connection, but remote hosts are refused. Browser tests register and delete their own test accounts against the running local app. They exercise registration/login/logout/deletion, per-room class selection and three-player rendering, combat, and recovery.

## Production on Dokploy

`Dockerfile` builds the shared code, server and browser client into one production image. The server serves the client and `/api` on the same origin, and accepts Colyseus WebSocket upgrades on that same port. This keeps cookies, API calls and game connections on one HTTPS domain. `compose.production.yaml` starts this app container and connects to your existing PostgreSQL service; it does not create a second database.

In Dokploy, create a **Docker Compose** deployment (the Docker Compose type supports `build`; the Docker Stack type does not), point it at this repository/branch, and set the Compose file path to `compose.production.yaml`. Add these variables in the deployment's Environment page:

```text
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/DB_NAME?sslmode=verify-full
APP_ORIGIN=https://game.example.com
TRUST_PROXY_HOPS=1
```

Use the database provider's actual connection URL and TLS options. If PostgreSQL is another Dokploy service, use its reachable internal hostname and ensure the app can join/reach its network; `localhost` inside this app container means the app container itself. The database and role must already exist, and the role must be allowed to create tables/indexes in the target schema (usually by owning the fresh database/schema). The migrations use PostgreSQL's built-in `gen_random_uuid()` function. `TEST_DATABASE_URL` is only for local tests and is not needed here.

Deploy, then add a Dokploy domain for service `app`, container port `2567`, with HTTPS enabled. DNS must point to the Dokploy host. The compose file intentionally uses `expose`, not a public host port; configure the domain through Dokploy's Domains tab. The app uses the browser's current origin for both HTTP and WebSocket connections, so do not set `VITE_SERVER_URL` in this setup. `APP_ORIGIN` must exactly match the public origin (scheme and host, no path or trailing slash). `TRUST_PROXY_HOPS` should match the number of trusted reverse-proxy hops; `1` is the usual Dokploy/Traefik setup.

On each container start, `npm start` applies pending forward migrations before opening port 2567. The image includes `server/migrations/`; migration failure prevents the app becoming healthy. This is a single-process game server: deploy one app replica because rooms and live sessions are held in memory. Take a database backup before a release that changes schema. Production rollback migrations are deliberately disabled; ship a reviewed forward migration instead.

Only `DATABASE_URL` and `APP_ORIGIN` are required deployment variables. `TRUST_PROXY_HOPS` is optional (defaults to `1` in this Compose file). `NODE_ENV=production` and `PORT=2567` are set by Compose. No application signing key or separate frontend URL is currently required.

## Playing

- In the village: WASD / arrows to walk, E to interact, Escape to close a dialog.
- In an expedition: WASD / arrow keys: move. Mouse: aim. Hold left / release: charge / normal attack. Right click / hold: class special.
- Trees, stone walls, and map edges stop movement and shots. Players never block each other. Testing and Story disable friendly fire; in Fight, attacks damage other players but never their owner.
- Testing: players return after three seconds; enemies after eight seconds. Story: one life per player and enemy, including the boss; no respawns.
- Fight: all five maps, up to three rival players, no monsters, unlimited three-second respawns with brief protection. Class attacks, gear, potions and cooldowns work as usual. Kills count for the current room only; no loot or story progress is awarded. Packed potions are spent on entry, as in other modes.
- R: consume one packed health potion for up to 50 HP. Full health does not waste a potion.
- The camera follows you. The HUD shows health, party, and room information. Copy invite shares this room; Leave returns to the village.
- Controls clear when focus is lost. A dropped connection pauses input and allows 15 seconds to recover, then returns to the village.

## Audio

The brass **Audio on/off** button at the top left of both screens controls music and effects; its preference is saved in this browser. Audio starts on page load when the browser permits autoplay, otherwise on the first click, tap or keypress anywhere on the page. It pauses when the page loses focus, and resumes when you return (some mobile browsers may require another tap). Unsupported browsers continue silently.

Original synthesized menu/adventure melodies accompany clicks, major actions, three class attacks and specials, charging and its sweet spot, player/monster damage, enemy attacks, deaths, respawning, potion use, loot and Story results. Nearby combat fades with distance. Charging follows the immediate local ring; attacks, damage and pickups follow confirmed server state. No audio files, external samples, dependencies or extra server messages are needed.

`client/src/audio/music.ts` holds three original scores: a gentle G-major menu theme in 6/8 with flute-like melody and plucked accompaniment, and a D-minor adventure theme in 4/4 with lower strings and soft drums. Those themes loop in roughly 32–35 seconds. A faster, eight-bar D-minor boss march begins on the first confirmed boss hit, including hits by a teammate. Boss death, player death, retreating out of range or a reset returns to the adventure theme; mute and reconnect retain the authoritative encounter state. `sounds.ts` holds typed effect recipes; `synth.ts` renders tones/noise; `audio.ts` manages playback, charging, music and mute; `audio-ui.ts` wires accessible buttons; `game-audio.ts` compares authoritative snapshots without replaying old sounds on reconnect. To add a cue, add its recipe and call `audio.play()` from the relevant presentation event. Web Audio is independent of Phaser's disabled sound manager, so the menu and adventure share one context.

## Module ownership and networking

Start with the [developer documentation index](docs/README.md) for architecture, module ownership, networking, persistence and extension recipes. The [development guide](docs/development.md) covers folders and code conventions.

`shared/` owns the authored maps, balance constants, input contracts, synchronized schema, collision geometry, and deterministic movement. It compiles to JavaScript and declarations. It uses no Phaser or DOM APIs.

`server/` owns PostgreSQL accounts, sessions, migrations, authenticated room entry, room lifecycle and the authoritative simulation: input validation, movement, AI, cooldowns, projectiles, damage, deaths, and respawns. Each expedition has an isolated simulation, a maximum of three players, a 30 Hz fixed step, and a 50 ms patch interval. Public discovery uses Colyseus's built-in lobby; invite rooms use its private setting.

`client/` owns the account UI, class selection, shared Phaser village, station dialogs and expedition rendering, generated pixel art, input sampling, local prediction, and remote interpolation. Colyseus prediction acknowledges inputs and replays pending movement against authoritative state. Local terrain collisions use the shared movement function. Remote entities use a 100 ms interpolation buffer; respawns snap. Projectiles and damage remain authoritative. Development diagnostics expose latency and reconciliation drift. Add `?debug=1` to enable the Colyseus SDK panel.

Inputs carry movement, aim, normal-attack and special-attack intent, never positions or hit results. Server processing is bounded to one input per player per fixed step with bounded queues. Swept collision detects projectile impacts between steps. Reconciliation performs movement only, avoiding repeated presentation effects.

## Verification and limitations

Unit tests cover map spawn safety and reachability, enemy pursuit/telegraphs/leashes, movement normalization, walls, corners, boundaries, swept projectile collision, cooldowns, respawns, input sanitation, flooding, and prediction/replay. Integration tests use real Colyseus rooms to cover isolation, discovery/privacy, capacity, leave/reconnect, and authoritative combat. Browser tests exercise three sessions and delayed/jittered network traffic. See [verification results](docs/verification.md) for the recorded results and reproducible checks.

Browser acceptance targets Chromium; audio has also been checked in Firefox. Safari remains unverified.

Original placeholder pixel textures and directional sprite frames are generated in Canvas. There are no external raster art assets; the favicon is an original SVG. Desktop keyboard/mouse only; no touch controls. Browser audio uses Web Audio; browsers that block autoplay require an initial click, tap or keypress. Five larger authored maps have fifteen themed enemy appearances and progressively more complex attack rotations. No projectile prediction, historical hit rewinding, saved in-progress expeditions, or production security/operations layer. Equipped gear overlays the original or custom skin.

For file-level ownership and future boundaries, see [architecture notes](docs/architecture.md).

## Long-term RPG vision (not implemented)

Each story will be an independent instance of the same authored world with saved progression and up to three players. Accounts currently own skins, collected equipment, stored potions, and story map unlocks. Future character inventories will extend this foundation. Story ownership and guest access will be distinct from temporary room connections. Future content includes persistent levels, richer boss encounters, expanded equipment and progression.

The first browser skin editor now includes templates, preview, validation and persistence. Future publishing and shop discovery will add asset distribution and moderation. Cosmetics remain separate from gameplay hitboxes and stats.

Saved story instances, player-to-player trading, skin marketplace, payments, chat, and deployment infrastructure remain outside this prototype. Session revocation broadcasts currently cover one server process; distributed revocation belongs with future multi-process hosting.

## Upstream foundations

Scaffolded with the official [Phaser Vite + TypeScript flow](https://docs.phaser.io/phaser/getting-started/installation) and [Colyseus application generator](https://docs.colyseus.io/getting-started). Networking follows [Colyseus client prediction](https://docs.colyseus.io/netcode/client-prediction). Repository-local agent skills come from [phaserjs/phaser](https://github.com/phaserjs/phaser/tree/master/skills) and [colyseus/skill](https://github.com/colyseus/skill); their bundled references and licenses are retained.

Repository-local Phaser and Colyseus agent skills are installed under `.agents/skills` and available on subsequent agent turns.
