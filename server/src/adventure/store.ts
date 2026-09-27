import type { Pool, PoolClient } from 'pg';
import {
  MAP_IDS,
  POTIONS,
  ECONOMY,
  parseTrade,
  item,
  mapUnlocked,
  type AdventureProfile,
  type CharacterClass,
  type ExpeditionMode,
  type Loadout,
  type MapId,
  type Reward,
} from '@openrpg/shared';
import { AuthError } from '../auth/accounts.js';

interface Row {
  potions: number;
  coins: number;
  completed_maps: number;
}
export class Adventures {
  constructor(private pool: Pool) {}
  private async ensure(db: Pool | PoolClient, id: string): Promise<void> {
    await db.query('INSERT INTO adventurers(account_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  }
  async profile(id: string): Promise<AdventureProfile> {
    await this.ensure(this.pool, id);
    const result = await this.pool.query<Row>(
      'SELECT potions, coins, completed_maps FROM adventurers WHERE account_id=$1',
      [id],
    );
    const gear = await this.pool.query<{ item_id: string; quantity: number }>(
      'SELECT item_id, quantity FROM account_items WHERE account_id=$1 ORDER BY item_id',
      [id],
    );
    const row = result.rows[0]!;
    return {
      items: gear.rows.map((entry) => ({ id: entry.item_id, quantity: entry.quantity })),
      potions: row.potions,
      coins: row.coins,
      completedMaps: row.completed_maps,
    };
  }
  /** Validate ownership and spend supplies atomically, once on successful room admission. */
  async embark(
    id: string,
    kind: CharacterClass,
    map: MapId,
    mode: ExpeditionMode,
    loadout: Loadout,
  ): Promise<void> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await this.ensure(db, id);
      const row = (
        await db.query<Row>('SELECT * FROM adventurers WHERE account_id=$1 FOR UPDATE', [id])
      ).rows[0]!;
      if (mode === 'story' && !mapUnlocked(map, row.completed_maps)) {
        throw new AuthError(403, 'Finish the previous story map first.');
      }
      for (const slot of ['weapon', 'armor'] as const) {
        const selected = loadout[slot];
        if (!selected) {
          continue;
        }
        const definition = item(selected);
        const owned = await db.query(
          'SELECT 1 FROM account_items WHERE account_id=$1 AND item_id=$2',
          [id, selected],
        );
        if (
          !definition ||
          definition.slot !== slot ||
          definition.characterClass !== kind ||
          !owned.rowCount
        ) {
          throw new AuthError(403, 'Equip only collected gear for your chosen class.');
        }
      }
      if (row.potions < loadout.potions) {
        throw new AuthError(400, 'Not enough stored potions. Refresh your supplies.');
      }
      await db.query('UPDATE adventurers SET potions=potions-$2 WHERE account_id=$1', [
        id,
        loadout.potions,
      ]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async reward(id: string, eventId: string, reward: Reward): Promise<boolean> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Deleting an account while rewards are pending must not recreate it.
      const account = await db.query('SELECT id FROM accounts WHERE id=$1 FOR KEY SHARE', [id]);
      if (!account.rowCount) {
        await db.query('ROLLBACK');
        return false;
      }
      await this.ensure(db, id);
      await db.query('SELECT 1 FROM adventurers WHERE account_id=$1 FOR UPDATE', [id]);
      const receipt = await db.query(
        'INSERT INTO adventure_rewards(account_id,event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',
        [id, eventId],
      );
      if (!receipt.rowCount) {
        await db.query('COMMIT');
        return false;
      }
      for (const gear of reward.items) {
        if (!item(gear)) {
          throw new Error('Unknown reward item.');
        }
        await db.query(
          'INSERT INTO account_items(account_id,item_id) VALUES ($1,$2) ON CONFLICT (account_id,item_id) DO UPDATE SET quantity=LEAST(999,account_items.quantity+1)',
          [id, gear],
        );
      }
      const completed =
        reward.completedMap === undefined ? -1 : MAP_IDS.indexOf(reward.completedMap);
      await db.query(
        'UPDATE adventurers SET potions=LEAST($2,potions+$3), coins=LEAST($5,coins+$6), completed_maps=CASE WHEN completed_maps=$4 THEN completed_maps+1 ELSE completed_maps END WHERE account_id=$1',
        [id, POTIONS.maxStored, reward.potions, completed, ECONOMY.maxCoins, reward.coins ?? 0],
      );
      await db.query('COMMIT');
      return true;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  /** One unit per trade; row locking serializes purchases, sales, rewards and packing. */
  async trade(id: string, raw: unknown): Promise<void> {
    let trade: ReturnType<typeof parseTrade>;
    try {
      trade = parseTrade(raw);
    } catch (error) {
      throw new AuthError(400, (error as Error).message);
    }
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await this.ensure(db, id);
      const row = (
        await db.query<Row>('SELECT * FROM adventurers WHERE account_id=$1 FOR UPDATE', [id])
      ).rows[0]!;
      const potion = trade.itemId === 'potion',
        buying = trade.action === 'buy';
      const definition = item(trade.itemId);
      const price = potion
        ? buying
          ? ECONOMY.potionBuy
          : ECONOMY.potionSell
        : definition![buying ? 'buy' : 'sell'];
      const stock = potion
        ? row.potions
        : ((
            await db.query<{ quantity: number }>(
              'SELECT quantity FROM account_items WHERE account_id=$1 AND item_id=$2',
              [id, trade.itemId],
            )
          ).rows[0]?.quantity ?? 0);
      if (buying && row.coins < price) {
        throw new AuthError(400, 'Not enough coins. Collect treasure or sell spare gear.');
      }
      if (buying && stock >= (potion ? POTIONS.maxStored : ECONOMY.maxStack)) {
        throw new AuthError(400, 'Your storage for this item is full.');
      }
      if (!buying && stock < 1) {
        throw new AuthError(400, 'You do not own this item.');
      }
      if (!buying && row.coins + price > ECONOMY.maxCoins) {
        throw new AuthError(400, 'Your coin purse is full.');
      }
      await db.query('UPDATE adventurers SET coins=coins+$2 WHERE account_id=$1', [
        id,
        buying ? -price : price,
      ]);
      if (potion) {
        await db.query('UPDATE adventurers SET potions=potions+$2 WHERE account_id=$1', [
          id,
          buying ? 1 : -1,
        ]);
      } else if (!buying && stock === 1) {
        await db.query('DELETE FROM account_items WHERE account_id=$1 AND item_id=$2', [
          id,
          trade.itemId,
        ]);
      } else {
        await db.query(
          'INSERT INTO account_items(account_id,item_id,quantity) VALUES ($1,$2,$3) ON CONFLICT (account_id,item_id) DO UPDATE SET quantity=$3',
          [id, trade.itemId, stock + (buying ? 1 : -1)],
        );
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async prune(): Promise<void> {
    await this.pool.query(
      "DELETE FROM adventure_rewards WHERE created_at < now() - interval '7 days'",
    );
  }
}
