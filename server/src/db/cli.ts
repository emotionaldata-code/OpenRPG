import { migrate } from './migrate.js';
const direction = process.argv[2] ?? 'up';
if (direction !== 'up' && direction !== 'down') throw new Error('Expected up or down.');
if (direction === 'down' && process.env.NODE_ENV === 'production') throw new Error('Automatic rollback is disabled in production. Use a reviewed forward migration.');
await migrate(undefined, direction);
