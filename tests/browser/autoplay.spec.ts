import { test, expect, type Page } from '@playwright/test';
interface AudioStatus { state: string; voices: number; audible: boolean }
// Trace snapshots can grant user activation, invalidating autoplay assertions.
test.use({ trace: 'off' });
// Playwright evaluations can grant activation; policy tests must inspect without it.
async function autoplayState(page: Page): Promise<() => Promise<AudioStatus | undefined>> {
  const session = await page.context().newCDPSession(page);
  return async () => {
    const { result } = await session.send('Runtime.evaluate', {
      expression: 'window.__openrpg?.audio()', returnByValue: true, userGesture: false,
    });
    return result.value as AudioStatus | undefined;
  };
}

test('music starts on load when autoplay is permitted', async ({ playwright, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'Chromium-specific autoplay policy flag');
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ baseURL });
    const state = await autoplayState(page);
    await page.goto('/');
    await expect.poll(async () => (await state())?.audible).toBe(true);
    await expect.poll(async () => (await state())?.voices).toBeGreaterThan(0);
  } finally { await browser.close(); }
});

test('a tap on ordinary content starts music when autoplay is blocked', async ({ playwright, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'Chromium-specific autoplay policy flag');
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=document-user-activation-required'] });
  try {
    const page = await browser.newPage({ hasTouch: true, baseURL });
    const state = await autoplayState(page);
    await page.goto('/');
    await expect.poll(async () => (await state())?.state).toBe('suspended');
    expect((await state())?.audible).toBe(false);
    await page.locator('#lobby h1').tap();
    await expect.poll(async () => (await state())?.audible).toBe(true);
    await expect.poll(async () => (await state())?.voices).toBeGreaterThan(0);
    await expect(page.locator('#lobby [data-audio-toggle]')).toHaveAttribute('aria-pressed', 'true');
  } finally { await browser.close(); }
});

