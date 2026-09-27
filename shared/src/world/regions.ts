import type { MapId } from './map.js';
import type { Route } from './routes/layout.js';
export type { Region } from './routes/layout.js';
import { forest } from './routes/forest.js';
import { castle } from './routes/castle.js';
import { paradise } from './routes/paradise.js';
import { hell } from './routes/hell.js';
import { mountain } from './routes/mountain.js';

export const ROUTES: Readonly<Record<MapId, Route>> = { forest, castle, paradise, hell, mountain };
