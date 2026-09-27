import { visit, portal, services, accountStation } from '../helpers/village-browser.js';
import { test, expect, type Page } from '@playwright/test';
import { createPool } from '../../server/src/db/pool.js';
import { Adventures } from '../../server/src/adventure/store.js';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import type { AdventureProfile, Skin } from '@openrpg/shared';
const password = 'loot-shop-browser-password';
async function register(page: Page): Promise<string> {
  await page.goto('/');
  await accountStation(page);
  await page.locator('#tab-register').click();
  await page.locator('#username').fill(`Trader${Math.random().toString(36).slice(2, 9)}`);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#village-game canvas')).toBeVisible();
  return (await (await page.request.get('/api/auth/me')).json()).id as string;
}
const profile = async (page: Page): Promise<AdventureProfile> =>
  (await page.request.get('/api/adventure')).json();
test('shop buys and sells stacks, resets sold loadouts, persists balances and displays pixel artwork', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const id = await register(page),
    pool = createPool();
  try {
    await new Adventures(pool).reward(id, `shop-${id}`, {
      items: ['oak-bow', 'oak-bow', 'scout-vest'],
      potions: 0,
      coins: 200,
    });
    await services(page);
    await page.locator('#supplies-retry').click();
    await expect(page.locator('#gear-weapon-oak-bow')).toBeVisible();
    await services(page);
    await page.locator('#gear-weapon-oak-bow').click();
    await accountStation(page);
    await services(page, 'collection');
    await expect(page.locator('.item-card').filter({ hasText: 'Oathwood bow' })).toContainText(
      'Owned ×2',
    );
    await services(page, 'collection');
    await expect(page.locator('#item-collection img')).toHaveCount(6);
    await services(page, 'collection');
    await expect(page.locator('#collection-supplies img')).toHaveCount(2);
    await page.locator('#shop-collection-tab').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#shop-trade-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#shop-coins')).toContainText('230 coins');
    const bow = page.locator('[data-item=oak-bow]');
    await bow.getByRole('button', { name: 'Sell 1' }).click();
    await expect(bow).toContainText('satchel: 1');
    await bow.getByRole('button', { name: 'Sell 1' }).click();
    await expect(bow).toContainText('satchel: 0');
    await expect(bow.getByRole('button', { name: 'Sell 1' })).toBeDisabled();
    await services(page);
    await expect(page.locator('#gear-weapon-default')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gear-weapon-oak-bow')).toHaveCount(0);
    await services(page, 'trade');
    await bow.getByRole('button', { name: 'Buy 1' }).click();
    await expect(bow).toContainText('satchel: 1');
    await page.locator('[data-item=potion]').getByRole('button', { name: 'Buy 1' }).click();
    await expect(page.locator('#shop-coins')).toContainText('180 coins');
    await page.screenshot({ path: info.outputPath('shop-desktop.png'), fullPage: true });
    const saved = await profile(page);
    expect(saved.coins).toBe(180);
    expect(saved.potions).toBe(4);
    await page.reload();
    await services(page, 'trade');
    await expect(page.locator('#shop-coins')).toContainText('180 coins');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('shop-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await pool.end();
    await deleteBrowserAccount(page.context(), password);
  }
});
test('equipped armor and weapon overlay a custom skin and animate with its frame', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const id = await register(page),
    pool = createPool();
  try {
    await new Adventures(pool).reward(id, `gear-${id}`, {
      items: ['oak-bow', 'scout-vest'],
      potions: 0,
    });
    await visit(page, 'wardrobe');
    await page.locator('#my-skins').click();
    await page.locator('#skin-name').fill('Copper Wanderer');
    await page.locator('#skin-color').fill('#ee6633');
    await page.locator('#skin-recolor').click();
    const saved = page.waitForResponse(
      (response) => response.url().endsWith('/api/skins') && response.request().method() === 'POST',
    );
    await page.locator('#skin-save').click();
    const skin = (await (await saved).json()) as Skin;
    await page.locator('#skin-close').click();
    await services(page);
    await page.locator('#supplies-retry').click();
    await services(page);
    await page.locator('#gear-weapon-oak-bow').click();
    await services(page);
    await page.locator('#gear-armor-scout-vest').click();
    await portal(page);
    await page.locator('#create').click();
    await expect(page.locator('#loading')).toBeHidden();
    const appearance = () =>
      page.evaluate(() => {
        const s = window.__openrpg.snapshot()!;
        return s.rendered[s.sessionId]!;
      });
    await expect.poll(async () => (await appearance()).texture).toContain(`skin-${skin.id}`);
    expect(
      (await appearance()).equipment?.map((key) => key.split('-').slice(0, -2).join('-')),
    ).toEqual(['gear-scout-vest', 'gear-oak-bow']);
    await page.keyboard.down('d');
    await page.waitForTimeout(400);
    const walking = await appearance();
    await page.keyboard.up('d');
    const frame = walking.texture!.split('-').slice(-2).join('-');
    expect(walking.equipment).toEqual([`gear-scout-vest-${frame}`, `gear-oak-bow-${frame}`]);
    await page.screenshot({ path: info.outputPath('custom-skin-equipment.png') });
    const unchanged = (await (await page.request.get(`/api/skins/${skin.id}`)).json()) as Skin;
    expect(unchanged.frames).toEqual(skin.frames);
  } finally {
    await pool.end();
    await deleteBrowserAccount(page.context(), password);
  }
});
