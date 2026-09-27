# OpenRPG — Local setup and testing

For code structure and extension guides, see [developer documentation](docs/README.md).

Run every command below from the repository root. Commands use a Bash-compatible terminal (Linux, macOS or WSL).

## 1. Requirements

- Node.js 22.13+ within 22.x, or Node.js 24+.
- npm 10+.
- Docker with Docker Compose, with the Docker engine running.
- A desktop browser with keyboard and mouse.

Check your tools:

```sh
node --version
npm --version
docker compose version
```

Docker runs PostgreSQL only. The client and server run on your computer through npm.

## 2. First-time setup

```sh
npm ci
cp .env.local.example .env.local
npm run db:up
```

If you already have `.env.local`, keep it rather than copying over it. The supplied local configuration is:

```dotenv
DATABASE_URL=postgresql://openrpg:openrpg_local@127.0.0.1:5433/openrpg
APP_ORIGIN=http://localhost:5173
PORT=2567
TRUST_PROXY_HOPS=0
```

These credentials match the local Docker database. `.env.local` is ignored by Git. During local development, shell variables take precedence over `.env.local`, which takes precedence over `.env`.

`db:up` waits for PostgreSQL to be healthy. Its named Docker volume keeps accounts, skins and inventory between restarts. No seed step is needed: register your first account in the browser.

## 3. Run in development

```sh
npm run dev
```

Open **http://localhost:5173** and register an account. Leave the terminal running while you play.

This command builds the shared package, then starts its compiler watcher, the game server and Vite. The server applies pending database migrations before accepting connections. Client edits reload in the browser; server edits restart the server and end its temporary rooms.

| Service             | Address                      |
| ------------------- | ---------------------------- |
| Browser app         | http://localhost:5173        |
| Game server and API | http://localhost:2567        |
| Server health check | http://localhost:2567/health |
| PostgreSQL          | `127.0.0.1:5433`             |

Use `localhost:5173` consistently in the browser: the origin must match `APP_ORIGIN`. The client forwards `/api` requests through Vite and connects to the game server on port 2567.

Stop the app with **Ctrl+C**. Stop PostgreSQL when finished:

```sh
npm run db:down
```

Start it again with `npm run db:up`. Stopping it preserves its data.

## 4. Build and play the compiled app locally

Stop `npm run dev` first to free port 2567 and avoid watcher restarts during the build. Keep PostgreSQL running.

```sh
npm run build
NODE_ENV=development APP_ORIGIN=http://localhost:2567 npm run start --workspace @openrpg/server
```

Open **http://localhost:2567**. The compiled server now serves the built browser app and API on the same port; Vite is not running.

The build produces `shared/dist`, `server/dist` and `client/dist`. Keep `server/migrations` available: startup still applies pending migrations. This local smoke test uses your `.env.local` database and local HTTP cookies. The origin override applies only to this command, so the file remains ready for `npm run dev`.

The root **`npm start` is for production**: it sets `NODE_ENV=production`, ignores `.env.local`, requires an HTTPS `APP_ORIGIN` and uses Secure cookies. For local HTTP testing, use the workspace command above. For deployment, see the main [README](README.md#database-and-migrations).

After stopping the compiled app, return to development with `npm run dev`.

## 5. Run automated checks

Start PostgreSQL before running tests. Stop the development app before the full check/build sequence.

```sh
npm run db:up
npm run check
```

`check` runs ESLint, formatting validation, TypeScript checks, unit/integration tests and the production build. Individual commands are also available:

```sh
npm run lint
npm run lint:fix
npm run format:check
npm run format
npm run typecheck
npm test
```

Unit/integration tests create and drop temporary databases on local PostgreSQL. The supplied Docker database user has the required permission. They leave the main game database intact. `TEST_DATABASE_URL` can select another local PostgreSQL test connection; remote database hosts are refused.

For browser tests, stop any compiled app on port 2567 first:

```sh
npx playwright install chromium
npm run test:browser
```

Playwright starts the development app, or reuses an existing one at `localhost:5173`. PostgreSQL must already be running. If it reuses your app, ensure the server is healthy too. Browser tests create and delete their own accounts in the local app database. Reports, failure screenshots and traces are written under `test-results/`.

If Playwright reports missing Linux system libraries, install its Chromium dependencies with `npx playwright install --with-deps chromium` (this may require administrator access).

## 6. Test multiplayer manually

1. Open three independent browser profiles or browsers, and register a different account in each. Ordinary tabs share login cookies; multiple windows in the same private session can also share them.
2. In the village, walk to the quartermaster and press E to choose a class/equipment. Close its dialog, approach a portal and press E to choose a map and create a public room.
3. Approach a portal in the other browsers and join through its room list or room ID. For an invite-only room, use **Copy invite**.
4. Use **Testing** for cooperative combat with unlimited respawns, or **Fight** for player combat without monsters.
5. Move with WASD/arrows, aim with the mouse, hold left click to charge and release to attack, and right click for the special. Pack potions before entry and press R to use one.

There is a three-player room limit. Account data persists; running rooms disappear when empty or when the server restarts. **Story** progression and spent potions also persist during local play.

## 7. Database changes

```sh
npm run db:migration -- add_example_field
# Edit the generated SQL file in server/migrations, then:
npm run db:migrate
npm run check
```

Server startup also runs pending migrations automatically. Commit new migration files with the code that uses them. Do not edit migrations already applied to a shared or deployed database.

`npm run db:rollback` undoes one migration locally and can remove data. Normal testing does not require rollback or deleting the Docker volume.

## Troubleshooting

| Symptom                                             | Check                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database connection refused                         | Run `npm run db:up`; inspect `docker compose ps` and `docker compose logs db`. The host port is **5433**, not 5432.                                                                   |
| Login says the request must come from the game page | Use the exact browser origin from `APP_ORIGIN`. Development uses `http://localhost:5173`; the compiled local app uses the override shown above.                                       |
| Page opens but login/rooms fail                     | Check `http://localhost:2567/health` and the server terminal. A migration error prevents startup. Restart `npm run dev` if its server watcher stopped after build output was removed. |
| Address already in use                              | Stop the previous development or compiled app. Default ports are 5173, 2567 and 5433.                                                                                                 |
| Local settings appear ignored                       | Check exported `NODE_ENV`, `DATABASE_URL` and `APP_ORIGIN`. Shell variables win; production mode does not read `.env.local`.                                                          |
| A fourth player cannot join                         | Expeditions are limited to three players. Villages hold up to 24 visitors.                                                                                                                              |
| Music is silent on first load                       | Click or press a key to satisfy browser autoplay policy, and check the Audio toggle.                                                                                                  |

For the source layout and coding conventions, see [the development guide](docs/development.md).

## Village smoke test

Register, then walk with WASD/arrows and press E near the quartermaster, tailor, inn or one of three portals. Use separate browser profiles to see shared village presence. Run `npx playwright test tests/browser/village.spec.ts` to check the new flow. No migration or new environment setting is required.
