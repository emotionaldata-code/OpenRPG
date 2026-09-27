import { Client } from 'pg';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { databaseUrl } from '../env.js';
export async function migrate(url = databaseUrl(), direction: 'up' | 'down' = 'up'): Promise<void> {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await runner({
      dbClient: client,
      dir: fileURLToPath(new URL('../../migrations/', import.meta.url)),
      migrationsTable: 'pgmigrations',
      direction,
      ...(direction === 'down' ? { count: 1 } : {}),
      singleTransaction: true,
      checkOrder: true,
      verbose: false,
    });
  } finally {
    await client.end();
  }
}
