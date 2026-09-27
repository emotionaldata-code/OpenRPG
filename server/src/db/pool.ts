import { Pool } from 'pg';
import { databaseUrl } from '../env.js';
export function createPool(connectionString = databaseUrl()): Pool {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', () => console.error('An idle PostgreSQL connection failed.'));
  return pool;
}
