import type { Point } from './map.js';
import { sectorHits } from './collision.js';

export interface AttackArea extends Point {
  radius: number;
  innerRadius: number;
  angle: number;
  halfAngle: number;
}
/** Locked geometry shared by warnings and damage; ordinary attacks return no areas. */
export function bossAttackAreas(
  kind: string,
  from: Point,
  target: Point,
  angle: number,
  radius: number,
): AttackArea[] {
  const circle = (x: number, y: number): AttackArea => ({
    x,
    y,
    radius,
    innerRadius: 0,
    angle,
    halfAngle: Math.PI,
  });
  switch (kind) {
    case 'roots':
      return [1 / 3, 2 / 3, 1].map((t) =>
        circle(from.x + (target.x - from.x) * t, from.y + (target.y - from.y) * t),
      );
    case 'royal':
      return [{ ...circle(from.x, from.y), halfAngle: Math.PI * 0.6 }];
    case 'halo':
      return [{ ...circle(from.x, from.y), innerRadius: 100 }];
    case 'fissure':
      return [
        [0, 0],
        [90, 0],
        [-90, 0],
        [0, 90],
        [0, -90],
      ].map(([x, y]) => circle(target.x + x!, target.y + y!));
    case 'avalanche':
      return [-2, -1, 0, 1, 2].map((i) =>
        circle(target.x - Math.sin(angle) * i * 100, target.y + Math.cos(angle) * i * 100),
      );
    default:
      return [];
  }
}
export function attackAreaHits(area: AttackArea, target: Point, radius: number): boolean {
  return (
    Math.hypot(target.x - area.x, target.y - area.y) + radius >= area.innerRadius &&
    sectorHits(area, area.angle, area.radius, area.halfAngle, target, radius)
  );
}
