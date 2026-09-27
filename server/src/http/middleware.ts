import type { RequestHandler, ErrorRequestHandler } from 'express';
import { AuthError } from '../auth/accounts.js';

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Cookie-authenticated writes must come from our page and carry JSON (CSRF boundary). */
export function requireGameOrigin(origin: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' && (req.get('origin') !== origin || !req.is('application/json'))) {
      res.status(403).json({ error: 'Request must come from the game page.' });
      return;
    }
    next();
  };
}

interface ErrorMessages {
  invalid: string;
  unavailable: string;
  log: string;
  status?: number;
}

export function requestErrors(messages: ErrorMessages): ErrorRequestHandler {
  // Express identifies error middleware by all four arguments, including next.
  return (error: unknown, _req, res, _next) => {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const oversized =
      error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large';
    if (error instanceof SyntaxError || oversized) {
      res.status(400).json({ error: messages.invalid });
      return;
    }
    // Do not leak database errors or credentials to the response or logs.
    console.error(messages.log);
    res.status(messages.status ?? 500).json({ error: messages.unavailable });
  };
}
