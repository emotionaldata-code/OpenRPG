import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import { test, expect, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
interface Actor { name: string; characterClass: string; skinId: string; x: number; y: number; hp: number; aim: number; generation: number; kills: number; connected: boolean; nextAttackAt: number; nextSpecialAt: number; invulnerableUntil: number; sweepAt: number; chargeStartedAt: number }
interface Snapshot {
  chargeProgress: number | null; roomId: string; sessionId: string; connected: boolean;
  state: { drops: Record<string, { owner: string; itemId: string; x: number; y: number }>; players: Record<string, Actor>; mobs: Record<string, Actor>; projectiles: Record<string, { kind: string; owner: string; angle: number }>; elapsed: number };
  diagnostics: { x: number; y: number; pending: number; rtt: number; drift: number };
  rendered: Record<string, { x: number; y: number; texture?: string; equipment?: string[] }>;
}
declare global { interface Window { __openrpg: { snapshot(): Snapshot | null; drop(): void; screenPoint(x: number, y: number): { x: number; y: number } | null } } }
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => window.__openrpg.snapshot()!);
async function ready(page: Page): Promise<void> { await expect(page.locator('#loading')).toBeHidden(); await expect(page.locator('#game canvas')).toBeVisible(); await expect.poll(async () => (await snapshot(page))?.state.elapsed).toBeGreaterThan(100); }
const testPassword = 'browser-test-password';
async function name(page: Page, value: string, url = '/'): Promise<void> {
  await page.goto(url);
  await page.locator('#tab-adventurer').click(); await page.locator('#tab-register').click();
  await page.locator('#username').fill(`${value}${Math.random().toString(36).slice(2, 7)}`);
  await page.locator('#password').fill(testPassword);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#account-profile')).toBeVisible();
  await page.locator('#tab-adventure').click(); await expect(page.locator('#supplies-status')).toBeEmpty();
}
async function cleanup(context: BrowserContext): Promise<void> {
  try { await deleteBrowserAccount(context, testPassword); } finally { await context.close(); }
}
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
async function collectVest(page: Page): Promise<void> {
  const held = new Set<string>(), end = Date.now() + 10000;
  try {
    while (Date.now() < end) {
      const snapshot = await page.evaluate(() => window.__openrpg.snapshot()!);
      const drop = Object.values(snapshot.state.drops).find(drop => drop.owner === snapshot.sessionId && drop.itemId === 'scout-vest');
      if (!drop) return;
      const player = snapshot.state.players[snapshot.sessionId]!;
      if (player.hp > 0 && player.hp < 60) await page.keyboard.press('r');
      const dx = drop.x - snapshot.diagnostics.x, dy = drop.y - snapshot.diagnostics.y;
      const next = new Set<string>();
      if (Math.abs(dx) > 8) next.add(dx > 0 ? 'd' : 'a');
      if (Math.abs(dy) > 8) next.add(dy > 0 ? 's' : 'w');
      for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      await page.waitForTimeout(70);
    }
    throw new Error('Could not walk to the dropped vest');
  } finally { for (const key of held) await page.keyboard.up(key); }
}
async function shootMage(page: Page): Promise<void> {
  let holding = false, release: Promise<void> | undefined;
  const start = Date.now();
  let previous: { x: number; y: number; at: number } | undefined;
  try {
    while (Date.now() - start < 15000) {
      const s = await snapshot(page); if (s.state.mobs['ranged-0']!.hp === 0) return;
      const m = s.state.mobs['ranged-0']!;
      const self = s.state.players[s.sessionId]!, at = s.state.elapsed;
      const travel = Math.hypot(m.x - self.x, m.y - self.y) / 480 + Math.min(.4, s.diagnostics.rtt / 1000);
      if (self.hp > 0 && self.hp <= 60) await page.keyboard.press('r');
      const elapsed = previous ? (at - previous.at) / 1000 : 0;
      const velocity = previous && elapsed > 0 ? { x: (m.x - previous.x) / elapsed, y: (m.y - previous.y) / elapsed } : { x: 0, y: 0 };
      const target = await page.evaluate(({ x, y }) => window.__openrpg.screenPoint(x, y), { x: m.x + velocity.x * travel, y: m.y + velocity.y * travel });
      previous = { x: m.x, y: m.y, at };
      if (target) await page.mouse.move(target.x, target.y);
      if (!holding && self.chargeStartedAt < 0 && self.nextAttackAt <= s.state.elapsed) {
        await page.mouse.down(); holding = true;
        // Charge timing must not wait for the slower aim/telemetry loop.
        release = page.waitForTimeout(720).then(async () => { await page.mouse.up(); holding = false; });
      }
      await page.waitForTimeout(80);
    }
    throw new Error('Mage did not take lethal damage from browser mouse input');
  } finally { await release; await page.mouse.up(); }
}
for (const delayed of [false, true]) test(`three-player exploration and shared combat${delayed ? ' at 150ms RTT with jitter' : ''}`, async ({ browser }, testInfo) => {
  test.setTimeout(90000);
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
    await name(host, 'Rowan'); await host.locator('#potion-count').fill('3'); await host.getByRole('button', { name: 'Start expedition' }).click(); await ready(host);
    const id = (await snapshot(host)).roomId;
    await name(second, 'Juniper'); await second.locator('#class-mage').click(); await expect(second.locator('#class-mage')).toHaveAttribute('aria-pressed', 'true'); await expect(second.locator('#rooms')).toContainText('Rowan');
    const hostState = await snapshot(host), hostName = hostState.state.players[hostState.sessionId]!.name;
    await second.locator('#rooms .room-row').filter({ hasText: hostName }).getByRole('button', { name: 'Join', exact: true }).click(); await ready(second);
    await name(third, 'Ash', `/?room=${id}`); await third.locator('#class-warrior').click(); await expect(third.locator('#class-warrior')).toHaveAttribute('aria-pressed', 'true');
    await third.locator('#join').click(); await ready(third);
    await expect.poll(async () => Object.keys((await snapshot(host)).state.players).length).toBe(3);
    expect(Object.values((await snapshot(host)).state.players).map(p => p.characterClass).sort()).toEqual(['archer', 'mage', 'warrior']);
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
    // Loot is visible before collection, then persists only after walking over it.
    await expect.poll(() => host.evaluate(() => {
      const state = window.__openrpg.snapshot()!.state as unknown as { drops: Record<string, { itemId: string; owner: string }> };
      return Object.values(state.drops).some(drop => drop.itemId === 'scout-vest');
    })).toBe(true);
    await expect.poll(async () => (await snapshot(second)).state.mobs['ranged-0']!.hp).toBe(0);
    await expect.poll(async () => (await snapshot(third)).state.players[moved.sessionId]!.kills).toBeGreaterThan(0);
    await host.screenshot({ path: testInfo.outputPath('ground-loot.png') });
    await collectVest(host);
    await expect.poll(async () => (await (await host.request.get('/api/adventure')).json()).items).toContainEqual({ id: 'scout-vest', quantity: 1 });
    // Let the forward pickup walk settle before measuring a direction reversal.
    await host.waitForTimeout(500);
    const pickupX = (await snapshot(host)).state.players[moved.sessionId]!.x;
    await expect.poll(async () => (await snapshot(second)).rendered[moved.sessionId]!.x).toBeCloseTo(pickupX, 0);
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
    // Reuse these accounts in a fresh room to check abilities from safe spawn positions.
    await host.locator('#create').click(); await ready(host);
    const abilityRoom = (await snapshot(host)).roomId;
    for (const page of [second, third]) {
      await page.locator('#room-id').fill(abilityRoom); await page.locator('#join').click(); await ready(page);
    }
    await checkAbilities(pages, testInfo);
    for (const page of pages) await page.locator('#leave').click();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => cleanup(c))); }
});
test('invite privacy, room errors, capacity, clipboard, reconnect and cleanup', async ({ browser }, testInfo) => {
  test.setTimeout(60000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })));
  const pages = await Promise.all(contexts.map(c => c.newPage())); const [host, a, b, extra] = pages as [Page, Page, Page, Page];
  try {
    await name(host, 'Moss'); await host.locator('#invite').click(); await host.locator('#create').click(); await ready(host);
    const s = await snapshot(host);
    await host.locator('#copy').click(); const link = await host.evaluate(() => navigator.clipboard.readText()); expect(link).toContain(`room=${s.roomId}`);
    await name(extra, 'Fern'); await extra.waitForTimeout(250); await expect(extra.locator('#rooms')).not.toContainText('Moss');
    await extra.locator('#room-id').fill('does-not-exist'); await extra.locator('#join').click(); await expect(extra.locator('#status')).not.toBeEmpty(); await expect(extra.locator('#play')).toBeHidden();
    for (const [p, n] of [[a, 'Aspen'], [b, 'Willow']] as const) { await name(p, n, link); await p.locator('#join').click(); await ready(p); }
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
  } finally { await Promise.all(contexts.map(c => cleanup(c))); }
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
  await deleteBrowserAccount(page.context(), testPassword);
});

async function checkAbilities(pages: Page[], testInfo: TestInfo): Promise<void> {
  const kinds = ['archer', 'mage', 'warrior'] as const;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!, kind = kinds[i]!;
    await page.bringToFront();
    const initial = await snapshot(page), self = initial.state.players[initial.sessionId]!;
    const aim = await page.evaluate(({ x, y }) => window.__openrpg.screenPoint(x + 180, y), self);
    const target = aim ?? { x: 700, y: 520 };
    await page.mouse.move(target.x, target.y);
    await expect(page.locator('#ability-primary')).toContainText(kind === 'archer' ? 'Arrow' : kind === 'mage' ? 'Fireball' : 'Sword sweep');
    await expect(page.locator('#ability-special')).toContainText(kind === 'archer' ? 'Arrow storm' : kind === 'mage' ? 'Inferno' : 'Iron will');
    await page.mouse.click(target.x, target.y); // Fast taps must survive a frame without a fixed step.
    await expect.poll(async () => { const s = await snapshot(page); return s.state.players[s.sessionId]!.nextAttackAt; }).toBeGreaterThan(0);
    if (kind !== 'warrior') await expect.poll(async () => { const s = await snapshot(page); return Object.values(s.state.projectiles).some(p => p.owner === s.sessionId && p.kind === (kind === 'mage' ? 'fireball' : 'arrow')); }).toBe(true);
    await page.mouse.click(target.x, target.y, { button: 'right' });
    await expect.poll(async () => { const s = await snapshot(page); return s.state.players[s.sessionId]!.nextSpecialAt; }).toBeGreaterThan(0);
    const first = await snapshot(page), player = first.state.players[first.sessionId]!;
    await expect(page.locator('#ability-special')).not.toHaveClass(/ready/);
    const owned = Object.values(first.state.projectiles).filter(p => p.owner === first.sessionId);
    if (kind === 'archer') expect(owned.filter(p => p.kind === 'arrow').length).toBeGreaterThanOrEqual(12);
    if (kind === 'mage') expect(owned.map(p => p.kind)).toContain('inferno'); // The earlier fireball may already have hit terrain.
    if (kind === 'warrior') {
      expect(owned.length).toBe(0); expect(player.sweepAt).toBeGreaterThan(0);
      expect(player.invulnerableUntil - first.state.elapsed).toBeGreaterThan(3000);
      await expect(page.locator('#ability-special')).toHaveClass(/active/);
      await expect.poll(async () => (await snapshot(pages[0]!)).state.players[first.sessionId]!.invulnerableUntil).toBe(player.invulnerableUntil);
    }
    await page.mouse.click(700, 520, { button: 'right' }); await page.waitForTimeout(300);
    expect((await snapshot(page)).state.players[first.sessionId]!.nextSpecialAt).toBe(player.nextSpecialAt);
    await page.screenshot({ path: testInfo.outputPath(`${kind}-abilities.png`) });
    if (kind === 'warrior') {
      // Releasing one mouse button must not release the other; blur clears both.
      await page.mouse.down(); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
      await expect.poll(async () => { const s = await snapshot(page); return s.state.players[s.sessionId]!.chargeStartedAt; }).toBeGreaterThanOrEqual(0);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.waitForTimeout(600); const cleared = (await snapshot(page)).state.players[first.sessionId]!.nextAttackAt;
      await page.waitForTimeout(900); expect((await snapshot(page)).state.players[first.sessionId]!.nextAttackAt).toBe(cleared);
      await page.mouse.up();
      await expect(page.locator('#ability-primary')).toHaveClass(/ready/);
      await expect(page.locator('#ability-special')).not.toHaveClass(/active/, { timeout: 4500 });
    }
    await page.evaluate(() => window.__openrpg.drop());
    await expect.poll(async () => (await snapshot(page)).connected, { timeout: 5000 }).toBe(true);
    expect((await snapshot(page)).state.players[first.sessionId]!.nextSpecialAt).toBe(player.nextSpecialAt);
  }
}

for (const delayed of [false, true]) test(`charge rings, release, overcharge and cancellation${delayed ? ' with 150ms RTT' : ''}`, async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  const context = await browser.newContext(); if (delayed) await lag(context);
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await name(page, 'Charge');
    for (const kind of ['archer', 'mage', 'warrior'] as const) {
      await page.locator(`#class-${kind}`).click(); await page.locator('#create').click(); await ready(page);
      const before = await snapshot(page), duration = kind === 'mage' ? 2000 : kind === 'warrior' ? 700 : 1000;
      const aim = await page.evaluate(p => window.__openrpg.screenPoint(p.x + 160, p.y), before.state.players[before.sessionId]!);
      await page.mouse.move(aim!.x, aim!.y); await page.mouse.down();
      await expect.poll(async () => (await snapshot(page)).chargeProgress, { intervals: [10] }).not.toBeNull();
      if (delayed) expect((await snapshot(page)).state.players[before.sessionId]!.chargeStartedAt).toBe(-1);
      await expect.poll(async () => (await snapshot(page)).chargeProgress, { intervals: [10] }).toBeGreaterThanOrEqual(.66);
      const charged = await snapshot(page);
      expect(charged.state.players[charged.sessionId]!.nextAttackAt).toBe(0);
      if (!delayed) await page.screenshot({ path: testInfo.outputPath(`${kind}-charge.png`) });
      if (kind === 'warrior') await page.keyboard.down('d');
      await page.mouse.up();
      await expect.poll(async () => { const s = await snapshot(page); return s.state.players[s.sessionId]!.nextAttackAt; }).toBeGreaterThan(0);
      if (kind === 'warrior') {
        await page.screenshot({ path: testInfo.outputPath('warrior-sweep.png') });
        await page.keyboard.up('d'); expect((await snapshot(page)).diagnostics.x).toBeGreaterThan(before.diagnostics.x);
      }
      await page.waitForTimeout(duration + 250);
      await page.mouse.down(); await page.waitForTimeout(duration * 1.1);
      expect((await snapshot(page)).chargeProgress).toBe(1);
      const overcharged = await snapshot(page), deadline = overcharged.state.players[overcharged.sessionId]!.nextAttackAt;
      await page.waitForTimeout(150); expect((await snapshot(page)).state.players[overcharged.sessionId]!.nextAttackAt).toBe(deadline);
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
      await page.waitForTimeout(350);
      const cancelled = await snapshot(page);
      expect(cancelled.chargeProgress).toBeNull(); expect(cancelled.state.players[cancelled.sessionId]!.chargeStartedAt).toBe(-1);
      expect(cancelled.state.players[cancelled.sessionId]!.nextAttackAt).toBe(deadline);
      await page.mouse.down(); await page.waitForTimeout(200); await page.evaluate(() => window.__openrpg.drop()); await page.mouse.up();
      await expect.poll(async () => (await snapshot(page)).connected, { timeout: 5000 }).toBe(true);
      await page.waitForTimeout(400);
      const recovered = await snapshot(page); expect(recovered.chargeProgress).toBeNull(); expect(recovered.state.players[recovered.sessionId]!.chargeStartedAt).toBe(-1);
      expect(recovered.state.players[recovered.sessionId]!.nextAttackAt).toBe(deadline);
      await page.locator('#leave').click(); await expect(page.locator('#lobby')).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally { await cleanup(context); }
});
