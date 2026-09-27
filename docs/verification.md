# Verification record

## Fight mode and audio startup — 2026-09-27

- Added Fight beside Testing/Story: all five maps, three-player free-for-all, no mobs/AI, unlimited three-second respawns with existing protection. Shared combat handles player projectiles, specials and sword sectors, excludes self/dead/disconnected targets, and preserves terrain and immunity checks. Kills are room-local; no monster loot or story rewards.
- Lobby previews hide monster markers; listings and HUD identify Fight. Rivals use distinct labels/health bars, and nearby rival hits have sound cues. Gear and packed-potion rules are unchanged.
- Audio attempts playback on mount unless muted, and page-wide clicks/taps retry after autoplay blocking. Chromium checks use explicit permitted/blocked policies and non-activating CDP reads; tracing is disabled only in that test file because its snapshots can grant activation.
- Production build, workspace/test typechecks and all **102 unit/integration tests passed**. Existing Phaser chunk-size warning unchanged.
- **Eight Chromium browser checks passed**, including all five Fight maps, three independent accounts joining by listing/room ID, synchronized player damage/death/respawn, and both autoplay policies. Fight menu/game screenshots inspected. Test accounts cleaned up.
- **Four Firefox audio checks passed**, covering mute persistence, page-content activation, focus suspension, synthesis and adventure cleanup. Safari remains unverified on this host as noted below.
- No dependencies, migrations, synchronized schema fields or network messages added.

## Distinct menu and adventure music — 2026-09-27

- Replaced short similar phrases with original 16-bar scores: gentle G-major 6/8 menu and rhythmic D-minor 4/4 adventure. Soft onset envelopes apply to music; existing effect recipes remain unchanged.
- Production build, workspace/test typechecks and `git diff --check` passed.
- Four audio browser scenarios passed in Chromium and Firefox (eight total). Every bar of both scores rendered non-silent, below clipping and within the voice limit; existing mute, focus, charge, reconnect and menu/adventure switching checks passed.
- No dependencies, downloaded audio, server or network changes. Safari verification remains subject to the host limitation recorded below.

## Browser audio — 2026-09-27

- Production build, workspace/test typechecks and `git diff --check` passed. Existing Phaser chunk-size warning unchanged.
- `npm test`: **92 passed**, including authoritative audio-event classification, deduplication, distance attenuation and silent join/reconnect/unmute baselines.
- Chromium and Firefox: **all three audio browser scenarios passed in each browser** (six total across runs). They cover mute persistence/keyboard access, background suspension, unavailable-audio fallback, offline rendering of every recipe, the 32-voice cap, and real adventure charging/reconnect/leave cleanup.
- All sound recipes rendered non-silent finite output below full scale. Offline rendering waits for asynchronous source-end callbacks (Firefox delivers these after rendering resolves).
- Fixed a suspended-context cleanup edge case: stopped voices also disconnect on wall time, so delayed `ended` callbacks cannot retain muted nodes. Menu and adventure screenshots were visually checked.
- WebKit runtime downloaded, but launch is blocked on this host by missing `libevent-2.1-7t64` / `libavif16`. Safari/iOS device playback remains unverified; the implementation uses standard Web Audio and gesture-based unlocking. No system packages were changed.
- No server/schema, database, npm dependency or external audio asset changes. Tests clean up only their own accounts.


## Charged attacks and warrior sweep — 2026-09-27

- Production build and workspace/test typechecks passed; the existing Phaser chunk-size warning remains.
- Full unit/integration runner (`npx tsx --test tests/*.test.ts`, after rebuilding shared): **88 passed**.
- Coverage includes damage before/in/after the sweet window for every class, charge/cooldown flooding, cancellation and stale input, reconnect/respawn cleanup, equipment modifiers, moving sword attacks, multi-target sectors, edge grazes, walls and synchronized attacks.
- **Four browser scenarios passed across runs:** all-class charging/release/overcharge/blur/reconnect checks with and without 150 ms RTT, plus three-player combat/loot/movement/abilities with and without 150 ms RTT and jitter. No browser page errors were reported by the passing checks.
- Charge-ring and moving sword-sector screenshots were visually inspected. No dependencies, migrations or audio were added.

Older instant-fire tests were updated to send release and wait for its subsequent state patch. The latency combat driver now schedules release independently of its slower aim/telemetry loop; room selection targets its own unique host rather than assuming only one public room exists. Final reruns passed. Server-authoritative release timing can still differ slightly from the cosmetic local ring near sweet-window boundaries under jitter; historical input rewind remains out of scope.


## Loot and shop update — 2026-09-27

- `npm test`: 83 passed, including seven new loot/shop tests and updated room/migration coverage.
- `npm run build`, `npm run typecheck`, and `git diff --check`: passed. The existing Phaser bundle size warning remains.
- Tests exercise personal pickup ownership, living/connected checks, wall occlusion, expiry/caps, post-victory collection, duplicate stacks, idempotent saves, concurrent purchases/sales, storage limits, migration preservation, authenticated trading and forged-price rejection.
- Browser checks cover physical drops from real combat, walk-to-collect persistence, three-player play with 150 ms RTT/jitter, shop balances and duplicate sales, sold-loadout reset, reload persistence, mobile layout, and animated equipment over unchanged custom-skin pixels.
- Desktop/mobile shop, ground-loot and custom-skin equipment screenshots were inspected. No new dependencies were added.

The first shop reload check overlapped a development-server restart during a build (HTTP 502); its stable-server rerun passed. The expanded multiplayer test initially sampled a reversal before the preceding pickup walk had settled; it now waits for the remote position to converge before measuring leftward motion.

The verification below records the previous implementation milestone.

Verified on 2026-09-26 using Node 24.18.0, npm 11.16.0, and Playwright 1.63.0 / Chromium 153 on Linux. Versions in the root lockfile include Phaser 4.2.1, Colyseus core 0.18.17, SDK 0.18.4, and schema 5.0.34.

## Completed checks

| Command | Result |
| --- | --- |
| `npm install` | Updated workspace dependencies and lockfile; zero audit advisories reported |
| `npm run typecheck` | All three packages and test sources passed strict TypeScript checks |
| `npm run build` | Shared JavaScript/declarations, Node server, and browser production bundle built |
| `npm test` | 76 passed: 13 map/enemy, 13 class-combat, 10 simulation, 15 room integration, 11 adventure/progression, 6 account/database, 7 skin/editor/integration, and 1 environment precedence test |
| Browser suites | All 12 scenarios passed across runs: 2 adventure/inventory, 1 five-map selection/rendering, 4 gameplay (including all class attacks/cooldowns and latency/jitter), 2 account, and 3 skin workshop scenarios |
| `git diff --check` | Passed |

Unit tests cover normalized movement, all boundaries, wall sliding and corners, authored spawn clearance, swept projectile hits, malformed inputs/options, fire cooldowns, friendly-fire exclusion, terrain occlusion, mage line of sight, and player/mob respawn timing.

Real-server tests cover public discovery and invite privacy using the built-in lobby, joining private rooms by ID, room isolation, three-player capacity, leave/disposal, invalid names/options, bounded input queues, flooding disconnects, synchronized authoritative combat, automatic reconnection and input epoch reset, expiration of the 15-second reservation, and SDK reconciliation with pending input replay against a wall and an authoritative respawn.

Browser tests open three independent sessions and use keyboard and mouse input. They cover public-list and invite-link joins, shared movement/combat, camera-relative aiming after scrolling, remote interpolation samples, blur clearing held movement/fire, copying invites, room errors/capacity, successful recovery, offline timeout cleanup, creating a new room after timeout, and a natural mage kill of a player followed by a protected respawn with a snapped local render position. Screenshots were inspected for layout and rendering; no JavaScript page errors occurred in either combat scenario.

![Three players after shared combat](screenshots/three-player-combat.png)

## Latency and jitter

The browser harness wraps native WebSockets and delays both outgoing and incoming messages by 75 ± 20 ms, preserving message order and copying mutable outbound buffers. This adds approximately 150 ms round-trip transport delay with deterministic jitter. It does not delay HTTP matchmaking or Vite's development connection.

The delayed scenario verifies that the local predicted position advances before authoritative state, that the correction converges to within one world unit after movement stops, that remote render samples remain monotonic and bounded by speed/frame duration, and that the same combat kill reaches all three players. Both normal and delayed runs sampled more than 30 remote frames during movement.

Earlier movement-baseline SDK telemetry after movement:

| Scenario | SDK send-to-ack estimate | SDK drift EMA | Local/server position difference after stopping |
| --- | --- | --- | --- |
| Normal local connection | 133 ms | 0 | < 1 world unit |
| Added 150 ms transport RTT + jitter | 374 ms | 0 | < 1 world unit |

The SDK's estimate measures input send-to-authoritative-ack time, including simulation queueing, patch cadence, and browser scheduling; it is not a raw network ping. After combat, drift EMA remained below 0.01 in both runs. SDK scalar drift can include authoritative health/timer changes, so transient combat corrections should not be interpreted as movement nondeterminism.

## Reproduce

```sh
npm ci
cp .env.local.example .env.local
npm run db:up
npx playwright install chromium
npm run typecheck
npm run build
npm test
npm run test:browser
```

The browser suite starts `npm run dev` when needed. Use a freshly started development server for a full run: the real account limiter allows 40 registration/login/deletion attempts per 15 minutes from one IP. Non-account browser tests remove only their own authenticated fixture accounts directly through the account service against local PostgreSQL, so fixture cleanup does not consume the HTTP brute-force budget. Actual account deletion and throttling retain HTTP coverage. Repeated runs against a reused server may still need a restart. Ports 5173 and 2567 must be free (or already running this checkout); integration tests use ports 2568, 2569 and 2570 and disposable local databases. Avoid editing shared code or running another build during a live browser test: the compiler/server watchers and Vite reload the session. Test reports, screenshots, and failure traces are written to ignored `test-results/`. Use `npx playwright show-trace <trace.zip>` for a failure trace. Add `?debug=1` in development to inspect the Colyseus panel.

For a manual play session, run `npm run dev`, create an expedition, and open its copied invite link in two separate browser profiles/incognito contexts and register different accounts. Explore the paths, hold fire at a mage, move along the stone walls, blur the window while holding a key, and use the development panel's Drop control to test recovery.

## Known limitations

- Verification is automated Chromium interaction plus screenshot inspection, not a three-person usability session. Firefox, Safari, mobile gameplay, and real wide-area packet loss have not been tested. The skin workshop layout was checked at a 390 px browser viewport.
- The production Phaser chunk is about 1.37 MB before gzip (358 KB gzipped); Vite reports its standard large-chunk warning.
- The server now uses the Colyseus core and WebSocket transport packages directly, avoiding the umbrella package's automatic environment loader and unused OAuth dependencies. The updated installation reported zero npm audit advisories.
- No historical hit rewinding or projectile prediction. Remote projectiles are deliberately authoritative and delayed by interpolation.
- Room/combat state is ephemeral; accounts, sessions, skins, collected equipment, potion storage, and map unlocks persist in PostgreSQL. The long-term RPG features in the architecture notes are not implemented.

## Account and database checks

On 2026-09-26, PostgreSQL 17 in Docker passed migration up/down/up, repeat application, class-column removal with existing account/session preservation, password hashing, case-insensitive username uniqueness/login, session/logout/expiry, deletion cascade, malformed request/CSRF rejection, IP throttling, authenticated room identity, and invalidated reconnection checks. Test databases are created with unique names and dropped afterwards.

Browser checks cover registration, restored sessions after reload, per-room class choices without account requests, invalid-password errors, logout, account deletion, and logout from another tab during gameplay. The existing normal and 150 ms RTT combat scenarios now use an Archer, Mage, and Warrior together. Class previews and the separate passport/expedition panels were visually inspected at desktop and narrow-screen widths. Registration has no class field; classes reset on page reload and remain fixed through room reconnects.

A production-mode smoke check on an isolated database verified that the built server applies pending migrations before listening, serves the built client, issues Secure/HttpOnly cookies, preserved sessions through restart (performed during the initial account implementation), leaves already-applied migrations alone, and exits before listening when the database is unavailable. Environment tests prove local overrides win in development, `.env.local` is ignored in production, and shell configuration wins in both. The migration creation command was also exercised.

Password recovery, distributed session revocation, and distributed rate-limit storage are not implemented. Class-specific attacks use the shared authoritative combat simulation.

## Skin workshop checks

The skin suite verifies bounded frame/palette/name/version validation, flood-fill boundaries and continuous pencil strokes, persisted immutable copies, owner-only listing and equipping, class matching, account-deletion cascade, CSRF/auth/body-size rejection, concurrent wardrobe-cap enforcement, shared skin IDs and reconnection. Browser checks paint and erase, undo/redo, recolor, fill, pick a color, switch frames/directions/zoom, save and reload, edit a saved copy, and recover from a failed save without losing the draft. They verify the custom Phaser texture appears on both the owner and teammate, stays through reconnection and loads once in the owner's room. Original appearances remain available per class.

The desktop workshop and narrow layout were inspected from screenshots. New schema migrations run on the local development server and the isolated test databases. The migration runner now owns and awaits closing its PostgreSQL client; this avoids an upstream fire-and-forget close racing test database teardown. No production deployment or production database migration was performed for skins.

UI cleanup checks also cover owner-only skin deletion, missing sessions and invalid origins, missing/foreign IDs, removal of stored artwork and freeing a full wardrobe slot. Browser checks confirm deletion can be canceled with Escape, failures preserve both the saved design and draft, successful deletion resets the equipped selector, and deletion persists after reload. Styled native dropdowns are exercised with keyboard selection and Escape. Native confirmation dialogs replace browser prompts. Workshop header/close controls and feedback stay visible while scrolling. Desktop and 390 px layouts were inspected; other browser engines retain the native dropdown fallback and were not tested.

## Class combat checks

Class-combat tests cover independent exact cooldown boundaries for all six abilities, 1,000 repeated activation attempts at a fixed simulation time, the twelve-arrow angular spread, projectile-specific damage and collision sizes, nearest-hit selection, terrain blocking, sword range/direction/single-hit behavior, kill attribution, four-second immunity expiry, protection, respawn cooldown preservation, malformed attack flags and projectile cleanup. Flood movement checks compare displacement to authoritative simulation time rather than wall-clock scheduling.

Real Colyseus clients also activate all three classes in one room and verify synchronized projectiles, sword effects, immunity and cooldowns. Reconnection preserves the active special cooldown. Movement reconciliation explicitly excludes combat timers and effects.

Browser ability scenarios use three accounts/classes, both normally and with 150 ms RTT plus jitter. They exercise quick left/right clicks, independent cooldowns, expected projectile kinds/counts, sword-only attacks, teammate immunity state, active/ready HUD transitions, holding both buttons, releasing one button, blur cleanup and reconnect preservation. Generated fireballs, the shield aura and the fantasy cooldown HUD are inspected in the screenshots under `test-results/`. These establish behavior and an initial damage baseline; they are not a competitive balance study or production capacity benchmark.

The earlier class-combat verification encountered one transient Chromium `ERR_NETWORK_CHANGED` during module loading; its isolated rerun passed. The five-realm regression run also passed the invite/recovery scenario.


## Five realms and enemy behaviors

The map suite checks every role’s spawn footprint, player routes from camp, selected-map movement/prediction agreement, terrain blocking of projectiles, and eight-second respawns with role-specific health. Behavior tests cover obstacle routing, melee pursuit and dodging, walls stopping physical attacks, ranged retreat/locked aim/cooldowns, boss wind-ups and immunity, death cancelling attacks, bounded fan/ring volleys, camp protection, leashing, and larger boss hitboxes. Real-room tests validate all five selections, metadata, join inheritance, and rejection of unknown map IDs.

Browser checks visit all five previews, create each destination, move with prediction, render enemies, and leave cleanly. Three-player shared combat passes both normally and with 150 ms RTT/jitter. The browser shooter now leads strafing enemies instead of assuming stationary targets. Account, skin, reconnect and player-respawn regressions pass. Terrain, destination cards, and all fifteen enemy sprites were visually inspected. Keep source builds/edits separate from browser runs: the development watchers can reload active pages.

`npx tsx scripts/benchmark-simulation.ts` simulates 3 rooms, 9 moving/attacking players, and 12 enemies for 3,000 steps. A local run averaged 0.15 ms per combined three-room step, 0.79 ms at the 95th percentile, and 4.78 ms maximum. This measures simulation CPU only, excluding networking, serialization, rendering, database activity and production hosting. It is a reproducible smoke check, not a capacity guarantee.

## Story, equipment, and supplies

The adventure suite checks one ordinary-enemy respawn, permanent boss/player death, terminal outcomes, party wipes, unlimited Testing respawns, potion healing/clamping/cooldowns/death/disconnect checks, and supplies staying spent through respawn. All six equipment examples affect real damage or cooldown/immunity deadlines. Duplicate lethal hits emit a single reward. Malformed modes, gear slots, IDs, and potion counts reject.

Isolated PostgreSQL tests verify starter supplies, permanent unique equipment, idempotent concurrent reward receipts, class/ownership validation, atomic concurrent potion spending, sequential unlocks/replays, deletion cascades, and retry after a simulated lost acknowledgement following commit. Real room tests verify party loot by class, room isolation, locked-map joins despite forged mode/map options, one life per account in a Story room, survivor-only completion awards, terminal-room join rejection, carried supplies across recovery, and logout during asynchronous equipment admission.

Browser scenarios cover keyboard-accessible path/preparation tabs, locked/unlocked destination cards, collected gear, choosing the warrior loadout, its five-second immunity, packing and forfeiting unused potions, retained collection after reload, responsive layout, R healing, and a natural Story death with no respawn. Their equipment/progress fixture seeds only the newly registered test account. Three-player combat independently earns real class-specific loot through mouse attacks. Desktop and 390-pixel screenshots are inspected.

The expanded suite initially exposed the existing account-attempt quota through HTTP fixture cleanup; cleanup now verifies and removes only its own local test account through the account service. One latency scenario also exposed an automated aim assumption: its shooter led only projectile travel, missing a strafing enemy while standing still under fire. The test now includes its measured send/ack delay in the lead and uses its packed health potions. These changes affect test controls only, not damage, enemy AI, or networking balance.

The new SQL migration was applied to the local Docker database and exercised in isolated up/down/up tests. No production database was contacted. Pending in-memory rewards cannot survive a process crash before reaching PostgreSQL; this remains documented rather than introducing a durable job system.

Final verification: all 76 automated tests passed; build and strict typecheck passed; all 12 browser scenarios passed across runs. The final isolated 150 ms RTT/jitter scenario passed in 1.1 minutes, including gameplay and cleanup. Projectile checks now observe each attack when fired rather than requiring both mage projectiles to coexist after one can already hit terrain. The fixture leave helper avoids a second pending click during an asynchronous leave. A skin run encountered a transient module-loading failure; its isolated rerun passed. The HTML username pattern now escapes its hyphen for modern browser validation.
