import { visit, portal, services, accountStation } from '../helpers/village-browser.js';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import type { Skin } from '@openrpg/shared';
const password = 'skin-browser-password';
async function register(page: Page): Promise<void> {
  await page.goto('/');
  await accountStation(page);
  await page.locator('#tab-register').click();
  await page.locator('#username').fill(`Skin${Math.random().toString(36).slice(2, 11)}`);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#village-game canvas')).toBeVisible();
}
async function cleanup(context: BrowserContext): Promise<void> {
  try {
    await deleteBrowserAccount(context, password);
  } finally {
    await context.close();
  }
}
const board = (page: Page) =>
  page.locator('#skin-board').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

test('paint, save, reload, equip and synchronize a custom skin to a teammate and reconnect', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [owner, guest] = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  owner!.on('pageerror', (error) => errors.push(error.message));
  try {
    await register(owner!);
    await register(guest!);
    await visit(owner!, 'wardrobe');
    await owner!.locator('#my-skins').click();
    await expect(owner!.locator('#skin-editor')).toBeVisible();
    await expect(owner!.locator('#skin-live canvas')).toBeVisible();
    await owner!.locator('#skin-name').fill('Copper Ranger');
    const original = await board(owner!);
    await owner!.locator('#skin-board').click({ position: { x: 18, y: 18 } });
    const changed = await board(owner!);
    expect(changed).not.toBe(original);
    await owner!.locator('#skin-undo').click();
    expect(await board(owner!)).toBe(original);
    await owner!.locator('#skin-redo').click();
    expect(await board(owner!)).toBe(changed);
    await owner!.locator('[data-tool=eraser]').click();
    await owner!.locator('#skin-board').click({ position: { x: 18, y: 18 } });
    expect(await board(owner!)).toBe(original);
    await owner!.locator('#skin-undo').click();
    await owner!.locator('#skin-color').fill('#ee6633');
    await owner!.locator('#skin-recolor').click();
    await owner!.locator('#skin-direction').selectOption('3');
    await owner!.locator('#skin-frame').selectOption('2');
    await owner!.locator('#skin-zoom').selectOption('16');
    await owner!.locator('#skin-walking').uncheck();
    await owner!.screenshot({ path: 'test-results/skin-workshop-desktop.png', fullPage: true });
    const saved = owner!.waitForResponse(
      (response) => response.url().endsWith('/api/skins') && response.request().method() === 'POST',
    );
    await owner!.locator('#skin-save').click();
    const skin = (await (await saved).json()) as Skin;
    expect(skin.palette).toContain('#ee6633');
    expect(skin.frames).toHaveLength(12);
    await expect(owner!.locator('#skin-status')).toContainText('saved');
    await owner!.locator('#skin-close').click();
    await expect(owner!.locator('#equipped-skin')).toHaveValue(skin.id);
    await owner!.reload();
    await expect(owner!.locator(`#equipped-skin option[value="${skin.id}"]`)).toHaveCount(1);
    await visit(owner!, 'wardrobe');
    await owner!.locator('#equipped-skin').selectOption(skin.id);
    let downloads = 0;
    owner!.on('request', (request) => {
      if (request.url().endsWith(`/api/skins/${skin.id}`)) {
        downloads++;
      }
    });
    await portal(owner!);
    await owner!.locator('#create').click();
    await expect(owner!.locator('#loading')).toBeHidden();
    await expect
      .poll(() =>
        owner!.evaluate(() => {
          const s = window.__openrpg.snapshot();
          return s?.rendered[s.sessionId]?.texture;
        }),
      )
      .toContain(`skin-${skin.id}`);
    const snapshot = await owner!.evaluate(() => window.__openrpg.snapshot()!);
    await services(guest!);
    await portal(guest!);
    await guest!.locator('#room-id').fill(snapshot.roomId);
    await portal(guest!);
    await guest!.locator('#join').click();
    await expect(guest!.locator('#loading')).toBeHidden();
    await expect
      .poll(() =>
        guest!.evaluate(
          (id) => window.__openrpg.snapshot()?.rendered[id]?.texture,
          snapshot.sessionId,
        ),
      )
      .toContain(`skin-${skin.id}`);
    await owner!.evaluate(() => window.__openrpg.drop());
    await expect
      .poll(() => owner!.evaluate(() => window.__openrpg.snapshot()?.connected))
      .toBe(true);
    await expect
      .poll(() =>
        owner!.evaluate(() => {
          const s = window.__openrpg.snapshot()!;
          return s.state.players[s.sessionId]?.skinId;
        }),
      )
      .toBe(skin.id);
    // Each scene caches independently: one village fetch and one expedition fetch.
    expect(downloads).toBe(2);
    await owner!.locator('#leave').click();
    await services(owner!);
    await owner!.locator('#class-mage').click();
    await expect(owner!.locator('#equipped-skin')).toHaveValue('');
    await expect(owner!.locator(`#equipped-skin option[value="${skin.id}"]`)).toHaveCount(0);
    await services(owner!);
    await owner!.locator('#class-archer').click();
    await expect(owner!.locator('#equipped-skin')).toHaveValue(skin.id);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(cleanup));
  }
});

test('all templates, fill and picker, edit-copy, failed-save recovery and account cleanup', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await register(page);
    await visit(page, 'wardrobe');
    await page.locator('#my-skins').click();
    for (const kind of ['mage', 'warrior']) {
      await page.locator('#skin-class').selectOption(kind);
      await page.locator('#skin-reset').click();
      await expect(page.locator('#skin-name')).toHaveValue(`Woodland ${kind}`);
    }
    await page.locator('#skin-color').fill('#eedd00');
    await page.locator('#skin-add-color').click();
    await page.locator('[data-tool=fill]').click();
    await page.locator('#skin-board').click({ position: { x: 5, y: 5 } });
    await page.locator('[data-tool=picker]').click();
    await page.locator('#skin-board').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#skin-color')).toHaveValue('#eedd00');
    await page.route('**/api/skins', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Temporary save failure' }),
          })
        : route.continue(),
    );
    const before = await board(page);
    await page.locator('#skin-save').click();
    await expect(page.locator('#skin-status')).toHaveText('Temporary save failure');
    expect(await board(page)).toBe(before);
    await page.unroute('**/api/skins');
    await page.locator('#skin-name').fill('Golden Guardian');
    await page.locator('#skin-save').click();
    await expect(page.locator('#skin-status')).toContainText('saved');
    await page.locator('#skin-name').fill('Unsaved draft');
    await page.locator('#skin-close').click();
    await visit(page, 'wardrobe');
    await page.locator('#my-skins').click();
    await expect(page.locator('#skin-name')).toHaveValue('Unsaved draft');
    await page.locator('#skin-library').selectOption({ label: 'Golden Guardian · warrior' });
    await page.locator('#skin-copy').click();
    await page.locator('#confirmation-cancel').click();
    await expect(page.locator('#skin-status')).toHaveText('Draft kept.');
    await expect(page.locator('#skin-name')).toHaveValue('Unsaved draft');
    await page.locator('#skin-copy').click();
    await page.locator('#confirmation-accept').click();
    await expect(page.locator('#skin-name')).toHaveValue('Golden Guardian');
    await page.locator('#skin-name').fill('Golden Guardian II');
    await page.locator('#skin-save').click();
    await expect(page.locator('#skin-count')).toHaveText('2 / 32');
    await page.screenshot({ path: 'test-results/skin-workshop-mobile.png', fullPage: true });
    await expect(page.locator('#skin-close')).toBeInViewport();
    await page.locator('#skin-editor').evaluate((dialog) => {
      dialog.scrollTop = 0;
    });
    await page.screenshot({ path: 'test-results/skin-workshop-mobile-top.png' });
    await page.locator('#skin-close').click();
    await expect(page.locator('#skin-live canvas')).toHaveCount(0);
    await accountStation(page);
    await page.locator('#logout').click();
    await expect(page.locator('#my-skins')).toBeHidden();
    await expect(page.locator('#skin-editor')).not.toBeVisible();
    await page.locator('#password').fill(password);
    await page.locator('#auth-submit').click();
    await expect(page.locator('#village-game canvas')).toBeVisible();
  } finally {
    await cleanup(context);
  }
});

test('styled selectors and skin deletion preserve drafts, handle errors, and reset the equipped skin', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await register(page);
    await page.screenshot({ path: 'test-results/lobby-polished.png', fullPage: true });
    await visit(page, 'wardrobe');
    await page.locator('#my-skins').click();
    await expect(page.locator('#skin-copy')).toBeDisabled();
    await expect(page.locator('#skin-delete')).toBeDisabled();
    await page.locator('#skin-name').fill('Willow cloak');
    const saving = page.waitForResponse(
      (response) => response.url().endsWith('/api/skins') && response.request().method() === 'POST',
    );
    await page.locator('#skin-save').click();
    const skin = (await (await saving).json()) as Skin;
    await expect(page.locator('#skin-library')).toHaveValue(skin.id);
    await expect(page.locator('#skin-delete')).toBeEnabled();
    await page.locator('#skin-name').fill('Keep this draft');
    const draft = await board(page);

    // Exercise the actual native select popup, including keyboard and Escape.
    await page.locator('#skin-direction').focus();
    await page.keyboard.press('Space');
    await page.screenshot({ path: 'test-results/styled-dropdown.png' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#skin-direction')).toHaveValue('2');
    await page.locator('#skin-direction').selectOption('1');
    await page.locator('#skin-direction').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    await expect(page.locator('#skin-editor')).toBeVisible();

    await page.locator('#skin-delete').click();
    await expect(page.locator('#confirmation-cancel')).toBeFocused();
    await page.screenshot({ path: 'test-results/skin-delete-confirmation.png' });
    await page.keyboard.press('Escape');
    await expect(page.locator('#skin-count')).toHaveText('1 / 32');
    await expect(page.locator('#skin-delete')).toBeEnabled();

    await page.route(`**/api/skins/${skin.id}`, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Temporary delete failure' }),
          })
        : route.continue(),
    );
    await page.locator('#skin-delete').click();
    await page.locator('#confirmation-accept').click();
    await expect(page.locator('#skin-status')).toHaveText('Temporary delete failure');
    await expect(page.locator('#skin-count')).toHaveText('1 / 32');
    await page.unroute(`**/api/skins/${skin.id}`);
    await page.locator('#skin-delete').click();
    await page.locator('#confirmation-accept').click();
    await expect(page.locator('#skin-status')).toContainText('Skin deleted');
    await expect(page.locator('#skin-count')).toHaveText('0 / 32');
    await expect(page.locator('#skin-library')).toHaveValue('');
    await expect(page.locator('#skin-delete')).toBeDisabled();
    await expect(page.locator('#skin-name')).toHaveValue('Keep this draft');
    expect(await board(page)).toBe(draft);
    await page.locator('#skin-close').click();
    await expect(page.locator('#equipped-skin')).toHaveValue('');
    await expect(page.locator('#equipped-skin option')).toHaveCount(1);
    await page.reload();
    await accountStation(page);
    await visit(page, 'wardrobe');
    await page.locator('#my-skins').click();
    await expect(page.locator('#skin-count')).toHaveText('0 / 32');
    expect(errors).toEqual([]);
  } finally {
    await cleanup(context);
  }
});
