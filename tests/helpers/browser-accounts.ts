import type { BrowserContext } from '@playwright/test';
import { Accounts } from '../../server/src/auth/accounts.js';
import { createPool } from '../../server/src/db/pool.js';
import { databaseUrl } from '../../server/src/env.js';

/** Remove only this test session's account, without consuming the HTTP brute-force budget. */
export async function deleteBrowserAccount(context: BrowserContext, password: string): Promise<void> {
  const url = new URL(databaseUrl());
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Browser fixture cleanup requires local PostgreSQL.');
  const cookie = (await context.cookies('http://localhost:5173')).find(cookie => cookie.name === 'openrpg_session');
  if (!cookie) return;
  for (const page of context.pages()) {
    if (await page.locator('#leave').isVisible()) {
      // A test may already have started the async leave. Native click is a no-op
      // on its disabled button and avoids waiting to click a button that disappears.
      await page.locator('#leave').evaluate((button: HTMLButtonElement) => button.click());
      await page.locator('#lobby').waitFor({ state: 'visible', timeout: 12000 });
    }
  }
  const pool = createPool(url.toString());
  try {
    const accounts = new Accounts(pool), session = await accounts.authenticate(cookie.value);
    await accounts.delete(session, password);
  } finally { await pool.end(); }
}
