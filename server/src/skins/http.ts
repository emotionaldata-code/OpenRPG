import { noStore, requireGameOrigin, requestErrors } from '../http/middleware.js';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Accounts } from '../auth/accounts.js';
import { sessionToken } from '../auth/session.js';
import type { Skins } from './store.js';
export function skinRouter(accounts: Accounts, skins: Skins, origin: string): express.Router {
  const router = express.Router();
  router.use(noStore);
  router.use(requireGameOrigin(origin));
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many skin requests. Try again in a minute.' },
    }),
  );
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
  router.use(
    requestErrors({
      invalid: 'Invalid or oversized skin.',
      unavailable: 'Skin service unavailable. Try again.',
      log: 'Skin request failed.',
    }),
  );
  return router;
}
