import type { BiomeId } from './biomes.js';
import type { Route } from './routes/layout.js';
export type { Region } from './routes/layout.js';
import { forest } from './routes/forest.js';
import { castle } from './routes/castle.js';
import { paradise } from './routes/paradise.js';
import { hell } from './routes/hell.js';
import { mountain } from './routes/mountain.js';

export const ROUTES: Readonly<Record<Exclude<BiomeId, 'desert'>, Route>> = {
  forest,
  castle,
  paradise,
  hell,
  mountain,
};
