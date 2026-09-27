import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import { test, expect, type Page } from '@playwright/test';
import { createPool } from '../../server/src/db/pool.js';
import { Adventures } from '../../server/src/adventure/store.js';
import type { AdventureProfile, WorldState } from '@openrpg/shared';
const password = 'adventure-browser-password';
async function register(page: Page): Promise<string> {
  await page.goto('/'); await page.locator('#tab-adventurer').click(); await page.locator('#tab-register').click();
  await page.locator('#username').fill(`Journey${Math.random().toString(36).slice(2, 9)}`);
  await page.locator('#password').fill(password); await page.locator('#auth-submit').click();
  await expect(page.locator('#account-profile')).toBeVisible();
  return (await (await page.request.get('/api/auth/me')).json()).id as string;
}
const profile = async (page: Page): Promise<AdventureProfile> => await (await page.request.get('/api/adventure')).json() as AdventureProfile;
const state = async (page: Page) => page.evaluate(() => {
  const snapshot = window.__openrpg.snapshot()!;
  const world = snapshot.state as unknown as WorldState;
  return { ...world, player: (snapshot.state.players[snapshot.sessionId] as unknown as { hp: number; potions: number; invulnerableUntil: number; generation: number; armor: string }) };
});
async function cleanup(page: Page): Promise<void> { await deleteBrowserAccount(page.context(), password); }

test('accessible path tabs, collection, class equipment and spent supplies persist across reload', async ({ page }, info) => {
  test.setTimeout(55000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = await register(page);
  const pool = createPool();
  try {
    await expect(page.locator('#collection-summary')).toContainText('3 health potions');
    await page.locator('#tab-testing').focus(); await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-story')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#map-castle')).toBeDisabled(); await expect(page.locator('#map-forest')).toBeEnabled();
    await page.screenshot({ path: info.outputPath('story-collection.png'), fullPage: true });
    // Seed only this test account's earned rewards; room combat rewards are tested separately.
    await new Adventures(pool).reward(id, `browser-${id}`, { items: ['iron-sword', 'iron-armor'], potions: 0, completedMap: 'forest' });
    await page.locator('#prepare-adventure').click(); await page.locator('#supplies-retry').click();
    await expect(page.locator('#map-castle')).toBeEnabled(); await expect(page.locator('#map-paradise')).toBeDisabled();
    await page.locator('#class-warrior').click();
    await page.locator('#loadout-weapon').getByRole('button', { name: 'Kingsguard sword' }).click();
    await page.locator('#loadout-armor').getByRole('button', { name: 'Kingsguard armor' }).click();
    await page.locator('#potion-count').fill('2');
    await page.screenshot({ path: info.outputPath('expedition-equipment.png'), fullPage: true });
    await page.locator('#map-castle').click(); await page.locator('#create').click(); await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#room-info')).toContainText('STORY'); await expect(page.locator('#potion-hud')).toContainText('2 health potions');
    expect((await state(page)).player.armor).toBe('iron-armor');
    await page.mouse.click(800, 500, { button: 'right' });
    await expect.poll(async () => { const s = await state(page); return s.player.invulnerableUntil - s.elapsed; }).toBeGreaterThan(4300);
    await page.keyboard.press('r'); expect((await state(page)).player.potions).toBe(2); // Full health.
    await page.locator('#leave').click(); await expect(page.locator('#lobby')).toBeVisible();
    expect((await profile(page)).potions).toBe(1);
    await page.reload(); await page.locator('#tab-adventurer').click();
    await expect(page.locator('#collection-summary')).toContainText('2 / 6 relics');
    await expect(page.locator('#collection-summary')).toContainText('1 health potion');
    await expect(page.locator('.item-card.owned')).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('adventurer-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await pool.end(); await cleanup(page); }
});

test('R heals with carried supplies and Story death never respawns', async ({ page }, info) => {
  test.setTimeout(55000);
  await register(page);
  try {
    await page.locator('#tab-adventure').click(); await expect(page.locator('#supplies-status')).toBeEmpty();
    await page.locator('#tab-story').click(); await page.locator('#potion-count').fill('2');
    await page.locator('#create').click(); await expect(page.locator('#loading')).toBeHidden();
    await page.keyboard.down('d'); await page.waitForTimeout(1900); await page.keyboard.up('d');
    await expect.poll(async () => (await state(page)).player.hp, { timeout: 12000 }).toBeLessThan(100);
    await page.keyboard.press('r');
    await expect.poll(async () => (await state(page)).player.potions).toBe(1);
    await expect.poll(async () => (await state(page)).player.hp, { timeout: 20000 }).toBe(0);
    await expect(page.locator('#expedition-result')).toContainText('party has fallen');
    await page.waitForTimeout(3500);
    const s = await state(page); expect(s.player.hp).toBe(0); expect(s.player.generation).toBe(0); expect(s.outcome).toBe('failed');
    await page.keyboard.press('r'); expect((await state(page)).player.potions).toBe(1);
    await page.screenshot({ path: info.outputPath('story-defeat.png') });
    await page.locator('#leave').click(); await expect(page.locator('#lobby')).toBeVisible();
    expect((await profile(page)).potions).toBe(1); expect((await profile(page)).completedMaps).toBe(0);
  } finally { await cleanup(page); }
});
