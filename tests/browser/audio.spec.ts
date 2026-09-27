import { test, expect, type Page } from '@playwright/test';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
interface AudioStatus { state: string; voices: number; music: string; charging: boolean; enabled: boolean; audible: boolean }
const audioState = (page: Page): Promise<AudioStatus> => page.evaluate(() => (window as unknown as { __openrpg: { audio(): AudioStatus } }).__openrpg.audio());
test('audio preference, keyboard toggle, background suspension and unavailable-browser fallback', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  const toggle = page.locator('#lobby [data-audio-toggle]');
  await page.locator('#lobby h1').click();
  await expect.poll(async () => (await audioState(page)).audible).toBe(true);
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await audioState(page)).state).toBe('suspended');
  await expect.poll(async () => (await audioState(page)).voices).toBe(0);
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false'); expect((await audioState(page)).state).toBe('locked');
  await toggle.click(); await expect.poll(async () => (await audioState(page)).audible).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await audioState(page)).state).toBe('suspended');
  await expect.poll(async () => (await audioState(page)).voices).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('#tab-adventurer').click();
  await expect.poll(async () => (await audioState(page)).audible).toBe(true);
  await page.screenshot({ path: '/tmp/openrpg-audio-menu.png' });
  await page.addInitScript(() => { Object.defineProperty(window, 'AudioContext', { value: undefined }); });
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#tab-adventurer').click();
  await expect(toggle).toBeDisabled();
});

test('original recipes render non-silent bounded audio, with a bounded voice pool', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  const results = await page.evaluate(async () => {
    const synthPath = '/src/audio/synth.ts', soundPath = '/src/audio/sounds.ts';
    const { Synth } = await import(synthPath), { SOUNDS } = await import(soundPath);
    const rendered = [];
    for (const [name, recipe] of Object.entries(SOUNDS)) {
      const context = new OfflineAudioContext(1, 44100, 44100), synth = new Synth(context);
      for (const tone of recipe as object[]) synth.tone(tone);
      const samples = (await context.startRendering()).getChannelData(0);
      let energy = 0, peak = 0;
      for (const sample of samples) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
      rendered.push({ name, rms: Math.sqrt(energy / samples.length), peak });
    }
    const context = new OfflineAudioContext(1, 44100, 44100), synth = new Synth(context);
    for (let i = 0; i < 100; i++) synth.tone({ wave: 'sine', hz: 300, duration: .2, volume: .1 });
    const count = synth.activeVoices; await context.startRendering();
    // Firefox dispatches source `ended` tasks after the offline render resolves.
    const deadline = performance.now() + 1000;
    while (synth.activeVoices && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    return { rendered, count, remaining: synth.activeVoices };
  });
  expect(results.count).toBe(32); expect(results.remaining).toBe(0);
  expect(results.rendered.length).toBeGreaterThan(20);
  for (const result of results.rendered) {
    expect(result.rms, result.name).toBeGreaterThan(.0001);
    expect(result.peak, result.name).toBeLessThan(1);
  }
});

test('both complete music scores render audibly without clipping or exhausting voices', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  const results = await page.evaluate(async () => {
    const synthPath = '/src/audio/synth.ts', musicPath = '/src/audio/music.ts';
    const { Synth } = await import(synthPath), { MUSIC, musicStep } = await import(musicPath);
    const rendered: { mode: string; rms: number; peak: number; voices: number }[] = [];
    for (const mode of ['menu', 'adventure']) {
      const score = MUSIC[mode], steps = score.bars[0].melody.length;
      for (let bar = 0; bar < score.bars.length; bar++) {
        // Render one bar at a time; offline pre-scheduling has no real-time voice cleanup.
        const context = new OfflineAudioContext(1, Math.ceil((steps * score.step + 1) * 22050), 22050);
        const synth = new Synth(context);
        for (let step = 0; step < steps; step++) {
          const index = bar * steps + step;
          for (const tone of musicStep(mode, index)) synth.tone(tone, 1, step * score.step);
        }
        const voices = synth.activeVoices;
        const samples = (await context.startRendering()).getChannelData(0);
        let energy = 0, peak = 0;
        for (const sample of samples) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
        rendered.push({ mode, rms: Math.sqrt(energy / samples.length), peak, voices });
      }
    }
    return rendered;
  });
  expect(results).toHaveLength(32);
  for (const result of results) {
    expect(result.rms, result.mode).toBeGreaterThan(.001);
    expect(result.peak, result.mode).toBeLessThan(.5);
    expect(result.voices, result.mode).toBeLessThan(32);
  }
});

test('adventure audio shares mute state; charging, disconnect and leaving clean up', async ({ page, context }) => {
  const password = 'browser-test-password';
  try {
    await page.goto('/'); await page.locator('#tab-adventurer').click(); await page.locator('#tab-register').click();
    await page.locator('#username').fill(`Audio${Math.random().toString(36).slice(2, 9)}`);
    await page.locator('#password').fill(password); await page.locator('#auth-submit').click();
    await expect(page.locator('#account-profile')).toBeVisible();
    await page.locator('#tab-adventure').click(); await expect(page.locator('#supplies-status')).toBeEmpty();
    await page.locator('#class-mage').click(); await page.locator('#create').click();
    await expect(page.locator('#loading')).toBeHidden(); await expect(page.locator('#game canvas')).toBeVisible();
    expect((await audioState(page)).music).toBe('adventure');
    const toggle = page.locator('#play [data-audio-toggle]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const canvas = (await page.locator('#game canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2 + 100, canvas.y + canvas.height / 2);
    await page.mouse.down(); await expect.poll(async () => (await audioState(page)).charging).toBe(true);
    await page.screenshot({ path: '/tmp/openrpg-audio-adventure.png' });
    await page.mouse.up(); await expect.poll(async () => (await audioState(page)).charging).toBe(false);
    await toggle.click(); await expect.poll(async () => (await audioState(page)).voices).toBe(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await page.mouse.move(canvas.x + canvas.width / 2 + 100, canvas.y + canvas.height / 2);
    await page.mouse.down(); await expect.poll(async () => (await audioState(page)).charging).toBe(true);
    await page.evaluate(() => window.__openrpg.drop()); await page.mouse.up();
    await expect.poll(async () => (await audioState(page)).charging).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__openrpg.snapshot()?.connected)).toBe(true);
    await page.locator('#leave').click(); await expect(page.locator('#lobby')).toBeVisible();
    expect((await audioState(page)).music).toBe('menu'); expect((await audioState(page)).charging).toBe(false);
    await page.locator('#lobby [data-audio-toggle]').click();
    await expect.poll(async () => (await audioState(page)).voices).toBe(0);
    await expect(page.locator('#play [data-audio-toggle]')).toHaveAttribute('aria-pressed', 'false');
  } finally { await deleteBrowserAccount(context, password); }
});
