import express, { type Request, type Response, type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { parse, serialize } from 'cookie';
import { Accounts, AuthError, SESSION_MS } from './accounts.js';
export const COOKIE = 'openrpg_session';
export function sessionToken(header: string | null | undefined): string | undefined { return parse(header ?? '')[COOKIE]; }
function cookie(res: Response, token: string, secure: boolean): void {
  res.setHeader('Set-Cookie', serialize(COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: token ? SESSION_MS / 1000 : 0 }));
}
export function authRouter(accounts: Accounts, origin: string, secure: boolean): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use((req, res, next) => {
    if (req.method !== 'GET' && (req.get('origin') !== origin || !req.is('application/json'))) {
      res.status(403).json({ error: 'Request must come from the game page.' }); return;
    }
    next();
  });
  router.use(express.json({ limit: '2kb' }));
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many account attempts. Try again in 15 minutes.' } });
  const body = (req: Request): Record<string, unknown> => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new AuthError(400, 'Expected account details.');
    return req.body as Record<string, unknown>;
  };
  const session = (req: Request) => accounts.authenticate(sessionToken(req.headers.cookie));
  for (const method of ['register', 'login'] as const) router.post(`/${method}`, limit, async (req, res) => {
    const result = await accounts[method](body(req));
    await accounts.logout(sessionToken(req.headers.cookie));
    cookie(res, result.token, secure); res.status(method === 'register' ? 201 : 200).json(result.profile);
  });
  router.get('/me', async (req, res) => { res.json((await session(req)).profile); });
  router.post('/logout', async (req, res) => {
    await accounts.logout(sessionToken(req.headers.cookie)); cookie(res, '', secure); res.sendStatus(204);
  });
  router.delete('/account', limit, async (req, res) => {
    await accounts.delete(await session(req), body(req).password); cookie(res, '', secure); res.sendStatus(204);
  });
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AuthError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof SyntaxError || (error as { type?: string }).type === 'entity.too.large') {
      res.status(400).json({ error: 'Invalid account request.' }); return;
    }
    console.error('Account request failed.'); res.status(500).json({ error: 'Account service unavailable. Please try again.' });
  };
  router.use(errors);
  return router;
}
