import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldState, Player, Mob } from '@openrpg/shared';
import { CombatAudio } from '../client/src/audio/game-audio.ts';
import type { Sound } from '../client/src/audio/sounds.ts';
function fixture() {
  const state = new WorldState(), player = new Player({ name: 'Self', protectedUntil: 0, x: 100, y: 100 }), mob = new Mob({ x: 130, y: 100 });
  state.players.set('self', player); state.mobs.set('mob', mob);
  const heard: { sound: Sound; volume: number }[] = [];
  const audio = new CombatAudio((sound, volume = 1) => heard.push({ sound, volume }));
  const patch = (active = true) => { state.elapsed += 50; audio.update(state, 'self', active); };
  patch();
  return { state, player, mob, heard, audio, patch };
}
test('audio: authoritative attacks sound once per cooldown change, for every class', () => {
  const f = fixture();
  for (const kind of ['archer', 'mage', 'warrior']) {
    f.player.characterClass = kind; f.player.chargeStartedAt = f.state.elapsed; f.patch();
    assert.equal(f.heard.length, 0);
    f.player.nextAttackAt += 1000; f.player.nextSpecialAt += 7000; f.patch();
    assert.deepEqual(f.heard.map(x => x.sound), [`${kind}-shot`, `${kind}-special`]);
    f.heard.length = 0;
    f.audio.update(f.state, 'self', true); f.patch(); assert.equal(f.heard.length, 0);
  }
});
test('audio: confirmed health, potion, loot, death, respawn and outcome cues', () => {
  const f = fixture();
  f.player.hp -= 10; f.mob.hp -= 10; f.patch();
  assert.deepEqual(f.heard.map(x => x.sound), ['hurt', 'mob-hurt']); f.heard.length = 0;
  f.player.nextPotionAt = 1000; f.player.hp += 10; f.player.lootAt = f.state.elapsed; f.patch();
  assert.deepEqual(f.heard.map(x => x.sound), ['potion', 'loot']); f.heard.length = 0;
  f.player.hp = 0; f.mob.hp = 0; f.patch();
  assert.deepEqual(f.heard.map(x => x.sound), ['death', 'mob-death']); f.heard.length = 0;
  f.player.generation++; f.player.hp = 100; f.mob.generation++; f.mob.hp = 90; f.patch();
  assert.deepEqual(f.heard.map(x => x.sound), ['respawn']); f.heard.length = 0;
  f.state.outcome = 'complete'; f.patch(); f.patch(); assert.deepEqual(f.heard.map(x => x.sound), ['victory']);
});
test('audio: joining, reconnecting, unmuting and stale patches never replay old combat', () => {
  const f = fixture();
  f.player.nextAttackAt = 1000; f.player.hp = 30; f.patch(false); f.patch();
  assert.equal(f.heard.length, 0);
  f.player.nextSpecialAt = 10000; f.state.elapsed += 2000; f.patch(); assert.equal(f.heard.length, 0);
  f.audio.reset(); f.mob.hp = 0; f.patch(); assert.equal(f.heard.length, 0);
  f.player.nextAttackAt += 1000; f.patch(); assert.equal(f.heard[0]?.sound, 'archer-shot');
});
test('audio: nearby monsters and allies are quieter; distant monsters are silent', () => {
  const f = fixture();
  f.state.players.set('ally', new Player({ name: 'Ally', protectedUntil: 0, characterClass: 'mage', x: 200, y: 100 })); f.patch();
  f.state.players.get('ally')!.nextAttackAt = 2000; f.mob.lastAttackAt = 100; f.patch();
  assert.deepEqual(f.heard.map(x => x.sound), ['mage-shot', 'enemy-ranged']);
  assert.ok(f.heard.every(x => x.volume > 0 && x.volume < 1)); f.heard.length = 0;
  f.mob.x = 900; f.mob.hp -= 10; f.mob.lastAttackAt = 300; f.patch(); assert.equal(f.heard.length, 0);
});
