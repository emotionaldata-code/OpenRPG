# Accounts and persistence

[Documentation index](README.md) · [Local database setup](../README.local.md)

## Ownership

| Source                                 | Responsibility                                                      |
| -------------------------------------- | ------------------------------------------------------------------- |
| `server/src/auth/`                     | Username/password accounts, hashed sessions, cookies and revocation |
| `server/src/skins/`                    | Owned immutable pixel designs and HTTP access                       |
| `server/src/adventure/store.ts`        | Collection, supplies, trades, admission and progress transactions   |
| `server/src/adventure/rewards.ts`      | Room-owned serialized save/retry queue                              |
| `server/src/http/middleware.ts`        | Shared origin checks and HTTP errors                                |
| `server/src/db/`, `server/migrations/` | PostgreSQL pool, migration runner and schema history                |

## Trust boundary

Accounts use case-insensitive unique usernames, Argon2id password hashes and opaque cookies backed by expiring hashed session tokens. HTTP writes require the configured origin and JSON; SQL is parameterized. Room authentication checks the session, admission rechecks it, and reconnect checks it again. Names come from the account, never the join payload.

Room state carries only public gameplay/appearance fields. Class, equipped choices and village position are not account columns. Session expiry uses timers; revocation reaches rooms in this process. Cross-process revocation and rate-limit storage require separate work before horizontal scaling.

## Transactions and rewards

`Adventures.embark` locks the adventurer row, validates Story unlocks, class/gear ownership and supplies, then deducts packed potions atomically. Reconnection does not call it again. Trades use server catalog prices and a row lock; balances cannot go negative. Selling equipment affects future admission, not an existing room snapshot.

Ground loot is ephemeral until collected. Collection queues `(accountId, eventId, reward)`; the database's unique receipt makes retries idempotent. Never regenerate the event ID on retry. Story completion uses a distinct event and sequential unlock checks; only surviving participants earn progress.

`Rewards` runs one write at a time. The room pauses on storage error or a backlog of 64 entries; a five-second room timer retries. Normal leave requests a flush; disposal attempts remaining writes. This is an in-memory queue: process crashes can lose unsaved rewards. Receipt pruning after seven days does not make it a durable job queue.

Skin saves create immutable IDs; ownership/class validation happens before equipping. Account deletion cascades through owned records. Preserve ownership and deletion rules when adding tables.

## Adding persistent data

1. Define the feature's request/response types in shared code only if both packages consume them. Keep SQL row types local to the store.
2. Create a migration with `npm run db:migration -- descriptive_name`; edit its Up/Down sections in `server/migrations/`.
3. Add parameterized queries beside the owning feature. Use a transaction/row lock when a concurrent request could overspend or duplicate a reward. Do not add SQL to movement, combat or render loops.
4. Wire an authenticated endpoint in that feature's `http.ts`, then call it through `client/src/api/http.ts`. Validate payloads and ownership server-side.
5. Test fresh migrations, upgrade from the preceding schema, ownership rejection, concurrent writes and deletion behavior. Never edit a deployed migration; use a forward migration.

`server/src/env.ts` loads shell variables first, then `.env.local`, then `.env` in development. Production ignores `.env.local`. Startup applies pending migrations before listening; failure stops startup. The runner uses ordered migrations in a transaction with an advisory lock. Ship `server/migrations/` alongside compiled output.

`npm run db:migrate` applies pending migrations; `npm run db:rollback` undoes one locally and can delete data. Production rollback is disabled by the CLI. See [local setup](../README.local.md) for Docker and [the root README](../README.md#database-and-migrations) for deployment configuration.
