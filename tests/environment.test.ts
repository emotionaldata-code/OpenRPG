import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from '../server/src/env.js';
test('local development overrides .env, production ignores .env.local, shell values always win', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openrpg-env-'));
  try {
    await writeFile(
      join(root, '.env'),
      'DATABASE_URL=production-db\nAPP_ORIGIN=https://game.example\n',
    );
    await writeFile(
      join(root, '.env.local'),
      'DATABASE_URL=local-db\nAPP_ORIGIN=http://localhost:5173\n',
    );
    const development: NodeJS.ProcessEnv = {};
    loadEnvironment(root, development);
    assert.equal(development.DATABASE_URL, 'local-db');
    const production: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    loadEnvironment(root, production);
    assert.equal(production.DATABASE_URL, 'production-db');
    assert.equal(production.APP_ORIGIN, 'https://game.example');
    const shell: NodeJS.ProcessEnv = { NODE_ENV: 'production', DATABASE_URL: 'shell-db' };
    loadEnvironment(root, shell);
    assert.equal(shell.DATABASE_URL, 'shell-db');
  } finally {
    await rm(root, { recursive: true });
  }
});
