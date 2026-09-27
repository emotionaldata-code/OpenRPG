import { noStore, requireGameOrigin, requestErrors } from '../http/middleware.js';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Accounts } from '../auth/accounts.js';
import { sessionToken } from '../auth/session.js';
import type { Adventures } from './store.js';
export function adventureRouter(
  accounts: Accounts,
  adventures: Adventures,
  origin: string,
): express.Router {
  const router = express.Router();
  router.use(noStore);
  router.use(
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  router.use(requireGameOrigin(origin));
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
  router.use(
    requestErrors({
      invalid: 'Invalid shop request.',
      unavailable: 'Your supplies are unavailable. Try again.',
      log: 'Adventure profile request failed.',
      status: 503,
    }),
  );
  return router;
}
