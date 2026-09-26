import { test, expect, type Page, type BrowserContext } from '@playwright/test';
interface Actor { x: number; y: number; hp: number; aim: number; generation: number; kills: number; connected: boolean }
interface Snapshot {
  roomId: string; sessionId: string; connected: boolean;
  state: { players: Record<string, Actor>; mobs: Record<string, Actor>; projectiles: Record<string, { kind: string; owner: string; angle: number }>; elapsed: number };
  diagnostics: { x: number; y: number; pending: number; rtt: number; drift: number };
  rendered: Record<string, { x: number; y: number }>;
}
declare global { interface Window { __openrpg: { snapshot(): Snapshot | null; drop(): void; screenPoint(x: number, y: number): { x: number; y: number } | null } } }
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => window.__openrpg.snapshot()!);
async function ready(page: Page): Promise<void> { await expect(page.locator('#game canvas')).toBeVisible(); await expect.poll(async () => (await snapshot(page))?.state.elapsed).toBeGreaterThan(100); }
async function name(page: Page, value: string): Promise<void> { await page.goto('/'); await page.locator('#name').fill(value); }
async function lag(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      private upstream = 0;
      private downstream = 0;
      private counter = 0;
      private delayed = new WeakSet<Event>();
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (!String(url).includes(':2567/')) return;
        this.addEventListener('message', (event) => {
          if (this.delayed.has(event)) return;
          event.stopImmediatePropagation();
          this.downstream = Math.max(performance.now() + this.delay(), this.downstream + 1);
          const replay = new MessageEvent('message', { data: event.data, origin: event.origin });
          this.delayed.add(replay);
          setTimeout(() => { if (this.readyState === Native.OPEN) this.dispatchEvent(replay); }, this.downstream - performance.now());
        });
      }
      private delay(): number { return 75 + Math.sin(++this.counter * 1.73) * 20; }
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (!this.url.includes(':2567/')) { super.send(data); return; }
        // The SDK reuses encoder buffers, so retain the bytes at send time.
        const copy = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice() : data instanceof ArrayBuffer ? data.slice(0) : data;
        this.upstream = Math.max(performance.now() + this.delay(), this.upstream + 1);
        setTimeout(() => { if (this.readyState === Native.OPEN) super.send(copy); }, this.upstream - performance.now());
      }
    };
  });
}
async function shootMage(page: Page): Promise<void> {
  await page.mouse.down();
  const start = Date.now();
  try {
    while (Date.now() - start < 6000) {
      const s = await snapshot(page); if (s.state.mobs['mage-0']!.hp === 0) return;
      const m = s.state.mobs['mage-0']!;
      const target = await page.evaluate(({ x, y }) => window.__openrpg.screenPoint(x, y), m);
      if (target) await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(80);
    }
    throw new Error('Mage did not take lethal damage from browser mouse input');
  } finally { await page.mouse.up(); }
}
for (const delayed of [false, true]) test(`three-player exploration and shared combat${delayed ? ' at 150ms RTT with jitter' : ''}`, async ({ browser }, testInfo) => {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    if (delayed) await lag(context); contexts.push(context);
  }
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  for (const p of pages) p.on('pageerror', e => errors.push(e.message));
  const [host, second, third] = pages as [Page, Page, Page];
  try {
    await name(host, 'Rowan'); await host.getByRole('button', { name: 'Enter the woodland' }).click(); await ready(host);
    const id = (await snapshot(host)).roomId;
    await name(second, 'Juniper'); await expect(second.locator('#rooms')).toContainText("Rowan's expedition");
    await second.locator('#rooms').getByRole('button', { name: 'Join', exact: true }).click(); await ready(second);
    await third.goto(`/?room=${id}`); await third.locator('#name').fill('Ash');
    await third.locator('#join').click(); await ready(third);
    await expect.poll(async () => Object.keys((await snapshot(host)).state.players).length).toBe(3);
    await host.bringToFront();
    await host.mouse.move(700, 530);
    const before = await snapshot(host); await host.keyboard.down('d');
    if (delayed) {
      await expect.poll(async () => { const s = await snapshot(host); return s.diagnostics.x - s.state.players[s.sessionId]!.x; }, { intervals: [10], timeout: 1000 }).toBeGreaterThan(3);
    }
    await host.waitForTimeout(1900); await host.keyboard.up('d');
    await expect.poll(async () => (await snapshot(host)).diagnostics.x).toBeGreaterThan(before.diagnostics.x + 220);
    await host.waitForTimeout(800);
    const moved = await snapshot(host); const authoritative = moved.state.players[moved.sessionId]!;
    expect(Math.abs(moved.diagnostics.x - authoritative.x)).toBeLessThan(1);
    expect(moved.diagnostics.drift).toBeLessThan(8);
    await expect.poll(async () => (await snapshot(second)).state.players[moved.sessionId]!.x).toBeCloseTo(authoritative.x, 0);
    // Aim through a scrolled camera and share the resulting authoritative kill.
    await shootMage(host);
    await expect.poll(async () => (await snapshot(second)).state.mobs['mage-0']!.hp).toBe(0);
    await expect.poll(async () => (await snapshot(third)).state.players[moved.sessionId]!.kills).toBeGreaterThan(0);
    // Sample remote render positions while the player moves through open terrain.
    await host.keyboard.down('a');
    const samples = await second.evaluate(async (sid) => {
      const out: { x: number; time: number }[] = [];
      const end = performance.now() + 800;
      while (performance.now() < end) { await new Promise(requestAnimationFrame); const s = window.__openrpg.snapshot(); if (s?.rendered[sid]) out.push({ x: s.rendered[sid]!.x, time: performance.now() }); }
      return out;
    }, moved.sessionId);
    await host.keyboard.up('a');
    expect(samples.length).toBeGreaterThan(6);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!, b = samples[i]!;
      expect(b.x - a.x).toBeLessThan(3); // no persistent backward correction while moving left
      expect(Math.abs(b.x - a.x)).toBeLessThan(180 * (b.time - a.time) / 1000 + 15);
    }
    // Blur clears a held direction and bow even if no keyup/pointerup arrives.
    await host.keyboard.down('a'); await host.mouse.down();
    await host.evaluate(() => window.dispatchEvent(new Event('blur')));
    await host.waitForTimeout(700); const stopped = await snapshot(host);
    await host.waitForTimeout(400); expect((await snapshot(host)).diagnostics.x).toBeCloseTo(stopped.diagnostics.x, 1);
    await host.keyboard.up('a'); await host.mouse.up();
    await host.screenshot({ path: testInfo.outputPath(delayed ? 'combat-latency.png' : 'combat-three-players.png') });
    await testInfo.attach('network-measurements', { body: JSON.stringify({ before: before.diagnostics, afterMovement: moved.diagnostics, afterCombat: (await snapshot(host)).diagnostics, remoteSamples: samples }, null, 2), contentType: 'application/json' });
    for (const p of pages) await p.getByRole('button', { name: 'Leave', exact: false }).click();
    for (const p of pages) { await expect(p.locator('#lobby')).toBeVisible(); await expect(p.locator('#game canvas')).toHaveCount(0); }
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
test('invite privacy, room errors, capacity, clipboard, reconnect and cleanup', async ({ browser }, testInfo) => {
  test.setTimeout(60000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })));
  const pages = await Promise.all(contexts.map(c => c.newPage())); const [host, a, b, extra] = pages as [Page, Page, Page, Page];
  try {
    await name(host, 'Moss'); await host.locator('#invite').click(); await host.locator('#create').click(); await ready(host);
    const s = await snapshot(host);
    await host.locator('#copy').click(); const link = await host.evaluate(() => navigator.clipboard.readText()); expect(link).toContain(`room=${s.roomId}`);
    await name(extra, 'Fern'); await extra.waitForTimeout(250); await expect(extra.locator('#rooms')).not.toContainText("Moss's expedition");
    await extra.locator('#room-id').fill('does-not-exist'); await extra.locator('#join').click(); await expect(extra.locator('#status')).not.toBeEmpty(); await expect(extra.locator('#play')).toBeHidden();
    for (const [p, n] of [[a, 'Aspen'], [b, 'Willow']] as const) { await p.goto(link); await p.locator('#name').fill(n); await p.locator('#join').click(); await ready(p); }
    await extra.locator('#room-id').fill(s.roomId); await extra.locator('#join').click(); await expect(extra.locator('#status')).toContainText(/full|locked|limit/i);
    await host.evaluate(() => window.__openrpg.drop());
    await expect.poll(async () => (await snapshot(host))?.connected, { timeout: 5000 }).toBe(true);
    expect((await snapshot(host)).sessionId).toBe(s.sessionId);
    await host.keyboard.down('d'); await host.waitForTimeout(300); await host.keyboard.up('d');
    await expect.poll(async () => (await snapshot(host)).diagnostics.x).toBeGreaterThan(260);
    // Real network loss exceeds the recovery window; UI must cleanly return to lobby.
    await contexts[0]!.setOffline(true);
    await expect(host.locator('#recovery')).toBeVisible();
    await expect(host.locator('#lobby')).toBeVisible({ timeout: 18000 }); await expect(host.locator('#game canvas')).toHaveCount(0);
    await expect(host.locator('#status')).toContainText(/reconnect|Connection/);
    await contexts[0]!.setOffline(false);
    await host.screenshot({ path: testInfo.outputPath('reconnect-failure.png') });
    await host.locator('#create').click(); await ready(host);
    expect((await snapshot(host)).roomId).not.toBe(s.roomId);
    await expect(host.locator('#game canvas')).toHaveCount(1);
    await host.keyboard.down('d'); await host.waitForTimeout(250); await host.keyboard.up('d');
    expect((await snapshot(host)).diagnostics.x).toBeGreaterThan(250);
    for (const p of [host, a, b]) await p.locator('#leave').click();
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
test('authoritative death returns to camp with a snapped prediction and protection', async ({ page }) => {
  await name(page, 'Briar'); await page.locator('#create').click(); await ready(page);
  await page.keyboard.down('d'); await page.waitForTimeout(1900); await page.keyboard.up('d');
  await expect.poll(async () => { const s = await snapshot(page); return s.state.players[s.sessionId]!.hp; }, { timeout: 12000 }).toBe(0);
  await expect(page.locator('#combat-status')).toContainText('Returning to camp');
  await expect.poll(async () => { const s = await snapshot(page); return s.state.players[s.sessionId]!.generation; }, { timeout: 4500 }).toBe(1);
  await expect(page.locator('#combat-status')).toContainText('Protected');
  const s = await snapshot(page); const p = s.state.players[s.sessionId]!;
  expect(p.x).toBe(250); expect(p.y).toBe(790); expect(p.hp).toBe(100);
  expect(s.diagnostics.x).toBe(250); expect(s.rendered[s.sessionId]!.x).toBeCloseTo(250, 0);
  await page.locator('#leave').click();
});
