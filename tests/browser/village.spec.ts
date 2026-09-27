import { lag } from '../helpers/network-latency.js';
import { test, expect } from '@playwright/test';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import {
  registerVillager,
  villageSnapshot,
  visit,
  dropVillage,
} from '../helpers/village-browser.js';

test('login opens a shared village; stations, skins, portals, recovery and logout work', async ({
  browser,
}, info) => {
  test.setTimeout(150000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [host, guest] = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  host!.on('pageerror', (error) => errors.push(error.message));
  guest!.on('pageerror', (error) => errors.push(error.message));
  try {
    await host!.goto('/');
    await expect(host!.locator('#auth-form')).toBeVisible();
    await expect(host!.locator('#village')).toBeHidden();
    await expect(host!.locator('#create')).toBeHidden();
    await registerVillager(host!, 'VillageA');
    await registerVillager(guest!, 'VillageB');
    await expect
      .poll(async () => (await villageSnapshot(host!))?.roomId)
      .toBe((await villageSnapshot(guest!))!.roomId);
    const first = (await villageSnapshot(host!))!;
    await expect
      .poll(async () => Object.keys((await villageSnapshot(host!))!.state.players).length)
      .toBeGreaterThanOrEqual(2);
    await host!.screenshot({ path: info.outputPath('shared-village.png') });
    await visit(host!, 'shop');
    await expect
      .poll(async () => (await villageSnapshot(guest!))!.state.players[first.sessionId]?.activity)
      .toBe('shop');
    await host!.locator('#class-mage').click();
    await host!.locator('#shop-trade-tab').click();
    await expect(host!.locator('#shop-items')).toBeVisible();
    await host!.locator('#shop-collection-tab').click();
    await expect(host!.locator('#item-collection')).toBeVisible();
    await host!.locator('#village-close').click();
    await expect(host!.locator('#village-dialog')).toBeHidden();
    await expect
      .poll(
        async () => (await villageSnapshot(guest!))!.state.players[first.sessionId]?.characterClass,
      )
      .toBe('mage');
    await visit(host!, 'wardrobe');
    await host!.locator('#my-skins').click();
    await host!.locator('#skin-name').fill('Village starlight');
    await host!.locator('#skin-save').click();
    await expect(host!.locator('#skin-status')).toContainText('saved');
    await host!.locator('#skin-close').click();
    await host!.locator('#village-close').click();
    await expect(host!.locator('#village-dialog')).toBeHidden();
    await expect
      .poll(async () => (await villageSnapshot(guest!))!.state.players[first.sessionId]?.skinId)
      .not.toBe('');
    await dropVillage(host!);
    await expect
      .poll(async () => (await villageSnapshot(host!))?.connected, { intervals: [10] })
      .toBe(false);
    await expect.poll(async () => (await villageSnapshot(host!))?.connected).toBe(true);
    expect((await villageSnapshot(host!))!.sessionId).toBe(first.sessionId);
    for (const mode of ['testing', 'fight', 'story'] as const) {
      await visit(host!, mode);
      await expect(host!.locator('#destination-note')).toContainText(
        mode === 'testing' ? 'Testing' : mode === 'fight' ? 'Fight' : 'Story',
      );
      await host!.locator('#create').click();
      await expect(host!.locator('#loading')).toBeHidden();
      await expect(host!.locator('#game canvas')).toBeVisible();
      await expect(host!.locator('#room-info')).toContainText(mode.toUpperCase());
      await expect
        .poll(
          async () =>
            Object.values((await villageSnapshot(guest!))!.state.players).filter((player) =>
              player.name.startsWith('VillageA'),
            ).length,
        )
        .toBe(0);
      await host!.locator('#leave').click();
      await expect(host!.locator('#village-game canvas')).toBeVisible();
      await expect
        .poll(
          async () =>
            Object.values((await villageSnapshot(guest!))!.state.players).filter((player) =>
              player.name.startsWith('VillageA'),
            ).length,
        )
        .toBe(1);
    }
    await visit(host!, 'account');
    await expect(host!.locator('#account-name')).toContainText('VillageA');
    await host!.locator('#logout').click();
    await expect(host!.locator('#auth-form')).toBeVisible();
    await expect(host!.locator('#village')).toBeHidden();
    await expect
      .poll(
        async () =>
          Object.values((await villageSnapshot(guest!))!.state.players).filter((player) =>
            player.name.startsWith('VillageA'),
          ).length,
      )
      .toBe(0);
    // Log back in so the shared cleanup helper can remove the fixture account.
    await host!.locator('#password').fill('browser-test-password');
    await host!.locator('#auth-submit').click();
    await expect(host!.locator('#village-game canvas')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) {
      await deleteBrowserAccount(context, 'browser-test-password');
      await context.close();
    }
  }
});

test('three visitors walk and interact under 150ms latency, and dialog typing does not move them', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    for (const context of contexts) {
      await lag(context);
    }
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const page of pages) {
      await registerVillager(page, 'LagVillage');
    }
    const host = pages[0]!,
      witness = pages[1]!;
    await expect
      .poll(async () => Object.keys((await villageSnapshot(host))!.state.players).length)
      .toBeGreaterThanOrEqual(3);
    const id = (await villageSnapshot(host))!.sessionId;
    await visit(host, 'testing');
    await expect
      .poll(async () => (await villageSnapshot(witness))!.state.players[id]?.activity)
      .toBe('testing');
    const before = (await villageSnapshot(host))!.state.players[id]!;
    await host.locator('#room-id').fill('wasd');
    await host.locator('#room-id').press('ArrowLeft');
    await host.waitForTimeout(300);
    const after = (await villageSnapshot(host))!.state.players[id]!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    await host.locator('#join').click();
    await expect(host.locator('#status')).not.toBeEmpty();
    await expect(host.locator('#village-dialog')).toBeVisible();
    await host.locator('#village-close').click();
    await expect(host.locator('#village-dialog')).toBeHidden();
    await host.keyboard.down('d');
    await host.waitForTimeout(600);
    await host.keyboard.up('d');
    await expect
      .poll(async () => (await villageSnapshot(witness))!.state.players[id]!.x)
      .toBeGreaterThan(before.x + 40);
  } finally {
    for (const context of contexts) {
      await deleteBrowserAccount(context, 'browser-test-password');
      await context.close();
    }
  }
});
