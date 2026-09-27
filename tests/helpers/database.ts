import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { databaseUrl } from '../../server/src/env.js';
import { migrate } from '../../server/src/db/migrate.js';
/** Tests own an isolated throwaway database, never tables in the developer's game DB. */
export async function testDatabase() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? databaseUrl());
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(
      'Tests require a local PostgreSQL URL. Refusing to create test databases on a remote server.',
    );
  }
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  const name = `openrpg_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 3 });
  let closing = false;
  pool.on('error', (error: Error & { code?: string }) => {
    if (!(closing && error.code === '57P01')) {
      throw error;
    }
  });
  const cleanup = async () => {
    closing = true;
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  };
  try {
    await migrate(url.toString());
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { pool, url: url.toString(), cleanup };
}
