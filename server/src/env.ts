import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export function loadEnvironment(root = fileURLToPath(new URL('../../', import.meta.url)), environment: NodeJS.ProcessEnv = process.env): void {
  // Shell/deployment variables win; local overrides are never read in production.
  const files = environment.NODE_ENV === 'production' ? ['.env'] : ['.env.local', '.env'];
  config({ path: files.map(file => join(root, file)), processEnv: environment, quiet: true });
}
loadEnvironment();
export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value || !/^postgres(?:ql)?:\/\//.test(value)) throw new Error('Set DATABASE_URL to a PostgreSQL URL in root .env.local (development) or .env (production).');
  return value;
}
export function appOrigin(): string {
  const origin = process.env.APP_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (!origin || new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be the exact browser origin, without a trailing slash.');
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('Production APP_ORIGIN requires HTTPS.');
  return origin;
}
