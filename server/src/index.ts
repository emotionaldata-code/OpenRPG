import { listen } from '@colyseus/tools';
import { createGameServer } from './app.config.js';
await listen(createGameServer(), Number(process.env.PORT ?? 2567));
