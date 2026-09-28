import type { Point } from './map.js';
import { sectorHits } from './collision.js';

export interface AttackArea extends Point {
  delayMs?: number;
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
    case 'sandstorm':
      return Array.from({ length: 18 }, (_, i) => {
        const wave = Math.floor(i / 6),
          a = angle + ((i % 6) * Math.PI) / 3 + wave * 0.48;
        return {
          ...circle(
            from.x + Math.cos(a) * (100 + wave * 90),
            from.y + Math.sin(a) * (100 + wave * 90),
          ),
          delayMs: wave * 450,
        };
      });
    case 'wildhunt':
      return Array.from({ length: 12 }, (_, i) => {
        const step = Math.floor(i / 3) + 1,
          branch = (i % 3) - 1,
          a = angle + branch * 0.48;
        return {
          ...circle(from.x + Math.cos(a) * step * 95, from.y + Math.sin(a) * step * 95),
          delayMs: (step - 1) * 350,
        };
      });
    case 'checkmate':
      return [0, 1, 2].map((i) => ({
        ...circle(from.x, from.y),
        angle: angle + (i * Math.PI * 2) / 3,
        halfAngle: Math.PI * 0.3,
        delayMs: i * 600,
      }));
    case 'earthshatter':
      return Array.from({ length: 15 }, (_, i) => {
        const row = Math.floor(i / 5),
          side = (i % 5) - 2;
        return {
          ...circle(
            from.x + Math.cos(angle) * (120 + row * 110) - Math.sin(angle) * side * 110,
            from.y + Math.sin(angle) * (120 + row * 110) + Math.cos(angle) * side * 110,
          ),
          delayMs: row * 550,
        };
      });
    case 'eclipse':
      return [
        { ...circle(from.x, from.y), innerRadius: 115, delayMs: 0 },
        { ...circle(from.x, from.y), radius: 115, delayMs: 700 },
        { ...circle(target.x, target.y), radius: 80, delayMs: 1400 },
      ];
    case 'cataclysm':
      return Array.from({ length: 16 }, (_, i) => {
        const row = Math.floor(i / 4),
          side = (i % 4) - 1.5,
          a = angle + side * 0.42;
        return {
          ...circle(
            from.x + Math.cos(a) * (110 + row * 100),
            from.y + Math.sin(a) * (110 + row * 100),
          ),
          delayMs: row * 450,
        };
      });
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
