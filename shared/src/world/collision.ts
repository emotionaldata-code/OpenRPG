import { OBSTACLES, WORLD, type Point, type Rect } from './map.js';
// Entities use axis-aligned square footprints; projectiles sweep an expanded box.
export function overlaps(p: Point, radius: number, r: Rect): boolean {
  return (
    p.x + radius > r.x &&
    p.x - radius < r.x + r.width &&
    p.y + radius > r.y &&
    p.y - radius < r.y + r.height
  );
}
export function moveBody(
  p: Point,
  dx: number,
  dy: number,
  radius: number,
  walls: readonly Rect[] = OBSTACLES,
): void {
  // Subdivision makes the same function safe for larger test steps and mob movement.
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / radius));
  for (let i = 0; i < count; i++) {
    const oldX = p.x;
    p.x = Math.max(
      WORLD.border + radius,
      Math.min(WORLD.width - WORLD.border - radius, p.x + dx / count),
    );
    for (const wall of walls) {
      if (overlaps(p, radius, wall)) {
        p.x = dx > 0 ? wall.x - radius : dx < 0 ? wall.x + wall.width + radius : oldX;
      }
    }
    const oldY = p.y;
    p.y = Math.max(
      WORLD.border + radius,
      Math.min(WORLD.height - WORLD.border - radius, p.y + dy / count),
    );
    for (const wall of walls) {
      if (overlaps(p, radius, wall)) {
        p.y = dy > 0 ? wall.y - radius : dy < 0 ? wall.y + wall.height + radius : oldY;
      }
    }
  }
}
/** Earliest segment hit, 0..1; null means no hit. Inclusive edges stop grazing shots. */
export function sweepRect(from: Point, to: Point, rect: Rect, radius = 0): number | null {
  let near = 0,
    far = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = to[axis] - from[axis];
    const low = rect[axis] - radius;
    const high = rect[axis] + (axis === 'x' ? rect.width : rect.height) + radius;
    if (Math.abs(delta) < 1e-10) {
      if (from[axis] < low || from[axis] > high) {
        return null;
      }
    } else {
      const a = (low - from[axis]) / delta,
        b = (high - from[axis]) / delta;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) {
        return null;
      }
    }
  }
  return near;
}
export function terrainHit(
  from: Point,
  to: Point,
  radius = 0,
  walls: readonly Rect[] = OBSTACLES,
): number | null {
  let first: number | null = null;
  for (const rect of walls) {
    const hit = sweepRect(from, to, rect, radius);
    if (hit !== null && (first === null || hit < first)) {
      first = hit;
    }
  }
  return first;
}

/** Disk/sector overlap includes targets grazing either edge, not just their centers. */
export function sectorHits(
  from: Point,
  angle: number,
  reach: number,
  halfAngle: number,
  target: Point,
  radius: number,
): boolean {
  const dx = target.x - from.x,
    dy = target.y - from.y,
    distance = Math.hypot(dx, dy);
  if (distance > reach + radius) {
    return false;
  }
  const offset = Math.abs(
    Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)),
  );
  if (offset <= halfAngle) {
    return true;
  }
  const edge = offset - halfAngle,
    along = Math.max(0, Math.min(reach, distance * Math.cos(edge)));
  return Math.hypot(distance * Math.cos(edge) - along, distance * Math.sin(edge)) <= radius;
}
