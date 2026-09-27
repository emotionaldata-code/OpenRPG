import type { Pool } from 'pg';
import { SKIN, parseSkin, parseSkinId, type CharacterClass, type Skin, type SkinSummary } from '@openrpg/shared';
import { AuthError } from '../auth/accounts.js';
interface SkinRow { id: string; name: string; character_class: CharacterClass; template_version: number; artwork: Pick<Skin, 'palette' | 'frames'> }
function summary(row: SkinRow): SkinSummary { return { id: row.id, name: row.name, characterClass: row.character_class, templateVersion: row.template_version }; }
export class Skins {
  constructor(private pool: Pool) {}
  async list(accountId: string): Promise<SkinSummary[]> {
    const result = await this.pool.query<SkinRow>('SELECT id, name, character_class, template_version FROM skins WHERE account_id=$1 ORDER BY created_at DESC, id', [accountId]);
    return result.rows.map(summary);
  }
  async delete(accountId: string, id: string): Promise<void> {
    try { parseSkinId(id); } catch { throw new AuthError(400, 'Invalid skin ID.'); }
    const result = await this.pool.query('DELETE FROM skins WHERE id=$1 AND account_id=$2', [id, accountId]);
    if (!result.rowCount) throw new AuthError(404, 'Skin not found. It may already have been deleted.');
  }
  async get(id: string, accountId?: string, characterClass?: CharacterClass): Promise<Skin> {
    try { parseSkinId(id); } catch { throw new AuthError(400, 'Invalid skin ID.'); }
    const result = await this.pool.query<SkinRow>('SELECT * FROM skins WHERE id=$1 AND ($2::uuid IS NULL OR account_id=$2)', [id, accountId ?? null]);
    const row = result.rows[0];
    if (!row) throw new AuthError(404, 'Skin not found. Choose another skin.');
    if (characterClass && row.character_class !== characterClass) throw new AuthError(400, 'Choose a skin for this class.');
    return { ...summary(row), ...row.artwork };
  }
  async create(accountId: string, raw: unknown): Promise<Skin> {
    let draft;
    try { draft = parseSkin(raw); } catch (error) { throw new AuthError(400, (error as Error).message); }
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize saves for this account so concurrent requests cannot bypass the cap.
      const owner = await db.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
      if (!owner.rowCount) throw new AuthError(401, 'Your account has ended.');
      const count = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM skins WHERE account_id=$1', [accountId]);
      if (count.rows[0]!.count >= SKIN.maxSaved) throw new AuthError(409, `Your wardrobe is full. Delete a saved skin to make room (${SKIN.maxSaved} maximum).`);
      const result = await db.query<SkinRow>('INSERT INTO skins(account_id,name,character_class,template_version,artwork) VALUES ($1,$2,$3,$4,$5) RETURNING *', [accountId, draft.name, draft.characterClass, draft.templateVersion, JSON.stringify({ palette: draft.palette, frames: draft.frames })]);
      await db.query('COMMIT');
      return { ...summary(result.rows[0]!), ...result.rows[0]!.artwork };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}
