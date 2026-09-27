# Working on the codebase

[Documentation index](README.md) · [Extension recipes](extending.md) · [Test selection](testing.md)

Run commands from the repository root. Use Node 22.13+ (22.x) or Node 24+ and the committed npm lockfile.

```sh
npm run lint          # ESLint: bugs, unused code, type imports, unhandled promises
npm run lint:fix      # apply safe automatic lint fixes
npm run format        # format TypeScript, HTML, CSS and JSON with Prettier
npm run format:check  # check formatting without changing files
npm run check         # lint, formatting, types, tests and production build
npm run test:browser  # separate desktop acceptance suite
```

`check` needs the local PostgreSQL database (`npm run db:up`). Browser tests start the app or reuse the running development server. Test databases and test accounts are isolated from normal accounts. Linting covers source, tests, scripts and TypeScript configs; type-aware promise checks cover the three application source trees. Generated output and installed skills are excluded.

ESLint follows the [typescript-eslint recommended setup](https://typescript-eslint.io/getting-started/). Prettier handles formatting separately, using the [documented ESLint integration](https://prettier.io/docs/integrating-with-linters). Neither runs inside the game or production server.

## Where code belongs

```text
client/src/
  boot.ts, main.ts       Page startup and application/session orchestration
  api/                  Shared cookie-authenticated HTTP requests
  features/
    account/            Login, registration and account settings
    adventure/          Classes, maps, supplies, collection and shop
    lobby/              Public room discovery and join buttons
    skins/              Workshop, wardrobe, API and preview
  game/
    scene.ts            Scene lifecycle and actor rendering
    network.ts          Prediction, interpolation and reconnect resets
    controls.ts         Keyboard/pointer intent
    room-skins.ts        Room-owned skin texture cache
    diagnostics.ts      Development-only inspection hooks
    hud/                DOM health, abilities and expedition status
    views/              In-world charge, combat, gear and loot visuals
  village/              Social room, stations, dialog ownership, movement and scenery
  art/                  Original Canvas/Phaser texture recipes
  audio/                Synth, music, effects and playback lifecycle
  ui/                   Reusable DOM controls, tabs, dialogs and loading
  styles/               Stylesheets; style.css preserves base/feature cascade

server/src/
  index.ts, app.config.ts Server startup and service composition
  env.ts                Environment loading and configuration validation
  auth/                 Accounts, password/session storage and cookies
  skins/, adventure/    Feature HTTP routes and PostgreSQL operations
  http/                 Shared origin checks and error responses
  db/                   Pool and migration runner
  rooms/                Colyseus lifecycle, admission and bounded input
  simulation/           In-memory combat, AI, movement and loot

shared/src/
  index.ts              Public package exports
  config.ts             Simulation timing and room limits
  profiles/             Account/class types and skin validation
  protocol/             Input validation and synchronized entity schemas
  world/                Maps, enemies, geometry, movement and expedition modes
  combat/               Class abilities and charge rules
  inventory/            Catalog, equipment modifiers, drops and trading rules
  village/              Social schema, station catalog, building bounds and proximity
```

## Keep changes small

- Import shared contracts through `@openrpg/shared` from the client/server. Within shared code, use direct relative imports to avoid barrel cycles.
- Keep shared rules independent of Phaser, the DOM, HTTP and PostgreSQL. Both prediction and the server call the same movement function.
- Keep authoritative combat in `server/src/simulation`. Network input expresses intent; replay must never emit damage, sound or database writes.
- Keep database work out of simulation ticks. Reward retries use stable event IDs so a retry cannot grant loot twice.
- Put feature-specific UI beside its feature. Extract a shared helper only when multiple callers need the same behavior.
- Prefer named types, guard clauses and small functions. Use classes for stateful lifecycles; do not add service containers or generic repository layers.
- Use braces and one statement per line. A readable function can have more lines than a compressed one.
- Comment invariants, ordering, security boundaries and lifecycle cleanup. Do not restate obvious assignments or add boilerplate comments to every method.
- Keep the existing behavior covered: `npm run check`, then the relevant browser scenarios. Use the [test selection guide](testing.md); broaden browser coverage when a change affects shared lifecycle or several features.

## Types, modules and comments

Treat HTTP and message payloads as `unknown`, then parse them. Use literal unions and typed records for catalogs; use `import type` for type-only dependencies. Prefer a small named input/result type over broad objects or unsafe assertions. Never hide a failing contract behind `any`.

Group by feature and responsibility, not by arbitrary line count. Split a file when it owns independent behavior or cleanup; do not create one-file wrappers just to add layers. Keep direct dependencies visible through imports or constructor parameters. Avoid global mutable gameplay state, generic managers, dependency-injection containers and an ECS.

Keep orchestration in entry points, calculations in small functions, and stateful resource lifetime in concrete classes. Add a comment when the reason is not obvious: why replay omits effects, why a transaction locks a row, or why cleanup runs on both shutdown and destroy. Concise means fewer concepts and clear control flow, not compressed statements.
