# Verification workflow

[Documentation index](README.md) · [First-time setup](../README.local.md)

## Commands

From the root, with dependencies installed:

```sh
npm run db:up
npm run check
```

`check` runs lint, formatting, workspace/test typechecks, unit/integration tests and builds. PostgreSQL is required. Stop the dev watcher before the complete build/check cycle to avoid generated-output restarts. For a focused simulation run:

```sh
npm run build -w @openrpg/shared
npx tsx --test tests/combat.test.ts tests/enemy-tactics.test.ts
```

For browser coverage, use the development app rather than a compiled server occupying port 2567:

```sh
npx playwright install chromium
npm run test:browser -- tests/browser/maps.spec.ts
```

Playwright starts or reuses `localhost:5173`; a reused app also needs a healthy game server. Test account cleanup is part of the fixture lifecycle. Failures leave screenshots/traces in `test-results/`; inspect them before adding sleeps or retries.

## Choose checks by behavior

| Change                          | Primary tests under `tests/`                                                    | Browser checks under `tests/browser/`                |
| ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Movement, collision, prediction | `simulation.test.ts`, `maps.test.ts`, `integration.test.ts`                     | `game.spec.ts`, `maps.spec.ts`                       |
| Abilities, AI, mode rules       | `combat.test.ts`, `enemy-tactics.test.ts`, `adventure.test.ts`, `fight.test.ts` | `maps.spec.ts`, `adventure.spec.ts`, `fight.spec.ts` |
| Accounts, sessions, migrations  | `accounts.test.ts`, `environment.test.ts`, `integration.test.ts`                | `accounts.spec.ts`                                   |
| Inventory, trading, rewards     | `adventure.test.ts`, `loot-shop.test.ts`, `integration.test.ts`                 | `loot-shop.spec.ts`, `adventure.spec.ts`             |
| Skin validation/rendering       | `skins.test.ts`                                                                 | `skins.spec.ts`                                      |
| Audio/autoplay                  | `audio.test.ts`                                                                 | `audio.spec.ts`, `autoplay.spec.ts`                  |
| Village stations/lifecycle      | `village.test.ts`, `integration.test.ts`                                        | `village.spec.ts`                                    |

Test invariants, not copies of the implementation. Useful cases include malformed intent, queue floods, diagonal normalization, corner sliding, swept hits, attack cancellation on death, duplicate reward retries, unauthorized ownership and one-life Story completion. Art/CSS changes need visual inspection more than new unit tests.

## Multiplayer regression

For networking/lifecycle changes, exercise three independent authenticated browser contexts, public and invite joins, capacity errors, leave/rejoin, focus loss, reconnect success and timeout. Repeat movement/combat with the existing latency helper (`tests/helpers/network-latency.ts`) at approximately 150 ms RTT plus jitter. Check local responsiveness, remote smoothness and correction convergence; a smooth local frame alone does not prove authority works.

Village navigation fixtures walk to stations and wait for authoritative proximity; do not replace those checks with teleporting. Browser actions and simulation patches have separate timing—wait on meaningful state instead of assuming a fixed short sleep is enough.

## Data isolation and evidence

`tests/helpers/database.ts` creates uniquely named databases on local PostgreSQL and refuses remote hosts. Browser tests instead use the running app's database and register/delete their own accounts. Never reset the normal game database or delete accounts merely because their names look like fixtures.

Record commands, actual results and remaining gaps in [verification history](verification.md) for substantial changes. Update current behavior docs when rules change; historical successful runs are not evidence that a new change passed.
