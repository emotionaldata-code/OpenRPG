import { Adventures } from './adventure/store.js';
import { Skins } from './skins/store.js';
import { appOrigin } from './env.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { Accounts } from './auth/accounts.js';
import { createGameServer } from './app.config.js';
const origin = appOrigin();
await migrate(); // Fail startup if the schema cannot be updated; never serve against a partial migration.
const pool = createPool();
const accounts = new Accounts(pool);
const adventures = new Adventures(pool);
await adventures.prune();
await accounts.prune();
const prune = setInterval(
  () => {
    void accounts.prune().catch(() => console.error('Session cleanup failed.'));
  },
  60 * 60 * 1000,
);
prune.unref();
const server = createGameServer(
  accounts,
  new Skins(pool),
  adventures,
  origin,
  process.env.NODE_ENV === 'production',
);
server.onShutdown(async () => {
  clearInterval(prune);
  await pool.end();
});
await server.listen(Number(process.env.PORT ?? 2567));
