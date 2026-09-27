import { WORLD } from '../bounds.js';
import type { EnemySpawn, Obstacle, Point, Rect } from '../map.js';
export interface Region extends Point {
  name: string;
}
export interface Route {
  obstacles: readonly Obstacle[];
  paths: readonly Rect[];
  enemies: readonly EnemySpawn[];
  boss: Point;
  regions: readonly Region[];
}
export const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
export const wall = (
  x: number,
  y: number,
  width: number,
  height: number,
  kind: Obstacle['kind'] = 'stone',
): Obstacle => ({ x, y, width, height, kind });
export const guard = (x: number, y: number, role: EnemySpawn['role'] = 'melee'): EnemySpawn => ({
  x,
  y,
  role,
});
export const tree = (x: number, y: number): Obstacle => wall(x, y, 30, 30, 'tree');

// Connected, authored corridor sections. Their solid banks reach the world edges:
// players must follow the bends instead of bypassing every encounter along the border.
export function banks(
  kind: Obstacle['kind'],
  sections: readonly [number, number, number, number][],
): Obstacle[] {
  return sections.flatMap(([x, width, top, bottom]) => [
    wall(x, 0, width, top, kind),
    wall(x, bottom, width, WORLD.height - bottom, kind),
  ]);
}
export function road(points: readonly Point[]): Rect[] {
  return points.slice(1).flatMap((p, i) => {
    const previous = points[i]!;
    return [
      {
        x: Math.min(previous.x, p.x) - 45,
        y: previous.y - 45,
        width: Math.abs(p.x - previous.x) + 90,
        height: 90,
      },
      {
        x: p.x - 45,
        y: Math.min(previous.y, p.y) - 45,
        width: 90,
        height: Math.abs(p.y - previous.y) + 90,
      },
    ];
  });
}

/** Bake solid space around authored rooms/bridges once at module load.
 * Merged rectangles are shared by rendering and collision; no per-tick generation. */
export function surround(kind: Obstacle['kind'], floors: readonly Rect[]): Obstacle[] {
  const edges = (axis: 'x' | 'y', size: 'width' | 'height', end: number): number[] =>
    [...new Set([0, end, ...floors.flatMap((r) => [r[axis], r[axis] + r[size]])])].sort(
      (a, b) => a - b,
    );
  const xs = edges('x', 'width', WORLD.width),
    ys = edges('y', 'height', WORLD.height);
  const result: Obstacle[] = [];
  for (let row = 0; row < ys.length - 1; row++) {
    const y = ys[row]!,
      height = ys[row + 1]! - y;
    let start: number | undefined;
    for (let col = 0; col < xs.length; col++) {
      const x = xs[col]!;
      const solid =
        col < xs.length - 1 &&
        !floors.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
      if (solid) {
        start ??= x;
      } else if (start !== undefined) {
        const width = x - start;
        const above = result.find(
          (r) => r.x === start && r.width === width && r.y + r.height === y,
        );
        if (above) {
          above.height += height;
        } else {
          result.push(wall(start, y, width, height, kind));
        }
        start = undefined;
      }
    }
  }
  return result;
}
