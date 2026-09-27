import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import { test, expect } from '@playwright/test';
import { MAP_IDS, MAPS } from '../../shared/src/map.js';

test('five destinations preview, create, render, and leave cleanly', async ({ page }, testInfo) => {
  test.setTimeout(75000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const password = 'browser-test-password';
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  for (const mapId of MAP_IDS) {
    await page.locator(`#map-${mapId}`).click();
    await expect(page.locator(`#map-${mapId}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#map-title')).toHaveText(MAPS[mapId].name);
  }
  await page.screenshot({ path: testInfo.outputPath('destinations.png'), fullPage: true });
  await page.locator('#tab-adventurer').click(); await page.locator('#tab-register').click();
  await page.locator('#username').fill(`Map${Math.random().toString(36).slice(2, 10)}`);
  await page.locator('#password').fill(password); await page.locator('#auth-submit').click();
  await expect(page.locator('#account-profile')).toBeVisible();
  await page.locator('#tab-adventure').click(); await expect(page.locator('#supplies-status')).toBeEmpty();
  try {
    for (const mapId of MAP_IDS) {
      await page.locator(`#map-${mapId}`).click();
      await expect(page.locator('#destination-note')).toContainText(MAPS[mapId].name);
      await page.locator('#create').click(); await expect(page.locator('#loading')).toBeHidden();
      await expect(page.locator('#game canvas')).toBeVisible();
      await expect(page.locator('#room-info')).toContainText(MAPS[mapId].subtitle.toUpperCase());
      const details = await page.evaluate(() => {
        const snapshot = window.__openrpg.snapshot()!;
        return { state: snapshot.state as unknown as { mapId: string; mobs: Record<string, { role: string }> }, diagnostics: snapshot.diagnostics };
      });
      expect(details.state.mapId).toBe(mapId);
      expect(Object.values(details.state.mobs).map(m => m.role).sort()).toEqual(['boss', 'melee', 'melee', 'ranged']);
      await page.keyboard.down('d'); await page.waitForTimeout(1200); await page.keyboard.up('d');
      expect((await page.evaluate(() => window.__openrpg.snapshot()!.diagnostics)).drift).toBeLessThan(8);
      await page.screenshot({ path: testInfo.outputPath(`${mapId}.png`) });
      await page.locator('#leave').click(); await expect(page.locator('#lobby')).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally { await deleteBrowserAccount(page.context(), password); }
});
