import { expect, type Page } from '@playwright/test';
import {
  VILLAGE_STATIONS,
  VILLAGE_WALLS,
  MAPS,
  terrainHit,
  nearbyStation,
  type StationId,
  type Point,
} from '@openrpg/shared';
import { Navigation } from '../../server/src/simulation/navigation.js';

export interface VillageSnapshot {
  roomId: string;
  sessionId: string;
  connected: boolean;
  state: {
    players: Record<
      string,
      Point & {
        name: string;
        activity: string;
        characterClass: string;
        skinId: string;
        weapon: string;
        armor: string;
      }
    >;
  };
}
interface VillageDiagnostics {
  village(): VillageSnapshot | null;
  dropVillage(): void;
}
export const villageSnapshot = (page: Page): Promise<VillageSnapshot | null> =>
  page.evaluate(() => (window as unknown as { __openrpg: VillageDiagnostics }).__openrpg.village());
export const dropVillage = (page: Page): Promise<void> =>
  page.evaluate(() =>
    (window as unknown as { __openrpg: VillageDiagnostics }).__openrpg.dropVillage(),
  );
const navigation = new Navigation({
  ...MAPS.forest,
  obstacles: VILLAGE_WALLS.map((wall) => ({ ...wall, kind: 'stone' })),
});

/** Walk with real keyboard input; diagnostics only read positions, never teleport. */
export async function visit(page: Page, id: StationId): Promise<void> {
  await page.bringToFront();
  const station = VILLAGE_STATIONS.find((entry) => entry.id === id)!;
  if (
    (await page.locator('#village-dialog').isVisible()) &&
    (await page.locator('#village-dialog-title').textContent()) === station.name
  ) {
    return;
  }
  if (await page.locator('#village-dialog').isVisible()) {
    await page.locator('#village-close').click();
    await expect(page.locator('#village-dialog')).toBeHidden();
  }
  await expect(page.locator('#loading')).toBeHidden();
  if (await page.locator('#village-retry').isVisible()) {
    await page.locator('#village-retry').click();
  }
  await expect.poll(async () => (await villageSnapshot(page))?.connected).toBe(true);
  await expect
    .poll(async () => {
      const snapshot = await villageSnapshot(page);
      return !!snapshot?.state.players[snapshot.sessionId];
    })
    .toBe(true);
  const held = new Set<string>();
  const until = Date.now() + 20000;
  try {
    while (true) {
      if (Date.now() >= until) {
        throw new Error(`Walking to ${id} timed out`);
      }
      const snapshot = (await villageSnapshot(page))!;
      const self = snapshot.state.players[snapshot.sessionId]!;
      if (Math.hypot(self.x - station.x, self.y - station.y) < 70) {
        for (const key of held) {
          await page.keyboard.up(key);
        }
        held.clear();
        // Stop before checking reach: delayed snapshots and key releases can overshoot.
        await page.waitForTimeout(350);
        const stopped = (await villageSnapshot(page))!;
        if (nearbyStation(stopped.state.players[stopped.sessionId]!)?.id === id) {
          break;
        }
        continue;
      }
      const route = navigation.route(self, station, 10);
      const target = route
        .reverse()
        .find((point) => terrainHit(self, point, 9.99, VILLAGE_WALLS) === null);
      if (!target) {
        throw new Error(`No path to ${id}`);
      }
      const keys = new Set<string>();
      if (Math.abs(target.x - self.x) > 8) {
        keys.add(target.x > self.x ? 'd' : 'a');
      }
      if (Math.abs(target.y - self.y) > 8) {
        keys.add(target.y > self.y ? 's' : 'w');
      }
      for (const key of held) {
        if (!keys.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
      }
      for (const key of keys) {
        await page.keyboard.down(key);
        held.add(key);
      }
      await page.waitForTimeout(70);
    }
  } finally {
    for (const key of held) {
      await page.keyboard.up(key);
    }
  }
  await page.waitForTimeout(150);
  await page.keyboard.press('e');
  await expect(page.locator('#village-dialog'), `Interact at ${id}`).toBeVisible();
  await expect(page.locator('#village-dialog-title')).toHaveText(station.name);
}
export async function registerVillager(page: Page, prefix = 'Village'): Promise<void> {
  await page.goto('/');
  await page.locator('#tab-register').click();
  await page.locator('#username').fill(`${prefix}${Math.random().toString(36).slice(2, 9)}`);
  await page.locator('#password').fill('browser-test-password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#village-game canvas')).toBeVisible();
  await expect
    .poll(async () => Object.keys((await villageSnapshot(page))?.state.players ?? {}).length)
    .toBeGreaterThan(0);
}

export async function services(
  page: Page,
  tab: 'equip' | 'trade' | 'collection' = 'equip',
): Promise<void> {
  await visit(page, 'shop');
  await page.locator(`#shop-${tab}-tab`).click();
}
export async function accountStation(page: Page): Promise<void> {
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#auth-submit')).toBeEnabled();
  if (await page.locator('#auth-screen').isVisible()) {
    return;
  }
  await visit(page, 'account');
}
const lastPortal = new WeakMap<Page, 'testing' | 'story' | 'fight'>();
export async function portal(page: Page, mode?: 'testing' | 'story' | 'fight'): Promise<void> {
  const destination = mode ?? lastPortal.get(page) ?? 'testing';
  lastPortal.set(page, destination);
  await visit(page, destination);
}
