import { sessionToken, setSessionCookie } from './session.js';
import { noStore, requireGameOrigin, requestErrors } from '../http/middleware.js';
import express, { type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Accounts } from './accounts.js';
import { AuthError } from './accounts.js';
export function authRouter(accounts: Accounts, origin: string, secure: boolean): express.Router {
  const router = express.Router();
  router.use(noStore);
  router.use(requireGameOrigin(origin));
  router.use(express.json({ limit: '2kb' }));
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many account attempts. Try again in 15 minutes.' },
  });
  const body = (req: Request): Record<string, unknown> => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new AuthError(400, 'Expected account details.');
    }
    return req.body as Record<string, unknown>;
  };
  const session = (req: Request) => accounts.authenticate(sessionToken(req.headers.cookie));
  for (const method of ['register', 'login'] as const) {
    router.post(`/${method}`, limit, async (req, res) => {
      const result = await accounts[method](body(req));
      await accounts.logout(sessionToken(req.headers.cookie));
      setSessionCookie(res, result.token, secure);
      res.status(method === 'register' ? 201 : 200).json(result.profile);
    });
  }
  router.get('/me', async (req, res) => {
    res.json((await session(req)).profile);
  });
  router.post('/logout', async (req, res) => {
    await accounts.logout(sessionToken(req.headers.cookie));
    setSessionCookie(res, '', secure);
    res.sendStatus(204);
  });
  router.delete('/account', limit, async (req, res) => {
    await accounts.delete(await session(req), body(req).password);
    setSessionCookie(res, '', secure);
    res.sendStatus(204);
  });
  router.use(
    requestErrors({
      invalid: 'Invalid account request.',
      unavailable: 'Account service unavailable. Please try again.',
      log: 'Account request failed.',
    }),
  );
  return router;
}
