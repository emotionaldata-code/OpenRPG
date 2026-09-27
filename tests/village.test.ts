import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type MovingPlayer,
  VILLAGE,
  VILLAGE_STATIONS,
  VILLAGE_WALLS,
  VILLAGE_BUILDINGS,
  nearbyStation,
  movePlayer,
  RULES,
  overlaps,
  MAPS,
} from '@openrpg/shared';
import { Navigation } from '../server/src/simulation/navigation.js';

test('every village service is reachable, with solid buildings and bounded movement', () => {
  const nav = new Navigation({
    ...MAPS.forest,
    obstacles: VILLAGE_WALLS.map((wall) => ({ ...wall, kind: 'stone' })),
  });
  for (const station of VILLAGE_STATIONS) {
    assert.ok(!VILLAGE_WALLS.some((wall) => overlaps(station, RULES.playerRadius, wall)));
    assert.ok(nav.route(VILLAGE.spawn, station, RULES.playerRadius).length > 0);
    assert.equal(nearbyStation(station)?.id, station.id);
  }
  assert.equal(nearbyStation(VILLAGE.spawn), undefined);
  const player: MovingPlayer = { ...VILLAGE.spawn, hp: 100, connected: true, aim: 0 };
  const intent = { moveX: 1, moveY: 0, aim: 0, fire: false, special: false };
  for (let i = 0; i < 500; i++) {
    movePlayer(player, intent, 1 / 30, VILLAGE_WALLS);
  }
  assert.equal(player.x, 1200);
  player.x = 300;
  player.y = 420;
  intent.moveX = 0;
  intent.moveY = -1;
  for (let i = 0; i < 100; i++) {
    movePlayer(player, intent, 1 / 30, VILLAGE_WALLS);
  }
  assert.equal(player.y, 380);
});

test('building silhouettes block all sides, including roof edges and diagonal corners', () => {
  for (const building of VILLAGE_BUILDINGS) {
    const { x, y, width, height } = building;
    for (const [startX, startY, moveX, moveY] of [
      [x + width / 2, y - 40, 0, 1],
      [x - 40, y + 5, 1, 0],
      [x + width + 40, y + 5, -1, 0],
      [x + width / 2, y + height + 40, 0, -1],
      [x - 40, y - 40, 1, 1],
      [x + width + 40, y - 40, -1, 1],
    ] as const) {
      const player: MovingPlayer = { x: startX, y: startY, hp: 100, connected: true, aim: 0 };
      for (let step = 0; step < 30; step++) {
        movePlayer(
          player,
          { moveX, moveY, aim: 0, fire: false, special: false },
          1 / 30,
          VILLAGE_WALLS,
        );
        assert.equal(overlaps(player, RULES.playerRadius, building), false);
      }
      assert.ok(Math.hypot(player.x - startX, player.y - startY) < RULES.playerSpeed);
    }
  }
});
