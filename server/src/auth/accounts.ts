import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { Pool } from 'pg';
import { parseUsername as sharedUsername, type AccountProfile } from '@openrpg/shared';
export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function validate<T>(parse: (value: unknown) => T, value: unknown): T {
  try {
    return parse(value);
  } catch (error) {
    throw new AuthError(400, (error as Error).message);
  }
}
const parseUsername = (value: unknown) => validate(sharedUsername, value);
export interface Session {
  profile: AccountProfile;
  hash: string;
  expiresAt: number;
}
interface AccountRow {
  id: string;
  username: string;
  password_hash: string;
}
const profile = (row: AccountRow): AccountProfile => ({ id: row.id, username: row.username });
const digest = (token: string): string => createHash('sha256').update(token).digest('hex');
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new AuthError(400, 'Use a password of 8–128 characters.');
  }
  return value;
}
export class Accounts {
  private listeners = new Set<(accountId: string, sessionHash?: string) => void>();
  private dummyHash = argon2.hash(randomBytes(32).toString('hex'), hashOptions);
  constructor(private pool: Pool) {}
  onRevoked(fn: (accountId: string, sessionHash?: string) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private revoked(id: string, hash?: string): void {
    for (const fn of this.listeners) {
      fn(id, hash);
    }
  }
  async register(
    raw: Record<string, unknown>,
  ): Promise<{ profile: AccountProfile; token: string }> {
    const username = parseUsername(raw.username);
    const hash = await argon2.hash(password(raw.password), hashOptions);
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query<AccountRow>(
        'INSERT INTO accounts(username, password_hash) VALUES ($1,$2) RETURNING *',
        [username, hash],
      );
      const user = profile(result.rows[0]!);
      const token = randomBytes(32).toString('hex');
      await db.query('INSERT INTO sessions(token_hash, account_id, expires_at) VALUES ($1,$2,$3)', [
        digest(token),
        user.id,
        new Date(Date.now() + SESSION_MS),
      ]);
      await db.query('COMMIT');
      return { profile: user, token };
    } catch (error) {
      await db.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new AuthError(409, 'That username is already taken.');
      }
      throw error;
    } finally {
      db.release();
    }
  }
  async login(raw: Record<string, unknown>): Promise<{ profile: AccountProfile; token: string }> {
    const username = parseUsername(raw.username),
      plain = password(raw.password);
    const result = await this.pool.query<AccountRow>(
      'SELECT * FROM accounts WHERE lower(username) = lower($1)',
      [username],
    );
    const row = result.rows[0];
    const valid = await argon2.verify(row?.password_hash ?? (await this.dummyHash), plain);
    if (!row || !valid) {
      throw new AuthError(401, 'Incorrect username or password.');
    }
    const token = randomBytes(32).toString('hex');
    await this.pool.query(
      'INSERT INTO sessions(token_hash, account_id, expires_at) VALUES ($1,$2,$3)',
      [digest(token), row.id, new Date(Date.now() + SESSION_MS)],
    );
    return { profile: profile(row), token };
  }
  async authenticate(token: string | undefined): Promise<Session> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      throw new AuthError(401, 'Please log in to continue.');
    }
    return this.session(digest(token));
  }
  async session(hash: string): Promise<Session> {
    const result = await this.pool.query<AccountRow & { expires_at: Date }>(
      'SELECT a.*, s.expires_at FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()',
      [hash],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AuthError(401, 'Your session has ended. Please log in again.');
    }
    return { profile: profile(row), hash, expiresAt: row.expires_at.getTime() };
  }
  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    const hash = digest(token);
    const result = await this.pool.query<{ account_id: string }>(
      'DELETE FROM sessions WHERE token_hash=$1 RETURNING account_id',
      [hash],
    );
    if (result.rows[0]) {
      this.revoked(result.rows[0].account_id, hash);
    }
  }
  async delete(session: Session, value: unknown): Promise<void> {
    const plain = password(value);
    const result = await this.pool.query<AccountRow>('SELECT * FROM accounts WHERE id=$1', [
      session.profile.id,
    ]);
    const row = result.rows[0];
    if (!row || !(await argon2.verify(row.password_hash, plain))) {
      throw new AuthError(401, 'Incorrect password.');
    }
    await this.pool.query('DELETE FROM accounts WHERE id=$1', [row.id]);
    this.revoked(row.id);
  }
  async prune(): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE expires_at<=now()');
  }
}
