import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Accounts, AuthError } from '../auth/accounts.js';
import { sessionToken } from '../auth/http.js';
import { Adventures } from './store.js';
export function adventureRouter(accounts: Accounts, adventures: Adventures, origin: string): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.use((req, res, next) => {
    if (req.method !== 'GET' && (req.get('origin') !== origin || !req.is('application/json'))) { res.status(403).json({ error: 'Request must come from the game page.' }); return; }
    next();
  });
  router.use(express.json({ limit: '1kb' }));
  router.post('/trade', async (req, res) => {
    const session = await accounts.authenticate(sessionToken(req.headers.cookie));
    await adventures.trade(session.profile.id, req.body);
    res.json(await adventures.profile(session.profile.id));
  });
  router.get('/', async (req, res) => {
    const session = await accounts.authenticate(sessionToken(req.headers.cookie));
    res.json(await adventures.profile(session.profile.id));
  });
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AuthError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof SyntaxError || (error as { type?: string }).type === 'entity.too.large') { res.status(400).json({ error: 'Invalid shop request.' }); return; }
    console.error('Adventure profile request failed.'); res.status(503).json({ error: 'Your supplies are unavailable. Try again.' });
  };
  router.use(errors); return router;
}
