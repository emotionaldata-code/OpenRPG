import { portal, services, accountStation } from '../helpers/village-browser.js';
import { lag } from '../helpers/network-latency.js';
import { test, expect, type Page } from '@playwright/test';
import { MAP_IDS } from '@openrpg/shared';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';

const password = 'fight-browser-password';
interface Fighter {
  name: string;
  x: number;
  y: number;
  hp: number;
  kills: number;
  generation: number;
}
interface FightSnapshot {
  roomId: string;
  sessionId: string;
  state: {
    mode: string;
    mapId: string;
    outcome: string;
    mobs: Record<string, unknown>;
    drops: Record<string, unknown>;
    players: Record<string, Fighter>;
  };
}
const snapshot = (page: Page): Promise<FightSnapshot> =>
  page.evaluate(() => window.__openrpg.snapshot() as unknown as FightSnapshot);
async function register(page: Page): Promise<void> {
  await page.goto('/');
  await accountStation(page);
  await page.locator('#tab-register').click();
  await page.locator('#username').fill(`Fight${Math.random().toString(36).slice(2, 10)}`);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#village-game canvas')).toBeVisible();
  await services(page);
  await expect(page.locator('#supplies-status')).toBeEmpty();
}
async function ready(page: Page): Promise<void> {
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.locator('#room-info')).toContainText('FIGHT');
}

test('Fight tab unlocks all maps and opens monster-free rooms', async ({ page }, info) => {
  test.setTimeout(90000);
  await register(page);
  try {
    await portal(page, 'story');
    await expect(page.locator('#map-castle')).toBeDisabled();
    await portal(page, 'fight');
    await expect(page.locator('#fight-rules')).toBeVisible();
    await expect(page.locator('#lives-label')).toHaveText('∞');
    await expect(page.locator('#map-enemies')).toContainText('No monsters');
    await page.screenshot({ path: info.outputPath('fight-menu.png'), fullPage: true });
    for (const mapId of MAP_IDS) {
      await expect(page.locator(`#map-${mapId}`)).toBeEnabled();
      await portal(page);
      await page.locator(`#map-${mapId}`).click();
      await portal(page);
      await page.locator('#create').click();
      await ready(page);
      const { state } = await snapshot(page);
      expect(state.mapId).toBe(mapId);
      expect(state.mode).toBe('fight');
      expect(state.mobs).toEqual({});
      await expect(page.locator('#combat-status')).toContainText('Invite an opponent');
      await page.locator('#leave').click();
      await expect(page.locator('#lobby')).toBeVisible();
    }
    await portal(page, 'testing');
    await expect(page.locator('#map-enemies')).not.toContainText('No monsters');
    await portal(page, 'story');
    await expect(page.locator('#map-castle')).toBeDisabled();
  } finally {
    await deleteBrowserAccount(page.context(), password);
  }
});

for (const delayed of [false, true]) {
  test(`three players share Fight combat and respawns via public listing and room ID${delayed ? ' at 150ms RTT with jitter' : ''}`, async ({
    browser,
    baseURL,
  }, info) => {
    // Includes three village routes at class-specific speeds, network jitter and cleanup.
    test.setTimeout(120000);
    const contexts = await Promise.all(
      [0, 1, 2].map(() => browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })),
    );
    if (delayed) {
      for (const context of contexts) {
        await lag(context);
      }
    }
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const [hero, rival, witness] = pages as [Page, Page, Page];
    const errors: string[] = [];
    for (const page of pages) {
      page.on('pageerror', (error) => errors.push(error.message));
    }
    try {
      for (const page of pages) {
        await register(page);
      }
      await portal(hero, 'fight');
      await services(hero);
      await hero.locator('#class-mage').click();
      await portal(hero);
      await hero.locator('#create').click();
      await ready(hero);
      const host = await snapshot(hero);
      await portal(rival, 'fight');
      const listing = rival
        .locator('.room-row')
        .filter({ hasText: host.state.players[host.sessionId]!.name });
      await expect(listing).toHaveCount(1);
      await listing.getByRole('button', { name: 'Join', exact: true }).click();
      await ready(rival);
      await services(witness);
      await witness.locator('#class-warrior').click();
      await portal(witness);
      await witness.locator('#room-id').fill(host.roomId);
      await portal(witness);
      await witness.locator('#join').click();
      await ready(witness);
      const rivalId = (await snapshot(rival)).sessionId;
      await expect
        .poll(async () => Object.keys((await snapshot(hero)).state.players).length)
        .toBe(3);
      const target = (await snapshot(hero)).state.players[rivalId]!;
      const point = await hero.evaluate(({ x, y }) => window.__openrpg.screenPoint(x, y), target);
      await hero.bringToFront();
      await hero.mouse.click(point!.x, point!.y, { button: 'right' });
      await expect.poll(async () => (await snapshot(witness)).state.players[rivalId]?.hp).toBe(0);
      await expect(hero.locator('#combat-status')).toContainText('1 players defeated');
      await expect
        .poll(async () => (await snapshot(rival)).state.players[rivalId]?.generation, {
          timeout: 6000,
        })
        .toBe(1);
      const after = await snapshot(witness);
      expect(after.state.players[rivalId]!.hp).toBe(100);
      expect(after.state.outcome).toBe('active');
      expect(after.state.mobs).toEqual({});
      expect(after.state.drops).toEqual({});
      await hero.screenshot({ path: info.outputPath('fight-arena.png') });
      for (const page of pages) {
        await page.locator('#leave').click();
        await expect(page.locator('#lobby')).toBeVisible();
      }
      expect(errors).toEqual([]);
    } finally {
      for (const context of contexts) {
        try {
          await deleteBrowserAccount(context, password);
        } finally {
          await context.close();
        }
      }
    }
  });
}
