import { portal, services, accountStation } from '../helpers/village-browser.js';
import { lag } from '../helpers/network-latency.js';
import { MAPS, terrainHit } from '@openrpg/shared';
import { Navigation } from '../../server/src/simulation/navigation.js';
import { deleteBrowserAccount } from '../helpers/browser-accounts.js';
import { test, expect, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
interface Actor {
  name: string;
  characterClass: string;
  skinId: string;
  x: number;
  y: number;
  hp: number;
  aim: number;
  generation: number;
  kills: number;
  connected: boolean;
  ready: boolean;
  lastAttackAt: number;
  nextSpecialAt: number;
  invulnerableUntil: number;
  sweepAt: number;
  chargeStartedAt: number;
  stunnedUntil: number;
}
interface Snapshot {
  chargeProgress: number | null;
  roomId: string;
  sessionId: string;
  connected: boolean;
  state: {
    drops: Record<string, { owner: string; itemId: string; x: number; y: number }>;
    players: Record<string, Actor>;
    mobs: Record<string, Actor>;
    projectiles: Record<string, { kind: string; owner: string; angle: number }>;
    elapsed: number;
  };
  diagnostics: { x: number; y: number; pending: number; rtt: number; drift: number };
  rendered: Record<string, { x: number; y: number; texture?: string; equipment?: string[] }>;
}
declare global {
  interface Window {
    __openrpg: {
      snapshot(): Snapshot | null;
      drop(): void;
      screenPoint(x: number, y: number): { x: number; y: number } | null;
    };
  }
}
const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => window.__openrpg.snapshot()!);
async function ready(page: Page): Promise<void> {
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect.poll(async () => (await snapshot(page))?.state.elapsed).toBeGreaterThan(100);
  await expect
    .poll(async () => {
      const s = await snapshot(page);
      return s.state.players[s.sessionId]?.connected;
    })
    .toBe(true);
}
const testPassword = 'browser-test-password';
async function name(page: Page, value: string, url = '/'): Promise<void> {
  await page.goto(url);
  await accountStation(page);
  await page.locator('#tab-register').click();
  await page.locator('#username').fill(`${value}${Math.random().toString(36).slice(2, 7)}`);
  await page.locator('#password').fill(testPassword);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#village-game canvas')).toBeVisible();
  await services(page);
  await expect(page.locator('#supplies-status')).toBeEmpty();
}
async function cleanup(context: BrowserContext): Promise<void> {
  try {
    await deleteBrowserAccount(context, testPassword);
  } finally {
    await context.close();
  }
}
async function collectVest(page: Page): Promise<void> {
  await page.bringToFront();
  const held = new Set<string>(),
    end = Date.now() + 10000;
  try {
    while (Date.now() < end) {
      const snapshot = await page.evaluate(() => window.__openrpg.snapshot()!);
      const drop = Object.values(snapshot.state.drops).find(
        (drop) => drop.owner === snapshot.sessionId && drop.itemId === 'scout-vest',
      );
      if (!drop) {
        return;
      }
      const player = snapshot.state.players[snapshot.sessionId]!;
      if (player.hp > 0 && player.hp < 60) {
        await page.keyboard.press('r');
      }
      const dx = drop.x - snapshot.diagnostics.x,
        dy = drop.y - snapshot.diagnostics.y;
      const next = new Set<string>();
      if (Math.abs(dx) > 8) {
        next.add(dx > 0 ? 'd' : 'a');
      }
      if (Math.abs(dy) > 8) {
        next.add(dy > 0 ? 's' : 'w');
      }
      for (const key of held) {
        if (!next.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
      }
      for (const key of next) {
        if (!held.has(key)) {
          await page.keyboard.down(key);
          held.add(key);
        }
      }
      await page.waitForTimeout(70);
    }
    throw new Error('Could not walk to the dropped vest');
  } finally {
    for (const key of held) {
      await page.keyboard.up(key);
    }
  }
}
async function shootMage(page: Page): Promise<void> {
  await page.bringToFront();
  const held = new Set<string>();
  const navigation = new Navigation(MAPS.forest);
  let holding = false,
    release: Promise<void> | undefined;
  const start = Date.now();
  let previous: { x: number; y: number; at: number } | undefined;
  try {
    while (Date.now() - start < 25000) {
      const s = await snapshot(page);
      if (s.state.mobs['ranged-0']!.hp === 0) {
        return;
      }
      const m = s.state.mobs['ranged-0']!;
      const self = s.state.players[s.sessionId]!,
        at = s.state.elapsed;
      // Pursue retreating enemies around cover instead of firing into a wall.
      const position = self;
      const next = new Set<string>();
      if (
        self.hp > 0 &&
        (Math.hypot(m.x - position.x, m.y - position.y) > 125 ||
          terrainHit(position, m, 3, MAPS.forest.obstacles) !== null)
      ) {
        const point = navigation
          .route(position, m, 10)
          .find((p) => Math.hypot(p.x - position.x, p.y - position.y) > 12);
        if (point) {
          if (Math.abs(point.x - position.x) > 8) {
            next.add(point.x > position.x ? 'd' : 'a');
          }
          if (Math.abs(point.y - position.y) > 8) {
            next.add(point.y > position.y ? 's' : 'w');
          }
        }
      }
      for (const key of held) {
        if (!next.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
      }
      for (const key of next) {
        if (!held.has(key)) {
          await page.keyboard.down(key);
          held.add(key);
        }
      }
      const travel =
        Math.hypot(m.x - position.x, m.y - position.y) / 480 +
        Math.min(0.4, s.diagnostics.rtt / 1000);
      if (self.hp > 0 && self.hp <= 60) {
        await page.keyboard.press('r');
      }
      const elapsed = previous ? (at - previous.at) / 1000 : 0;
      const velocity =
        previous && elapsed > 0
          ? { x: (m.x - previous.x) / elapsed, y: (m.y - previous.y) / elapsed }
          : { x: 0, y: 0 };
      const target = await page.evaluate(({ x, y }) => window.__openrpg.screenPoint(x, y), {
        x: m.x + velocity.x * travel,
        y: m.y + velocity.y * travel,
      });
      previous = { x: m.x, y: m.y, at };
      if (target) {
        await page.mouse.move(target.x, target.y);
        if (self.nextSpecialAt <= at && Math.hypot(m.x - position.x, m.y - position.y) < 180) {
          await page.mouse.click(target.x, target.y, { button: 'right' });
        }
      }
      if (!holding && self.chargeStartedAt < 0) {
        await page.mouse.down();
        holding = true;
        // Charge timing must not wait for the slower aim/telemetry loop.
        release = page
          .waitForTimeout(self.characterClass === 'mage' ? 1440 : 720)
          .then(async () => {
            await page.mouse.up();
            holding = false;
          });
      }
      await page.waitForTimeout(80);
    }
    throw new Error('Mage did not take lethal damage from browser mouse input');
  } finally {
    for (const key of held) {
      await page.keyboard.up(key);
    }
    await release;
    await page.mouse.up();
  }
}
test('loading screen blocks movement and combat until the scene is visible', async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext();
  await lag(context);
  const page = await context.newPage();
  try {
    await name(page, 'Loading');
    await portal(page);
    await page.locator('#create').click();
    await expect.poll(async () => !!(await snapshot(page))).toBe(true);
    await expect(page.locator('#loading')).toBeVisible();
    const before = await snapshot(page);
    const player = before.state.players[before.sessionId]!;
    expect(player.ready).toBe(false);
    await page.keyboard.down('d');
    await page.keyboard.press('q');
    await page.keyboard.press('r');
    await page.mouse.down({ button: 'right' });
    // Observe several simulation ticks behind the actual loading overlay.
    await page.waitForTimeout(400);
    const loading = await snapshot(page);
    expect(loading.state.players[loading.sessionId]).toMatchObject({
      x: player.x,
      y: player.y,
      hp: player.hp,
      connected: false,
      ready: false,
      nextSpecialAt: 0,
      nextDashAt: 0,
      chargeStartedAt: -1,
    });
    expect(loading.diagnostics.pending).toBe(0);
    expect(loading.rendered[loading.sessionId]!.x).toBe(player.x);
    await page.keyboard.up('d');
    await page.mouse.up({ button: 'right' });
    await ready(page);
    const spawned = await snapshot(page);
    expect(spawned.state.players[spawned.sessionId]).toMatchObject({
      x: player.x,
      y: player.y,
      hp: player.hp,
      ready: true,
      nextSpecialAt: 0,
      nextDashAt: 0,
    });
    await page.keyboard.down('d');
    await expect
      .poll(async () => {
        const s = await snapshot(page);
        return s.state.players[s.sessionId]!.x;
      })
      .toBeGreaterThan(player.x + 15);
    await page.keyboard.up('d');
  } finally {
    await cleanup(context);
  }
});

test('ordinary shots do not stun; Q stuns normal mobs and walking contact stuns the player', async ({
  browser,
}, info) => {
  test.setTimeout(60000);
  const context = await browser.newContext(),
    page = await context.newPage();
  const held = new Set<string>(),
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await name(page, 'Stun');
    await page.locator('#class-warrior').click();
    await portal(page);
    await page.locator('#create').click();
    await ready(page);
    const navigation = new Navigation(MAPS.forest),
      deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const s = await snapshot(page),
        mob = s.state.mobs['ranged-0']!;
      const player = s.state.players[s.sessionId]!;
      if (
        Math.hypot(mob.x - player.x, mob.y - player.y) < 90 &&
        terrainHit(player, mob, 0, MAPS.forest.obstacles) === null
      ) {
        break;
      }
      const goal = navigation
        .route(player, mob, 10)
        .find((p) => Math.hypot(p.x - player.x, p.y - player.y) > 12);
      const next = new Set<string>();
      if (goal) {
        if (Math.abs(goal.x - player.x) > 8) {
          next.add(goal.x > player.x ? 'd' : 'a');
        }
        if (Math.abs(goal.y - player.y) > 8) {
          next.add(goal.y > player.y ? 's' : 'w');
        }
      }
      for (const key of held) {
        if (!next.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
      }
      for (const key of next) {
        if (!held.has(key)) {
          await page.keyboard.down(key);
          held.add(key);
        }
      }
      await page.waitForTimeout(40);
    }
    const before = (await snapshot(page)).state.mobs['ranged-0']!;
    const point = await page.evaluate((m) => window.__openrpg.screenPoint(m.x, m.y), before);
    await page.mouse.move(point!.x, point!.y);
    await page.keyboard.press('q');
    for (const key of held) {
      await page.keyboard.up(key);
    }
    held.clear();
    await expect
      .poll(async () => (await snapshot(page)).state.mobs['ranged-0']!.stunnedUntil, {
        intervals: [20],
      })
      .toBeGreaterThan(0);
    const dashed = (await snapshot(page)).state.mobs['ranged-0']!;
    expect(dashed.hp).toBe(before.hp);
    await page.screenshot({ path: info.outputPath('dash-mob-stun.png') });
    const aim = await page.evaluate((m) => window.__openrpg.screenPoint(m.x, m.y), dashed);
    await page.mouse.move(aim!.x, aim!.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await expect
      .poll(async () => (await snapshot(page)).state.mobs['ranged-0']!.hp, { intervals: [20] })
      .toBeLessThan(dashed.hp);
    expect((await snapshot(page)).state.mobs['ranged-0']!.stunnedUntil).toBe(dashed.stunnedUntil);

    // Pursue again using real input until a fresh walking contact stuns the player.
    const contactDeadline = Date.now() + 12000;
    let stunned: Snapshot | undefined;
    while (Date.now() < contactDeadline) {
      const s = await snapshot(page),
        player = s.state.players[s.sessionId]!;
      if (player.stunnedUntil > s.state.elapsed) {
        stunned = s;
        break;
      }
      const mob = s.state.mobs['ranged-0']!;
      const next = new Set<string>();
      if (Math.abs(mob.x - player.x) > 4) {
        next.add(mob.x > player.x ? 'd' : 'a');
      }
      if (Math.abs(mob.y - player.y) > 4) {
        next.add(mob.y > player.y ? 's' : 'w');
      }
      for (const key of held) {
        if (!next.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
      }
      for (const key of next) {
        if (!held.has(key)) {
          await page.keyboard.down(key);
          held.add(key);
        }
      }
      await page.waitForTimeout(30);
    }
    expect(stunned).toBeDefined();
    await expect(page.locator('#ability-primary')).toContainText('Stunned');
    for (const key of held) {
      await page.keyboard.up(key);
    }
    held.clear();
    const frozen = (await snapshot(page)).state.players[stunned!.sessionId]!;
    const centerDistance = () =>
      page.evaluate(() => {
        const s = window.__openrpg.snapshot()!;
        const p = s.rendered[s.sessionId]!;
        const point = window.__openrpg.screenPoint(p.x, p.y)!;
        const canvas = document.querySelector('#game canvas')!.getBoundingClientRect();
        return Math.hypot(
          point.x - (canvas.x + canvas.width / 2),
          point.y - (canvas.y + canvas.height / 2),
        );
      });
    const displaced = await centerDistance();
    expect(displaced, 'knockback does not instantly snap the camera').toBeGreaterThan(8);
    await page.keyboard.down('a');
    held.add('a');
    await page.mouse.down();
    await page.waitForTimeout(250);
    const stopped = await snapshot(page),
      player = stopped.state.players[stopped.sessionId]!;
    expect(player.x).toBe(frozen.x);
    expect(player.y).toBe(frozen.y);
    expect(player.chargeStartedAt).toBe(-1);
    expect(stopped.chargeProgress).toBeNull();
    expect(await centerDistance()).toBeLessThan(displaced * 0.7);
    await page.mouse.up();
    await page.screenshot({ path: info.outputPath('player-contact-stun.png') });
    await expect
      .poll(async () => (await snapshot(page)).state.players[stopped.sessionId]!.x)
      .toBeLessThan(frozen.x - 10);
    expect(errors).toEqual([]);
  } finally {
    for (const key of held) {
      await page.keyboard.up(key);
    }
    await cleanup(context);
  }
});

for (const delayed of [false, true]) {
  test(
    delayed
      ? 'three-player movement, abilities and recovery at 150ms RTT with jitter'
      : 'three-player exploration and shared combat',
    async ({ browser }, testInfo) => {
      test.setTimeout(120000);
      const contexts: BrowserContext[] = [];
      const errors: string[] = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
        if (delayed) {
          await lag(context);
        }
        contexts.push(context);
      }
      const pages = await Promise.all(contexts.map((c) => c.newPage()));
      for (const p of pages) {
        p.on('pageerror', (e) => errors.push(e.message));
      }
      const [host, second, third] = pages as [Page, Page, Page];
      try {
        await name(host, 'Rowan');
        await services(host);
        await host.locator('#potion-count').fill('3');
        await portal(host);
        await host.getByRole('button', { name: 'Start expedition' }).click();
        await ready(host);
        const id = (await snapshot(host)).roomId;
        await name(second, 'Juniper');
        await services(second);
        await second.locator('#class-mage').click();
        await expect(second.locator('#class-mage')).toHaveAttribute('aria-pressed', 'true');
        await portal(second);
        await expect(second.locator('#rooms')).toContainText('Rowan');
        const hostState = await snapshot(host),
          hostName = hostState.state.players[hostState.sessionId]!.name;
        await second
          .locator('#rooms .room-row')
          .filter({ hasText: hostName })
          .getByRole('button', { name: 'Join', exact: true })
          .click();
        await ready(second);
        await name(third, 'Ash', `/?room=${id}`);
        await services(third);
        await third.locator('#class-warrior').click();
        await expect(third.locator('#class-warrior')).toHaveAttribute('aria-pressed', 'true');
        await portal(third);
        await third.locator('#join').click();
        await ready(third);
        await expect
          .poll(async () => Object.keys((await snapshot(host)).state.players).length)
          .toBe(3);
        expect(
          Object.values((await snapshot(host)).state.players)
            .map((p) => p.characterClass)
            .sort(),
        ).toEqual(['archer', 'mage', 'warrior']);
        await host.bringToFront();
        await host.mouse.move(700, 530);
        const before = await snapshot(host);
        await host.keyboard.down('d');
        if (delayed) {
          await expect
            .poll(
              async () => {
                const s = await snapshot(host);
                return s.diagnostics.x - s.state.players[s.sessionId]!.x;
              },
              { intervals: [10], timeout: 1000 },
            )
            .toBeGreaterThan(3);
        }
        await host.waitForTimeout(1900);
        await host.keyboard.up('d');
        await expect
          .poll(async () => (await snapshot(host)).diagnostics.x)
          .toBeGreaterThan(before.diagnostics.x + 220);
        await host.waitForTimeout(800);
        const moved = await snapshot(host);
        const authoritative = moved.state.players[moved.sessionId]!;
        expect(Math.abs(moved.diagnostics.x - authoritative.x)).toBeLessThan(1);
        expect(moved.diagnostics.drift).toBeLessThan(8);
        await expect
          .poll(async () => (await snapshot(second)).state.players[moved.sessionId]!.x)
          .toBeCloseTo(authoritative.x, 0);
        // NPC tactics are covered at normal latency; Fight tests isolate damage under jitter.
        if (!delayed) {
          // Aim through a scrolled camera and share the resulting authoritative kill.
          await shootMage(host);
          // Loot is visible before collection, then persists only after walking over it.
          await expect
            .poll(() =>
              host.evaluate(() => {
                const state = window.__openrpg.snapshot()!.state as unknown as {
                  drops: Record<string, { itemId: string; owner: string }>;
                };
                return Object.values(state.drops).some((drop) => drop.itemId === 'scout-vest');
              }),
            )
            .toBe(true);
          await expect
            .poll(async () => (await snapshot(second)).state.mobs['ranged-0']!.hp)
            .toBe(0);
          await expect
            .poll(async () =>
              Object.values((await snapshot(third)).state.players).reduce(
                (total, player) => total + player.kills,
                0,
              ),
            )
            .toBeGreaterThan(0);
          await host.screenshot({ path: testInfo.outputPath('ground-loot.png') });
          await collectVest(host);
          await expect
            .poll(async () => (await (await host.request.get('/api/adventure')).json()).items)
            .toContainEqual({ id: 'scout-vest', quantity: 1 });
        }
        // Let the forward pickup walk settle before measuring a direction reversal.
        await host.waitForTimeout(500);
        const pickupX = (await snapshot(host)).state.players[moved.sessionId]!.x;
        await expect
          .poll(async () => (await snapshot(second)).rendered[moved.sessionId]!.x)
          .toBeCloseTo(pickupX, 0);
        // Sample remote render positions while the player moves through open terrain.
        await host.keyboard.down('a');
        const samples = await second.evaluate(async (sid) => {
          const out: { x: number; time: number }[] = [];
          const end = performance.now() + 800;
          while (performance.now() < end) {
            await new Promise(requestAnimationFrame);
            const s = window.__openrpg.snapshot();
            if (s?.rendered[sid]) {
              out.push({ x: s.rendered[sid]!.x, time: performance.now() });
            }
          }
          return out;
        }, moved.sessionId);
        await host.keyboard.up('a');
        expect(samples.length).toBeGreaterThan(6);
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1]!,
            b = samples[i]!;
          expect(b.x - a.x).toBeLessThan(3); // no persistent backward correction while moving left
          expect(Math.abs(b.x - a.x)).toBeLessThan((180 * (b.time - a.time)) / 1000 + 15);
        }
        // Blur clears a held direction and bow even if no keyup/pointerup arrives.
        await host.keyboard.down('a');
        await host.mouse.down();
        await host.evaluate(() => window.dispatchEvent(new Event('blur')));
        await host.waitForTimeout(700);
        const stopped = await snapshot(host);
        await host.waitForTimeout(400);
        expect((await snapshot(host)).diagnostics.x).toBeCloseTo(stopped.diagnostics.x, 1);
        await host.keyboard.up('a');
        await host.mouse.up();
        await host.screenshot({
          path: testInfo.outputPath(delayed ? 'combat-latency.png' : 'combat-three-players.png'),
        });
        await testInfo.attach('network-measurements', {
          body: JSON.stringify(
            {
              before: before.diagnostics,
              afterMovement: moved.diagnostics,
              afterCombat: (await snapshot(host)).diagnostics,
              remoteSamples: samples,
            },
            null,
            2,
          ),
          contentType: 'application/json',
        });
        for (const p of pages) {
          await p.getByRole('button', { name: 'Leave', exact: false }).click();
        }
        for (const p of pages) {
          await expect(p.locator('#lobby')).toBeVisible();
          await expect(p.locator('#game canvas')).toHaveCount(0);
        }
        // Reuse these accounts in a fresh room to check abilities from safe spawn positions.
        await portal(host);
        await host.locator('#create').click();
        await ready(host);
        const abilityRoom = (await snapshot(host)).roomId;
        for (const page of [second, third]) {
          await portal(page);
          await page.locator('#room-id').fill(abilityRoom);
          await portal(page);
          await page.locator('#join').click();
          await ready(page);
        }
        await checkAbilities(pages, testInfo);
        for (const page of pages) {
          await page.locator('#leave').click();
        }
        expect(errors).toEqual([]);
      } finally {
        await Promise.all(contexts.map((c) => cleanup(c)));
      }
    },
  );
}
test('invite privacy, room errors, capacity, clipboard, reconnect and cleanup', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [host, a, b, extra] = pages as [Page, Page, Page, Page];
  try {
    await name(host, 'Moss');
    await portal(host);
    await host.locator('#invite').click();
    await portal(host);
    await host.locator('#create').click();
    await ready(host);
    const s = await snapshot(host);
    await host.locator('#copy').click();
    const link = await host.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain(`room=${s.roomId}`);
    await name(extra, 'Fern');
    await extra.waitForTimeout(250);
    await expect(extra.locator('#rooms')).not.toContainText('Moss');
    await portal(extra);
    await extra.locator('#room-id').fill('does-not-exist');
    await portal(extra);
    await extra.locator('#join').click();
    await expect(extra.locator('#status')).not.toBeEmpty();
    await expect(extra.locator('#play')).toBeHidden();
    for (const [p, n] of [
      [a, 'Aspen'],
      [b, 'Willow'],
    ] as const) {
      await name(p, n, link);
      await portal(p);
      await p.locator('#join').click();
      await ready(p);
    }
    await portal(extra);
    await extra.locator('#room-id').fill(s.roomId);
    await portal(extra);
    await extra.locator('#join').click();
    await expect(extra.locator('#status')).toContainText(/full|locked|limit/i);
    await host.bringToFront();
    await host.evaluate(() => window.__openrpg.drop());
    await expect.poll(async () => (await snapshot(host))?.connected).toBe(false);
    await expect.poll(async () => (await snapshot(host))?.connected, { timeout: 5000 }).toBe(true);
    expect((await snapshot(host)).sessionId).toBe(s.sessionId);
    await host.keyboard.down('d');
    await host.waitForTimeout(300);
    await host.keyboard.up('d');
    await expect.poll(async () => (await snapshot(host)).diagnostics.x).toBeGreaterThan(260);
    // Real network loss exceeds the recovery window; UI must cleanly return to lobby.
    await contexts[0]!.setOffline(true);
    await expect(host.locator('#recovery')).toBeVisible();
    await expect(host.locator('#lobby')).toBeVisible({ timeout: 18000 });
    await expect(host.locator('#game canvas')).toHaveCount(0);
    await expect(host.locator('#status')).toContainText(/reconnect|Connection/);
    await contexts[0]!.setOffline(false);
    await host.screenshot({ path: testInfo.outputPath('reconnect-failure.png') });
    await portal(host);
    await host.locator('#create').click();
    await ready(host);
    expect((await snapshot(host)).roomId).not.toBe(s.roomId);
    await expect(host.locator('#game canvas')).toHaveCount(1);
    await host.keyboard.down('d');
    await host.waitForTimeout(250);
    await host.keyboard.up('d');
    expect((await snapshot(host)).diagnostics.x).toBeGreaterThan(250);
    for (const p of [host, a, b]) {
      await p.locator('#leave').click();
    }
  } finally {
    await Promise.all(contexts.map((c) => cleanup(c)));
  }
});
test('authoritative death returns to camp with a snapped prediction and protection', async ({
  page,
}) => {
  await name(page, 'Briar');
  await portal(page);
  await page.locator('#create').click();
  await ready(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(1900);
  await page.keyboard.up('d');
  await expect
    .poll(
      async () => {
        const s = await snapshot(page);
        return s.state.players[s.sessionId]!.hp;
      },
      { timeout: 25000 },
    )
    .toBe(0);
  await expect(page.locator('#combat-status')).toContainText('Returning to camp');
  await expect
    .poll(
      async () => {
        const s = await snapshot(page);
        return s.state.players[s.sessionId]!.generation;
      },
      { timeout: 4500 },
    )
    .toBe(1);
  await expect(page.locator('#combat-status')).toContainText('Protected');
  const s = await snapshot(page);
  const p = s.state.players[s.sessionId]!;
  expect(p.x).toBe(250);
  expect(p.y).toBe(790);
  expect(p.hp).toBe(100);
  expect(s.diagnostics.x).toBe(250);
  expect(s.rendered[s.sessionId]!.x).toBeCloseTo(250, 0);
  await page.locator('#leave').click();
  await deleteBrowserAccount(page.context(), testPassword);
});

async function checkAbilities(pages: Page[], testInfo: TestInfo): Promise<void> {
  const kinds = ['archer', 'mage', 'warrior'] as const;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!,
      kind = kinds[i]!;
    await page.bringToFront();
    const initial = await snapshot(page),
      self = initial.state.players[initial.sessionId]!;
    const aim = await page.evaluate(({ x, y }) => window.__openrpg.screenPoint(x + 180, y), self);
    const target = aim ?? { x: 700, y: 520 };
    await page.mouse.move(target.x, target.y);
    await expect(page.locator('#ability-primary')).toContainText(
      kind === 'archer' ? 'Arrow' : kind === 'mage' ? 'Fireball' : 'Sword sweep',
    );
    await expect(page.locator('#ability-special')).toContainText(
      kind === 'archer' ? 'Arrow storm' : kind === 'mage' ? 'Inferno' : 'Iron will',
    );
    await page.mouse.click(target.x, target.y); // Fast taps must survive a frame without a fixed step.
    await expect
      .poll(async () => {
        const s = await snapshot(page);
        return s.state.players[s.sessionId]!.lastAttackAt;
      })
      .toBeGreaterThan(0);
    if (kind !== 'warrior') {
      await expect
        .poll(async () => {
          const s = await snapshot(page);
          return Object.values(s.state.projectiles).some(
            (p) => p.owner === s.sessionId && p.kind === (kind === 'mage' ? 'fireball' : 'arrow'),
          );
        })
        .toBe(true);
    }
    await page.mouse.click(target.x, target.y, { button: 'right' });
    await expect
      // Observe the first volley patch before terrain legitimately removes its early arrows.
      .poll(
        async () => {
          const s = await snapshot(page);
          return s.state.players[s.sessionId]!.nextSpecialAt;
        },
        { intervals: [10] },
      )
      .toBeGreaterThan(0);
    const first = await snapshot(page),
      player = first.state.players[first.sessionId]!;
    await expect(page.locator('#ability-special')).not.toHaveClass(/ready/);
    const owned = Object.values(first.state.projectiles).filter((p) => p.owner === first.sessionId);
    if (kind === 'archer') {
      expect(owned.filter((p) => p.kind === 'arrow').length).toBeGreaterThanOrEqual(12);
    }
    if (kind === 'mage') {
      expect(owned.map((p) => p.kind)).toContain('inferno');
    } // The earlier fireball may already have hit terrain.
    if (kind === 'warrior') {
      expect(owned.length).toBe(0);
      expect(player.sweepAt).toBeGreaterThan(0);
      expect(player.invulnerableUntil - first.state.elapsed).toBeGreaterThan(3000);
      await expect(page.locator('#ability-special')).toHaveClass(/active/);
      await expect
        .poll(
          async () => (await snapshot(pages[0]!)).state.players[first.sessionId]!.invulnerableUntil,
        )
        .toBe(player.invulnerableUntil);
    }
    await page.mouse.click(700, 520, { button: 'right' });
    await page.waitForTimeout(300);
    expect((await snapshot(page)).state.players[first.sessionId]!.nextSpecialAt).toBe(
      player.nextSpecialAt,
    );
    await page.screenshot({ path: testInfo.outputPath(`${kind}-abilities.png`) });
    if (kind === 'warrior') {
      // Releasing one mouse button must not release the other; blur clears both.
      await page.mouse.down();
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await expect
        .poll(async () => {
          const s = await snapshot(page);
          return s.state.players[s.sessionId]!.chargeStartedAt;
        })
        .toBeGreaterThanOrEqual(0);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.waitForTimeout(600);
      const cleared = (await snapshot(page)).state.players[first.sessionId]!.lastAttackAt;
      await page.waitForTimeout(900);
      expect((await snapshot(page)).state.players[first.sessionId]!.lastAttackAt).toBe(cleared);
      await page.mouse.up();
      await expect(page.locator('#ability-primary')).toHaveClass(/ready/);
      await expect(page.locator('#ability-special')).not.toHaveClass(/active/, { timeout: 4500 });
    }
    await page.evaluate(() => window.__openrpg.drop());
    await expect.poll(async () => (await snapshot(page)).connected, { timeout: 5000 }).toBe(true);
    expect((await snapshot(page)).state.players[first.sessionId]!.nextSpecialAt).toBe(
      player.nextSpecialAt,
    );
  }
}

for (const delayed of [false, true]) {
  test(`charge rings, release, repeated cycles and cancellation${delayed ? ' with 150ms RTT' : ''}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    const context = await browser.newContext();
    if (delayed) {
      await lag(context);
    }
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await name(page, 'Charge');
      for (const kind of ['archer', 'mage', 'warrior'] as const) {
        await services(page);
        await page.locator(`#class-${kind}`).click();
        await portal(page);
        await page.locator('#create').click();
        await ready(page);
        const before = await snapshot(page),
          duration = kind === 'mage' ? 2000 : kind === 'warrior' ? 700 : 1000;
        const aim = await page.evaluate(
          (p) => window.__openrpg.screenPoint(p.x + 160, p.y),
          before.state.players[before.sessionId]!,
        );
        await page.mouse.move(aim!.x, aim!.y);
        await page.mouse.down();
        await expect
          .poll(async () => (await snapshot(page)).chargeProgress, { intervals: [10] })
          .not.toBeNull();
        if (delayed) {
          expect((await snapshot(page)).state.players[before.sessionId]!.chargeStartedAt).toBe(-1);
        }
        await expect
          .poll(async () => (await snapshot(page)).chargeProgress, { intervals: [10] })
          .toBeGreaterThanOrEqual(0.66);
        const charged = await snapshot(page);
        expect(charged.state.players[charged.sessionId]!.lastAttackAt).toBe(-1);
        if (!delayed) {
          await page.screenshot({ path: testInfo.outputPath(`${kind}-charge.png`) });
        }
        if (kind === 'warrior') {
          await page.keyboard.down('d');
        }
        await page.mouse.up();
        // Repress after local release, before network polling or screenshots add delay.
        await expect
          .poll(async () => (await snapshot(page)).chargeProgress, { intervals: [10] })
          .toBeNull();
        await page.mouse.down();
        await expect
          .poll(async () => {
            const s = await snapshot(page);
            return s.state.players[s.sessionId]!.lastAttackAt;
          })
          .toBeGreaterThan(0);
        // Recharging must begin well before the old normal cooldown would have expired.
        const released = await snapshot(page);
        await expect
          .poll(async () => (await snapshot(page)).chargeProgress, { intervals: [10] })
          .not.toBeNull();
        await expect
          .poll(
            async () => {
              const s = await snapshot(page);
              return s.state.players[s.sessionId]!.chargeStartedAt;
            },
            { intervals: [10] },
          )
          .toBeGreaterThan(released.state.players[released.sessionId]!.lastAttackAt);
        const restarted = await snapshot(page);
        expect(
          restarted.state.players[restarted.sessionId]!.chargeStartedAt -
            released.state.players[released.sessionId]!.lastAttackAt,
        ).toBeLessThan(duration);
        if (kind === 'warrior') {
          await page.keyboard.up('d');
          expect((await snapshot(page)).diagnostics.x).toBeGreaterThan(before.diagnostics.x);
        }
        await page.mouse.up();
        await expect
          .poll(async () => {
            const s = await snapshot(page);
            return s.state.players[s.sessionId]!.lastAttackAt;
          })
          .toBeGreaterThan(released.state.players[released.sessionId]!.lastAttackAt);
        await page.mouse.down();
        await page.waitForTimeout(duration * 1.1);
        const looping = await snapshot(page);
        expect(looping.chargeProgress).toBeLessThan(0.6);
        await expect
          .poll(async () => (await snapshot(page)).chargeProgress, { intervals: [10] })
          .toBeGreaterThanOrEqual(0.65);
        const deadline = looping.state.players[looping.sessionId]!.lastAttackAt;
        await page.waitForTimeout(150);
        expect((await snapshot(page)).state.players[looping.sessionId]!.lastAttackAt).toBe(
          deadline,
        );
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.mouse.up();
        await expect.poll(async () => (await snapshot(page)).chargeProgress).toBeNull();
        // Cancellation crosses the delayed input queue and a state patch before it is observed.
        await expect
          .poll(
            async () => {
              const s = await snapshot(page);
              return s.state.players[s.sessionId]!.chargeStartedAt;
            },
            { timeout: 2000 },
          )
          .toBe(-1);
        const cancelled = await snapshot(page);
        expect(cancelled.state.players[cancelled.sessionId]!.lastAttackAt).toBe(deadline);
        await page.mouse.down();
        await page.waitForTimeout(200);
        await page.evaluate(() => window.__openrpg.drop());
        await page.mouse.up();
        await expect
          .poll(async () => (await snapshot(page)).connected, { timeout: 5000 })
          .toBe(true);
        await page.waitForTimeout(400);
        const recovered = await snapshot(page);
        expect(recovered.chargeProgress).toBeNull();
        expect(recovered.state.players[recovered.sessionId]!.chargeStartedAt).toBe(-1);
        expect(recovered.state.players[recovered.sessionId]!.lastAttackAt).toBe(deadline);
        await page.locator('#leave').click();
        await expect(page.locator('#lobby')).toBeVisible();
      }
      expect(errors).toEqual([]);
    } finally {
      await cleanup(context);
    }
  });
}
