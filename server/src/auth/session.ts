import type { Response } from 'express';
import { parse, serialize } from 'cookie';
import { SESSION_MS } from './accounts.js';

export const COOKIE = 'openrpg_session';
export function sessionToken(header: string | null | undefined): string | undefined {
  return parse(header ?? '')[COOKIE];
}
export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.setHeader(
    'Set-Cookie',
    serialize(COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: token ? SESSION_MS / 1000 : 0,
    }),
  );
}
