import { test, expect } from '@playwright/test';
import { CLASS_MOVEMENT, type CharacterClass } from '@openrpg/shared';
import { accountStation, portal, services } from '../helpers/village-browser.js';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import { lag } from '../helpers/network-latency.js';

test('three classes dodge toward the mouse despite movement keys, with cooldowns and convergent prediction at 150ms RTT', async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(150000);
  const password = 'mobility-browser-password';
  const classes: CharacterClass[] = ['warrior', 'archer', 'mage'];
  const contexts = await Promise.all(classes.map(() => browser.newContext({ baseURL })));
  const errors: string[] = [];
  let roomId = '';
  try {
    for (const [i, context] of contexts.entries()) {
      await lag(context);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await accountStation(page);
      await page.locator('#tab-register').click();
      await page.locator('#username').fill(`Dodge${Math.random().toString(36).slice(2, 10)}`);
      await page.locator('#password').fill(password);
      await page.locator('#auth-submit').click();
      await expect(page.locator('#village-game canvas')).toBeVisible();
      await services(page);
      await page.locator(`#class-${classes[i]}`).click();
      await portal(page, 'fight');
      if (i === 0) {
        await page.locator('#create').click();
      } else {
        await page.locator('#room-id').fill(roomId);
        await page.locator('#join').click();
      }
      await expect(page.locator('#game canvas')).toBeVisible();
      await expect(page.locator('#ability-dash')).toContainText('Ready');
      roomId = await page.evaluate(() => window.__openrpg.snapshot()!.roomId);
    }
    for (const [i, context] of contexts.entries()) {
      const page = context.pages()[0]!;
      const snapshot = () =>
        page.evaluate(() => {
          const s = window.__openrpg.snapshot()!;
          const state = s.state as unknown as {
            players: Record<
              string,
              { x: number; y: number; nextDashAt: number; dashAngle: number }
            >;
          };
          return {
            ...state.players[s.sessionId]!,
            drift: s.diagnostics.drift,
            pending: s.diagnostics.pending,
          };
        });
      await page.bringToFront();
      const before = await snapshot();
      const point = await page.evaluate(
        ({ x, y }) => window.__openrpg.screenPoint(x, y - 150),
        before,
      );
      await page.mouse.move(point!.x, point!.y);
      await page.keyboard.down('a');
      await page.keyboard.down('q');
      await expect.poll(async () => (await snapshot()).nextDashAt).toBeGreaterThan(0);
      await page.keyboard.up('a');
      const cooldown = (await snapshot()).nextDashAt;
      expect(Math.abs((await snapshot()).dashAngle + Math.PI / 2)).toBeLessThan(0.15);
      const distance = CLASS_MOVEMENT[classes[i]!].dash.distance;
      await expect
        .poll(async () => Math.abs((await snapshot()).y - before.y + distance))
        .toBeLessThan(2);
      await expect.poll(async () => (await snapshot()).drift).toBeLessThan(8);
      await page.keyboard.up('q');
      await page.keyboard.press('q');
      expect((await snapshot()).nextDashAt).toBe(cooldown);
      await expect(page.locator('#ability-dash')).toContainText(
        CLASS_MOVEMENT[classes[i]!].dash.name,
      );
      await page.screenshot({ path: info.outputPath(`${classes[i]}-dash.png`) });
      // Holding Q past cooldown must not auto-dodge.
      await page.keyboard.down('q');
      await expect(page.locator('#ability-dash')).toContainText('Ready', { timeout: 8000 });
      expect((await snapshot()).nextDashAt).toBe(cooldown);
      await page.keyboard.up('q');
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
