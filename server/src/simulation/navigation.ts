import { ENEMY_AI, WORLD, overlaps, terrainHit, type GameMap, type Point } from '@openrpg/shared';

/** Small static grids, shared by all enemies of the same footprint in one room. */
export class Navigation {
  private grids = new Map<number, Uint8Array>();
  private links = new Map<number, Uint8Array>();
  private cell = ENEMY_AI.grid;
  private columns = Math.ceil(WORLD.width / this.cell);
  private rows = Math.ceil(WORLD.height / this.cell);
  constructor(private map: GameMap) {}
  private point(index: number): Point {
    return {
      x: ((index % this.columns) + 0.5) * this.cell,
      y: (Math.floor(index / this.columns) + 0.5) * this.cell,
    };
  }
  route(from: Point, to: Point, radius: number): Point[] {
    // Body movement allows touching walls; projectile sweeps intentionally count that as a hit.
    // A tiny navigation-only inset lets a touching actor leave without weakening combat collision.
    const clearance = Math.max(0, radius - 0.01);
    if (terrainHit(from, to, clearance, this.map.obstacles) === null) {
      return [to];
    }
    let grid = this.grids.get(radius);
    if (!grid) {
      grid = new Uint8Array(this.columns * this.rows);
      for (let i = 0; i < grid.length; i++) {
        const p = this.point(i);
        grid[i] = Number(
          p.x >= WORLD.border + radius &&
            p.y >= WORLD.border + radius &&
            p.x <= WORLD.width - WORLD.border - radius &&
            p.y <= WORLD.height - WORLD.border - radius &&
            !this.map.obstacles.some((w) => overlaps(p, radius + 1, w)),
        );
      }
      this.grids.set(radius, grid);
      this.links.set(radius, new Uint8Array(grid.length).fill(255));
    }
    // The nearest cell may be behind a thin wall: connect only visible grid centers.
    const nearest = (p: Point): number => {
      let best = -1,
        distance = Infinity;
      // Most actors can connect to a nearby center; avoid scanning the whole larger map.
      const column = Math.floor(p.x / this.cell),
        row = Math.floor(p.y / this.cell);
      for (let y = Math.max(0, row - 1); y <= Math.min(this.rows - 1, row + 1); y++) {
        for (let x = Math.max(0, column - 1); x <= Math.min(this.columns - 1, column + 1); x++) {
          const index = y * this.columns + x,
            center = this.point(index);
          const d = Math.hypot(center.x - p.x, center.y - p.y);
          if (
            grid![index] &&
            d < distance &&
            terrainHit(p, center, clearance, this.map.obstacles) === null
          ) {
            best = index;
            distance = d;
          }
        }
      }
      if (best >= 0) {
        return best;
      }
      for (let i = 0; i < grid!.length; i++) {
        if (grid![i]) {
          const center = this.point(i),
            d = Math.hypot(center.x - p.x, center.y - p.y);
          if (d < distance && terrainHit(p, center, clearance, this.map.obstacles) === null) {
            best = i;
            distance = d;
          }
        }
      }
      return best;
    };
    const start = nearest(from),
      goal = nearest(to);
    if (start < 0 || goal < 0) {
      return [];
    }
    const previous = new Int32Array(grid.length).fill(-1),
      queue = [start];
    previous[start] = start;
    for (let cursor = 0; cursor < queue.length && previous[goal] === -1; cursor++) {
      const at = queue[cursor]!;
      const neighbors = [at - this.columns, at + this.columns, at - 1, at + 1];
      const links = this.links.get(radius)!;
      // Static edges are collision-tested only once per footprint, then reused by all mobs.
      if (links[at] === 255) {
        links[at] = 0;
        for (const [direction, next] of neighbors.entries()) {
          if (
            next >= 0 &&
            next < grid.length &&
            grid[next] &&
            Math.abs((next % this.columns) - (at % this.columns)) <= 1 &&
            terrainHit(this.point(at), this.point(next), clearance, this.map.obstacles) === null
          ) {
            links[at] |= 1 << direction;
          }
        }
      }
      for (const [direction, next] of neighbors.entries()) {
        if (!(links[at]! & (1 << direction)) || previous[next] !== -1) {
          continue;
        }
        previous[next] = at;
        queue.push(next);
      }
    }
    if (previous[goal] === -1) {
      return [];
    }
    const path = [this.point(goal)];
    for (let at = goal; at !== start;) {
      at = previous[at]!;
      path.push(this.point(at));
    }
    path.reverse();
    path.push(to);
    return path;
  }
}
