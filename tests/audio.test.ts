import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldState, Player, Mob } from '@openrpg/shared';
import { CombatAudio } from '../client/src/audio/game-audio.ts';
import type { Sound } from '../client/src/audio/sounds.ts';
function fixture() {
  const state = new WorldState(),
    player = new Player({ name: 'Self', protectedUntil: 0, x: 100, y: 100 }),
    mob = new Mob({ x: 130, y: 100 });
  state.players.set('self', player);
  state.mobs.set('mob', mob);
  const heard: { sound: Sound; volume: number }[] = [];
  const audio = new CombatAudio((sound, volume = 1) => heard.push({ sound, volume }));
  const patch = (active = true) => {
    state.elapsed += 50;
    audio.update(state, 'self', active);
  };
  patch();
  return { state, player, mob, heard, audio, patch };
}
test('audio: authoritative attacks sound once per confirmed attack, for every class', () => {
  const f = fixture();
  for (const kind of ['archer', 'mage', 'warrior']) {
    f.player.characterClass = kind;
    f.player.lastAttackMultiplier = 0.5;
    f.player.chargeStartedAt = f.state.elapsed;
    f.patch();
    assert.equal(f.heard.length, 0);
    f.player.lastAttackAt += 1000;
    f.player.nextSpecialAt += 7000;
    f.patch();
    assert.deepEqual(
      f.heard.map((x) => x.sound),
      [`${kind}-shot`, `${kind}-special`],
    );
    f.heard.length = 0;
    f.audio.update(f.state, 'self', true);
    f.patch();
    assert.equal(f.heard.length, 0);
  }
});
test('audio: confirmed health, potion, loot, death, respawn and outcome cues', () => {
  const f = fixture();
  f.player.hp -= 10;
  f.mob.hp -= 10;
  f.patch();
  assert.deepEqual(
    f.heard.map((x) => x.sound),
    ['hurt', 'mob-hurt'],
  );
  f.heard.length = 0;
  f.player.nextPotionAt = 1000;
  f.player.hp += 10;
  f.player.lootAt = f.state.elapsed;
  f.patch();
  assert.deepEqual(
    f.heard.map((x) => x.sound),
    ['potion', 'loot'],
  );
  f.heard.length = 0;
  f.player.hp = 0;
  f.mob.hp = 0;
  f.patch();
  assert.deepEqual(
    f.heard.map((x) => x.sound),
    ['death', 'mob-death'],
  );
  f.heard.length = 0;
  f.player.generation++;
  f.player.hp = 100;
  f.mob.generation++;
  f.mob.hp = 90;
  f.patch();
  assert.deepEqual(
    f.heard.map((x) => x.sound),
    ['respawn'],
  );
  f.heard.length = 0;
  f.state.outcome = 'complete';
  f.patch();
  f.patch();
  assert.deepEqual(
    f.heard.map((x) => x.sound),
    ['victory'],
  );
});
test('audio: joining, reconnecting, unmuting and stale patches never replay old combat', () => {
  const f = fixture();
  f.player.lastAttackAt = 1000;
  f.player.hp = 30;
  f.patch(false);
  f.patch();
  assert.equal(f.heard.length, 0);
  f.player.nextSpecialAt = 10000;
  f.state.elapsed += 2000;
  f.patch();
  assert.equal(f.heard.length, 0);
  f.audio.reset();
  f.mob.hp = 0;
  f.patch();
  assert.equal(f.heard.length, 0);
  f.player.lastAttackAt += 1000;
  f.patch();
  assert.equal(f.heard[0]?.sound, 'archer-shot');
});
test('audio: nearby monsters and allies are quieter; distant monsters are silent', () => {
  const f = fixture();
  f.state.players.set(
    'ally',
    new Player({ name: 'Ally', protectedUntil: 0, characterClass: 'mage', x: 200, y: 100 }),
  );
  f.patch();
  f.state.players.get('ally')!.lastAttackAt = 2000;
  f.mob.lastAttackAt = 100;
  f.patch();
  assert.deepEqual(
    f.heard.map((x) => x.sound),
    ['mage-shot', 'forest-mob'],
  );
  assert.ok(f.heard.every((x) => x.volume > 0 && x.volume < 1));
  f.heard.length = 0;
  f.mob.x = 900;
  f.mob.hp -= 10;
  f.mob.lastAttackAt = 300;
  f.patch();
  assert.equal(f.heard.length, 0);
});

test('audio: boss score follows confirmed engagement across mute/reconnect and resets cleanly', () => {
  const state = new WorldState(),
    player = new Player({ name: 'Hero', x: 3000, y: 500, protectedUntil: 0, hp: 100 }),
    boss = new Mob({ role: 'boss', x: 3080, y: 500, hp: 450 });
  state.players.set('hero', player);
  state.mobs.set('forest-boss', boss);
  const music: string[] = [];
  const audio = new CombatAudio(
    () => {},
    (mode) => music.push(mode),
  );
  const mode = (active = true) => {
    state.elapsed += 50;
    audio.update(state, 'hero', active);
    return music.at(-1);
  };
  assert.equal(mode(), 'forest-adventure', 'proximity alone does not start boss music');
  boss.engaged = true;
  boss.hp--;
  assert.equal(mode(), 'forest-boss');
  assert.equal(mode(false), 'forest-boss', 'muting does not forget an encounter');
  player.x = 250;
  assert.equal(mode(), 'forest-adventure', 'retreating to camp restores exploration');
  player.x = 3000;
  audio.reset();
  assert.equal(mode(), 'forest-boss', 'full reconnect snapshot resumes the score');
  player.hp = 0;
  assert.equal(mode(), 'forest-adventure');
  player.hp = 100;
  boss.engaged = false;
  assert.equal(mode(), 'forest-adventure', 'leash reset returns to exploration');
  boss.engaged = true;
  boss.hp = 0;
  assert.equal(mode(), 'forest-adventure', 'boss death returns to exploration');
  boss.generation++;
  boss.hp = 450;
  boss.engaged = false;
  assert.equal(mode(), 'forest-adventure', 'respawning does not start music without a hit');
  boss.engaged = true;
  state.outcome = 'complete';
  assert.equal(mode(), 'forest-adventure');
});

test('audio: perfect release accent follows confirmed quality, once, without reconnect replay', () => {
  const f = fixture();
  f.player.lastAttackAt = f.state.elapsed;
  f.player.lastAttackMultiplier = 1.75;
  f.patch();
  assert.deepEqual(
    f.heard.map((event) => event.sound),
    ['archer-shot', 'perfect'],
  );
  f.heard.length = 0;
  f.patch();
  f.patch(false);
  f.patch();
  assert.equal(f.heard.length, 0);
  f.player.lastAttackAt = f.state.elapsed;
  f.player.lastAttackMultiplier = 0.025;
  f.patch();
  assert.deepEqual(
    f.heard.map((event) => event.sound),
    ['archer-shot', 'bad-shot'],
  );
  assert.ok(f.heard[0]!.volume < 0.4, 'weak shots have a lighter sound');
});

test('audio: ordinary releases and other players do not emit the bad-shot cue', () => {
  const f = fixture();
  f.player.lastAttackMultiplier = 0.5;
  f.player.lastAttackAt = f.state.elapsed;
  f.patch();
  assert.deepEqual(
    f.heard.map((event) => event.sound),
    ['archer-shot'],
  );
  f.heard.length = 0;
  f.state.players.set('ally', new Player({ name: 'Ally', x: 150, y: 100, protectedUntil: 0 }));
  f.patch();
  f.state.players.get('ally')!.lastAttackAt = f.state.elapsed;
  f.state.players.get('ally')!.lastAttackMultiplier = 0.025;
  f.patch();
  assert.deepEqual(
    f.heard.map((event) => event.sound),
    ['archer-shot'],
  );
});

test('audio: local stun sounds once, without replay on recovery, reconnect or respawn', () => {
  const f = fixture();
  f.player.stunnedUntil = f.state.elapsed + 1000;
  f.patch();
  f.patch();
  assert.deepEqual(
    f.heard.map((event) => event.sound),
    ['stun'],
  );
  f.heard.length = 0;
  f.patch(false);
  f.patch();
  f.state.elapsed = f.player.stunnedUntil;
  f.patch();
  assert.equal(f.heard.length, 0);
  f.player.generation++;
  f.player.stunnedUntil = 0;
  f.patch();
  assert.deepEqual(
    f.heard.map((event) => event.sound),
    ['respawn'],
  );
  f.heard.length = 0;
  f.player.stunnedUntil = f.state.elapsed + 2000;
  f.patch();
  assert.deepEqual(
    f.heard.map((event) => event.sound),
    ['stun'],
  );
});
