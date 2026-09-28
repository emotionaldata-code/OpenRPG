import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOME_IDS,
  MAP_IDS,
  MAPS,
  BESTIARY,
  ENCOUNTERS,
  ENEMY_ATTACKS,
  WorldState,
  Player,
  Mob,
  bossAttackAreas,
  enemyRules,
  mapUnlocked,
  speciesFor,
} from '@openrpg/shared';
import { EnemyCombat } from '../server/src/simulation/enemy-combat.js';
import { MUSIC, musicStep } from '../client/src/audio/music.js';
import { SOUNDS } from '../client/src/audio/sounds.js';

test('six biomes have four increasingly populated maps, cumulative species and a solitary boss', () => {
  assert.deepEqual(BIOME_IDS, ['desert', 'forest', 'castle', 'mountain', 'paradise', 'hell']);
  const layouts = new Set<string>();
  for (const biome of BIOME_IDS) {
    const maps = MAP_IDS.map((id) => MAPS[id]).filter((map) => map.biome === biome);
    assert.equal(maps.length, 5);
    maps.forEach((map, i) => {
      layouts.add(JSON.stringify(map.obstacles));
      if (i === 4) {
        assert.equal(map.enemies.length, 1);
        assert.equal(map.enemies[0]!.role, 'boss');
        return;
      }
      assert.equal(map.enemies.length, 6 + 4 * i);
      const species = new Set(map.enemies.map((e) => e.species));
      assert.equal(species.size, i + 1);
      for (let slot = 1; slot <= i + 1; slot++) {
        assert.ok(species.has(`${biome}-${slot}`));
      }
      for (const mob of map.enemies) {
        assert.ok(speciesFor(mob.species!, map.id));
      }
    });
    assert.equal(new Set(BESTIARY[biome].map((s) => JSON.stringify(s.attacks))).size, 4);
  }
  assert.equal(layouts.size, 30, 'every stage has distinct collision geometry');
  MAP_IDS.forEach((id, i) => {
    assert.equal(mapUnlocked(id, i), true);
    if (i) {
      assert.equal(mapUnlocked(id, i - 1), false);
    }
  });
});

for (const biome of BIOME_IDS) {
  const id = `${biome}-boss` as const;
  const kind = ENCOUNTERS[id].boss.find((k) => ENEMY_ATTACKS[k].durationMs)!;
  test(`${biome}: signature waves resolve on their marked schedule and cancel on stun/death`, () => {
    assert.ok(kind);
    const state = new WorldState({ mapId: id, elapsed: 1000 });
    const origin = { x: 2500, y: 500 };
    const mob = new Mob({
      ...origin,
      role: 'boss',
      attackKind: kind,
      attackX: origin.x,
      attackY: origin.y,
      targetX: 2600,
      targetY: 500,
      attackAngle: 0,
    });
    const areas = bossAttackAreas(kind, origin, { x: 2600, y: 500 }, 0, ENEMY_ATTACKS[kind].radius);
    const delayed = areas.find((a) => (a.delayMs ?? 0) > 0)!;
    assert.ok(delayed);
    const player = new Player({
      name: 'Target',
      x:
        delayed.x +
        Math.cos(delayed.angle) *
          (delayed.innerRadius
            ? (delayed.innerRadius + delayed.radius) / 2
            : delayed.halfAngle < Math.PI
              ? 150
              : 0),
      y: delayed.y + Math.sin(delayed.angle) * (delayed.halfAngle < Math.PI ? 150 : 0),
      protectedUntil: 0,
    });
    state.players.set('hero', player);
    state.mobs.set('boss', mob);
    const combat = new EnemyCombat(
      state,
      MAPS[id],
      () => {},
      (target, damage) => {
        if (state.elapsed >= target.invulnerableUntil) {
          target.hp -= damage;
        }
      },
    );
    player.invulnerableUntil = 1001;
    combat.attack('boss', mob);
    assert.equal(player.hp, 100);
    state.elapsed = 1000 + delayed.delayMs!;
    combat.step(0);
    assert.ok(player.hp < 100, `${kind} must hit its delayed warning`);
    // Repeat with death, then stun; pending marks cannot harm the player afterward.
    for (const cancel of ['death', 'stun']) {
      player.hp = 100;
      mob.hp = 100;
      state.elapsed += 3000;
      mob.stunnedUntil = 0;
      player.invulnerableUntil = state.elapsed + 1;
      combat.attack('boss', mob);
      if (cancel === 'death') {
        mob.hp = 0;
      } else {
        combat.stun(mob, 2000);
      }
      state.elapsed += 2000;
      combat.step(0);
      assert.equal(player.hp, 100);
    }
    assert.ok(enemyRules('boss', id).cooldownMs > 0);
  });
}
test('all biomes have distinct travel/boss scores and bounded, audible effects', () => {
  const scores = new Set<string>(),
    effects = new Set<string>();
  for (const biome of BIOME_IDS) {
    for (const mode of ['adventure', 'boss'] as const) {
      const key = `${biome}-${mode}` as const;
      scores.add(JSON.stringify(MUSIC[key]));
      const tones = musicStep(key, 0);
      assert.ok(tones.length > 0);
      assert.ok(tones.every((t) => t.hz > 0 && t.duration > 0 && t.volume <= 1));
      const sound = SOUNDS[`${biome}-${mode === 'boss' ? 'boss' : 'mob'}`];
      effects.add(JSON.stringify(sound));
    }
  }
  assert.equal(scores.size, 12);
  assert.equal(effects.size, 12);
});
