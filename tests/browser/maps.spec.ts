import { portal, services, accountStation } from '../helpers/village-browser.js';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import { test, expect } from '@playwright/test';
import { Navigation } from '../../server/src/simulation/navigation.js';
import { terrainHit } from '../../shared/src/world/collision.js';
import { MAP_IDS, MAPS } from '../../shared/src/world/map.js';

test('five destinations preview, create, render, and leave cleanly', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const password = 'browser-test-password';
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await accountStation(page);
  await page.locator('#tab-register').click();
  await page.locator('#username').fill(`Map${Math.random().toString(36).slice(2, 10)}`);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#village-game canvas')).toBeVisible();
  for (const mapId of MAP_IDS) {
    await portal(page);
    await page.locator(`#map-${mapId}`).click();
    await expect(page.locator(`#map-${mapId}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#map-title')).toHaveText(MAPS[mapId].name);
  }
  await page.screenshot({ path: testInfo.outputPath('destinations.png'), fullPage: true });
  await services(page);
  await expect(page.locator('#supplies-status')).toBeEmpty();
  try {
    for (const mapId of MAP_IDS) {
      await portal(page);
      await page.locator(`#map-${mapId}`).click();
      await expect(page.locator('#destination-note')).toContainText(MAPS[mapId].name);
      await portal(page);
      await page.locator('#create').click();
      await expect(page.locator('#loading')).toBeHidden();
      await expect(page.locator('#game canvas')).toBeVisible();
      await expect(page.locator('#room-info')).toContainText(MAPS[mapId].subtitle.toUpperCase());
      const details = await page.evaluate(() => {
        const snapshot = window.__openrpg.snapshot()!;
        return {
          state: snapshot.state as unknown as {
            mapId: string;
            mobs: Record<string, { role: string }>;
          },
          diagnostics: snapshot.diagnostics,
        };
      });
      expect(details.state.mapId).toBe(mapId);
      expect(
        Object.values(details.state.mobs)
          .map((m) => m.role)
          .sort(),
      ).toEqual(MAPS[mapId].enemies.map((m) => m.role).sort());
      await page.keyboard.down('d');
      await page.waitForTimeout(1200);
      await page.keyboard.up('d');
      expect(
        (await page.evaluate(() => window.__openrpg.snapshot()!.diagnostics)).drift,
      ).toBeLessThan(8);
      await page.screenshot({ path: testInfo.outputPath(`${mapId}.png`) });
      await page.locator('#leave').click();
      await expect(page.locator('#lobby')).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally {
    await deleteBrowserAccount(page.context(), password);
  }
});

test('forest route reaches the boss and changes music on its first hit', async ({ page }, info) => {
  test.setTimeout(210000);
  const password = 'boss-browser-password';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await accountStation(page);
  await page.locator('#tab-register').click();
  await page.locator('#username').fill(`Boss${Math.random().toString(36).slice(2, 10)}`);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#village-game canvas')).toBeVisible();
  const keys = new Set<string>();
  try {
    await services(page);
    await page.locator('#class-warrior').click();
    await services(page);
    await page.locator('#potion-count').fill('3');
    await expect(page.locator('#supplies-status')).toBeEmpty();
    await portal(page);
    await page.locator('#create').click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(page.locator('#combat-status')).toContainText('Elderroot: 450/450 HP');
    const navigation = new Navigation(MAPS.forest);
    let heardBoss = false;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const snapshot = await page.evaluate(() => {
        const s = window.__openrpg.snapshot()!;
        const state = s.state as unknown as {
          elapsed: number;
          players: Record<
            string,
            {
              x: number;
              y: number;
              hp: number;
              generation: number;
              nextSpecialAt: number;
            }
          >;
          mobs: Record<
            string,
            {
              x: number;
              y: number;
              hp: number;
              generation: number;
              role: string;
              engaged: boolean;
            }
          >;
        };
        const audio = (
          window as unknown as { __openrpg: { audio(): { music: string } } }
        ).__openrpg.audio();
        return { state, player: state.players[s.sessionId]!, music: audio.music };
      });
      const { state, player } = snapshot;
      // Testing permits deaths; resume the route after the normal camp respawn.
      if (player.hp <= 0) {
        await page.mouse.up();
        for (const key of keys) {
          await page.keyboard.up(key);
        }
        keys.clear();
        await page.waitForTimeout(100);
        continue;
      }
      if (player.hp < 70) {
        await page.keyboard.press('r');
      }
      const mobs = Object.values(state.mobs),
        boss = mobs.find((m) => m.role === 'boss')!;
      if (boss.engaged && boss.hp > 0 && !heardBoss) {
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (
                  window as unknown as { __openrpg: { audio(): { music: string } } }
                ).__openrpg.audio().music,
            ),
          )
          .toBe('boss');
        heardBoss = true;
        expect(
          mobs.filter((m) => m.role !== 'boss' && m.generation === 0 && m.hp > 0),
        ).toHaveLength(0);
        await page.screenshot({ path: info.outputPath('forest-boss-battle.png') });
        break;
      }
      const guard = mobs
        .filter((m) => m.role !== 'boss' && m.generation === 0 && m.hp > 0)
        .sort(
          (a, b) =>
            Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
        )[0];
      const target = guard ?? boss;
      const clear = terrainHit(player, target, 12, MAPS.forest.obstacles) === null;
      const distance = Math.hypot(player.x - target.x, player.y - target.y);
      const route = navigation.route(player, target, 10);
      const next = route.find((point) => Math.hypot(point.x - player.x, point.y - player.y) > 18);
      const wanted = new Set<string>();
      if ((!clear || distance > 45) && next) {
        if (Math.abs(next.x - player.x) > 12) {
          wanted.add(next.x > player.x ? 'd' : 'a');
        }
        if (Math.abs(next.y - player.y) > 12) {
          wanted.add(next.y > player.y ? 's' : 'w');
        }
      }
      for (const key of keys) {
        if (!wanted.has(key)) {
          await page.keyboard.up(key);
          keys.delete(key);
        }
      }
      for (const key of wanted) {
        if (!keys.has(key)) {
          await page.keyboard.down(key);
          keys.add(key);
        }
      }
      if (clear && distance < 80) {
        const point = await page.evaluate(
          (target) => window.__openrpg.screenPoint(target.x, target.y),
          target,
        );
        expect(point).not.toBeNull();
        await page.mouse.move(point!.x, point!.y);
        if (state.elapsed >= player.nextSpecialAt) {
          await page.mouse.click(point!.x, point!.y, { button: 'right' });
        }
        // Quick sweeps make this a route/engagement check; charge timing has separate coverage.
        await page.mouse.click(point!.x, point!.y);
      }
      await page.waitForTimeout(80);
    }
    expect(heardBoss).toBe(true);
    expect(
      (await page.evaluate(() => window.__openrpg.snapshot()!.diagnostics)).drift,
    ).toBeLessThan(8);
    expect(errors).toEqual([]);
    await page.locator('#leave').click();
    await expect(page.locator('#lobby')).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __openrpg: { audio(): { music: string } } }).__openrpg.audio()
            .music,
      ),
    ).toBe('menu');
  } finally {
    await page.mouse.up();
    for (const key of keys) {
      await page.keyboard.up(key);
    }
    await deleteBrowserAccount(page.context(), password);
  }
});
