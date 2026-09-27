import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WorldState, Player, Mob, CLASS_COMBAT, COMBAT, PROJECTILES, RULES, ENEMY_RULES,
  CHARGE, chargeMultiplier, chargeProgress, sectorHits, sanitizeInput, type Intent, type CharacterClass, type ProjectileKind,
} from '@openrpg/shared';
import { Combat } from '../server/src/simulation/combat.js';
import { Simulation } from '../server/src/simulation/world.js';
const intent = (overrides: Partial<Intent> = {}): Intent => ({ moveX: 0, moveY: 0, aim: 0, fire: false, special: false, ...overrides });
function fixture(kind: CharacterClass) {
  const state = new WorldState();
  const player = new Player({ name: 'Hero', characterClass: kind, x: 250, y: 790, protectedUntil: 0 });
  state.players.set('hero', player);
  return { state, player, combat: new Combat(state) };
}
for (const kind of ['archer', 'mage', 'warrior'] as const) test(`${kind}: charge requires release and bursts cannot accelerate charge or cooldowns`, () => {
  const { state, player, combat } = fixture(kind), rules = CLASS_COMBAT[kind];
  for (let i = 0; i < 1000; i++) combat.attack('hero', player, intent({ fire: true, special: true }));
  assert.equal(player.chargeStartedAt, 0); assert.equal(player.nextAttackAt, 0);
  assert.equal(state.projectiles.size, kind === 'archer' ? 12 : kind === 'mage' ? 1 : 0);
  assert.equal(player.nextSpecialAt, rules.special.cooldownMs);
  state.elapsed = rules.primary.cooldownMs * .7;
  combat.attack('hero', player, intent());
  const deadline = state.elapsed + rules.primary.cooldownMs;
  assert.equal(player.nextAttackAt, deadline); assert.equal(player.chargeStartedAt, -1);
  assert.equal(state.projectiles.size, kind === 'archer' ? 13 : kind === 'mage' ? 2 : 0);
  for (let i = 0; i < 1000; i++) { combat.attack('hero', player, intent({ fire: true })); combat.attack('hero', player, intent()); }
  assert.equal(player.nextAttackAt, deadline);
  state.elapsed = deadline - 1; combat.attack('hero', player, intent({ fire: true })); assert.equal(player.chargeStartedAt, -1);
  state.elapsed = deadline; combat.attack('hero', player, intent({ fire: true })); assert.equal(player.chargeStartedAt, deadline);
  state.elapsed = rules.special.cooldownMs - 1;
  combat.attack('hero', player, intent({ cancelFire: true, special: true })); assert.equal(player.nextSpecialAt, rules.special.cooldownMs);
  state.elapsed++; combat.attack('hero', player, intent({ special: true })); assert.equal(player.nextSpecialAt, rules.special.cooldownMs * 2);
});
for (const kind of ['archer', 'mage', 'warrior'] as const) test(`${kind}: authoritative damage peaks in the sweet spot and falls on either side`, () => {
  const damages: number[] = [];
  for (const progress of [0, .3, .65, .7, .8, .9, 1, 3]) {
    const { state, player, combat } = fixture(kind);
    const mob = new Mob({ x: 290, y: 790, hp: 1000 }); state.mobs.set('victim', mob);
    combat.attack('hero', player, intent({ fire: true }));
    state.elapsed = CLASS_COMBAT[kind].primary.cooldownMs * progress;
    combat.attack('hero', player, intent()); combat.step(.2);
    const base = kind === 'warrior' ? COMBAT.swordDamage : PROJECTILES[kind === 'mage' ? 'fireball' : 'arrow'].damage;
    assert.equal(mob.hp, 1000 - Math.round(base * chargeMultiplier(progress)));
    damages.push(1000 - mob.hp);
  }
  assert.ok(damages[0]! < damages[1]! && damages[1]! < damages[2]!);
  assert.equal(damages[2], damages[3]); assert.equal(damages[3], damages[4]);
  assert.ok(damages[4]! > damages[5]! && damages[5]! > damages[6]!); assert.equal(damages[6], damages[7]);
  assert.equal(chargeProgress(-100, 1000), 0); assert.equal(chargeProgress(3000, 1000), 1);
});
test('cancel, input silence and death discard a charge without firing', () => {
  for (const reason of ['cancel', 'silence', 'death', 'disconnect']) {
    const { state, player, combat } = fixture('archer');
    combat.attack('hero', player, intent({ fire: true }));
    state.elapsed = 300;
    if (reason === 'cancel') combat.attack('hero', player, intent({ cancelFire: true }));
    if (reason === 'silence') state.elapsed = CHARGE.inputTimeoutMs + 1;
    if (reason === 'death') player.hp = 0;
    if (reason === 'disconnect') player.connected = false;
    combat.step(1 / 30);
    assert.equal(player.chargeStartedAt, -1); assert.equal(player.nextAttackAt, 0); assert.equal(state.projectiles.size, 0);
    player.hp = 100; player.connected = true; combat.attack('hero', player, intent()); assert.equal(state.projectiles.size, 0);
  }
});
test('arrow storm creates exactly twelve simultaneous evenly spaced arrows', () => {
  const { state, player, combat } = fixture('archer');
  combat.attack('hero', player, intent({ special: true, aim: .3 }));
  const shots = [...state.projectiles.values()]; assert.equal(shots.length, 12);
  shots.forEach((shot, index) => {
    assert.equal(shot.kind, 'arrow'); assert.equal(shot.owner, 'hero');
    assert.equal(shot.x, player.x); assert.equal(shot.y, player.y);
    assert.ok(Math.abs(shot.angle - (.3 + index * Math.PI / 6)) < 1e-10);
  });
  assert.equal(player.nextAttackAt, 0);
});
for (const kind of ['arrow', 'fireball', 'inferno'] as const) test(`${kind}: authoritative damage and swept collision hit the nearest enemy, never allies`, () => {
  const { state, player, combat } = fixture('mage');
  const ally = new Player({ name: 'Ally', x: 280, y: 790, protectedUntil: 0 }); state.players.set('ally', ally);
  const near = new Mob({ x: 320, y: 790, hp: 500 }), far = new Mob({ x: 380, y: 790, hp: 500 });
  state.mobs.set('near', near); state.mobs.set('far', far);
  combat.fire('hero', player, 0, kind); combat.step(1);
  assert.equal(near.hp, 500 - PROJECTILES[kind].damage); assert.equal(far.hp, 500); assert.equal(ally.hp, 100);
  assert.equal(state.projectiles.size, 0);
});
test('fireball size affects grazing hits and all projectile types stop at terrain', () => {
  for (const kind of ['arrow', 'fireball', 'inferno'] as const) {
    const { state, player, combat } = fixture('mage');
    const mob = new Mob({ x: 320, y: 807, hp: 500 }); state.mobs.set('mob', mob);
    combat.fire('hero', player, 0, kind); combat.step(.5);
    assert.equal(mob.hp, kind === 'arrow' ? 500 : 500 - PROJECTILES[kind].damage);
  }
  for (const kind of ['arrow', 'fireball', 'inferno', 'bolt'] as const) {
    const { state, player, combat } = fixture('mage');
    Object.assign(player, { x: 430, y: 480 });
    const mob = new Mob({ x: 660, y: 480 }); state.mobs.set('mob', mob);
    const victim = new Player({ name: 'Victim', x: 660, y: 480, protectedUntil: 0 });
    state.players.set('victim', victim);
    // A hostile bolt starts at an enemy, not inside the player it could immediately hit.
    if (kind === 'bolt') state.players.delete('hero');
    combat.fire('caster', player, 0, kind); combat.step(1);
    assert.equal(victim.hp, 100);
    assert.equal(mob.hp, ENEMY_RULES.ranged.health); assert.equal(state.projectiles.size, 0);
  }
});
test('sword sweep hits multiple enemies in its sector once, respects terrain, and allows movement', () => {
  const state = new WorldState(), sim = new Simulation(state); sim.addPlayer('hero', 'Hero', 'warrior'); state.mobs.clear();
  const player = state.players.get('hero')!;
  const front = new Mob({ x: 295, y: 790 }), side = new Mob({ x: 280, y: 835 }), back = new Mob({ x: 210, y: 790 }), far = new Mob({ x: 370, y: 790 });
  for (const [key, mob] of Object.entries({ front, side, back, far })) state.mobs.set(key, mob);
  sim.applyInput('hero', intent({ fire: true, moveX: 1 }), 1 / 30);
  state.elapsed = 490; sim.applyInput('hero', intent({ moveX: 1 }), 1 / 30);
  assert.equal(player.x, 262); assert.equal(player.sweepX, player.x);
  assert.equal(front.hp, 75 - 42); assert.equal(side.hp, 75 - 42);
  assert.equal(back.hp, 75); assert.equal(far.hp, 75); assert.equal(state.projectiles.size, 0);
  sim.applyInput('hero', intent(), 1 / 30); assert.equal(front.hp, 33);
  state.elapsed = player.nextAttackAt; Object.assign(player, { x: 450, y: 510 }); Object.assign(front, { x: 510, y: 510 });
  sim.applyInput('hero', intent({ fire: true }), 0); sim.applyInput('hero', intent(), 0); assert.equal(front.hp, 33);
});
test('sector collision handles grazing edges, rear targets and wrapped aim angles', () => {
  const from = { x: 0, y: 0 }, angle = COMBAT.swordHalfAngle;
  assert.equal(sectorHits(from, 0, 82, angle, { x: 90, y: 0 }, 11), true);
  assert.equal(sectorHits(from, 0, 82, angle, { x: 94, y: 0 }, 11), false);
  assert.equal(sectorHits(from, 0, 82, angle, { x: 60 * Math.cos(angle + .1), y: 60 * Math.sin(angle + .1) }, 11), true);
  assert.equal(sectorHits(from, 0, 82, angle, { x: -30, y: 0 }, 11), false);
  assert.equal(sectorHits(from, Math.PI * 2, 82, angle, { x: 60, y: 0 }, 11), true);
});
test('sword kills award one kill and schedule the standard mob respawn', () => {
  const { state, player, combat } = fixture('warrior');
  const mob = new Mob({ x: 290, y: 790, hp: 9 }); state.mobs.set('mob', mob);
  combat.attack('hero', player, intent({ fire: true })); combat.attack('hero', player, intent());
  assert.equal(mob.hp, 0); assert.equal(player.kills, 1); assert.equal(mob.respawnAt, 8000);
  state.elapsed = 700; combat.attack('hero', player, intent({ fire: true })); assert.equal(player.kills, 1);
});
test('Iron will absorbs hits for exactly four seconds without refresh, then damage resumes', () => {
  const { state, player, combat } = fixture('warrior');
  combat.attack('hero', player, intent({ special: true }));
  const bolt = () => { combat.fire('enemy', { x: 220, y: 790 }, 0, 'bolt'); combat.step(.2); };
  state.elapsed = 3999; combat.attack('hero', player, intent({ special: true })); bolt();
  assert.equal(player.hp, 100); assert.equal(player.invulnerableUntil, 4000); assert.equal(state.projectiles.size, 0);
  state.elapsed = 4000; bolt(); assert.equal(player.hp, 80); assert.equal(player.nextSpecialAt, 12000);
  player.protectedUntil = 5000; bolt(); assert.equal(player.hp, 80);
});
test('dead and disconnected players cannot attack; respawn preserves cooldowns and clears old effects', () => {
  const state = new WorldState(), sim = new Simulation(state); sim.addPlayer('hero', 'Hero', 'warrior');
  const p = state.players.get('hero')!, attack = intent({ fire: true, special: true });
  p.connected = false; sim.applyInput('hero', attack, 0); assert.equal(p.nextSpecialAt, 0);
  p.connected = true; sim.applyInput('hero', attack, 0); assert.equal(p.nextSpecialAt, 12000);
  p.hp = 0; p.respawnAt = 3000; sim.applyInput('hero', attack, 0);
  for (let i = 0; i < 91; i++) sim.advance(1 / 30);
  assert.equal(p.hp, 100); assert.equal(p.invulnerableUntil, 0); assert.equal(p.sweepAt, -1000);
  sim.applyInput('hero', intent({ special: true }), 0); assert.equal(p.nextSpecialAt, 12000);
});
test('invalid attack flags are sanitized and removing an owner cleans every projectile type', () => {
  const input = intent(); Object.assign(input, { special: 'true', fire: 1, cancelFire: 'true' }); sanitizeInput(input);
  assert.equal(input.special, false); assert.equal(input.fire, false); assert.equal(input.cancelFire, false);
  const { state, player, combat } = fixture('mage');
  for (const kind of ['arrow', 'fireball', 'inferno'] satisfies ProjectileKind[]) combat.fire('hero', player, 0, kind);
  combat.removeOwner('hero'); assert.equal(state.projectiles.size, 0); combat.step(1);
});
