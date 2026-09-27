import express, { type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Accounts, AuthError } from '../auth/accounts.js';
import { sessionToken } from '../auth/http.js';
import { Skins } from './store.js';
export function skinRouter(accounts: Accounts, skins: Skins, origin: string): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use((req, res, next) => {
    if (req.method !== 'GET' && (req.get('origin') !== origin || !req.is('application/json'))) { res.status(403).json({ error: 'Request must come from the game page.' }); return; }
    next();
  });
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many skin requests. Try again in a minute.' } }));
  router.use(express.json({ limit: '40kb' }));
  router.get('/', async (req, res) => {
    const session = await accounts.authenticate(sessionToken(req.headers.cookie));
    res.json(await skins.list(session.profile.id));
  });
  router.post('/', async (req, res) => {
    const session = await accounts.authenticate(sessionToken(req.headers.cookie));
    res.status(201).json(await skins.create(session.profile.id, req.body));
  });
  router.delete('/:id', async (req, res) => {
    const session = await accounts.authenticate(sessionToken(req.headers.cookie));
    await skins.delete(session.profile.id, String(req.params.id));
    res.sendStatus(204);
  });
  // Signed-in players can load a party member's artwork by ID. Only its owner can equip it.
  router.get('/:id', async (req, res) => {
    await accounts.authenticate(sessionToken(req.headers.cookie));
    res.json(await skins.get(String(req.params.id)));
  });
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AuthError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof SyntaxError || (error as { type?: string })?.type === 'entity.too.large') { res.status(400).json({ error: 'Invalid or oversized skin.' }); return; }
    console.error('Skin request failed.'); res.status(500).json({ error: 'Skin service unavailable. Try again.' });
  };
  router.use(errors);
  return router;
}
