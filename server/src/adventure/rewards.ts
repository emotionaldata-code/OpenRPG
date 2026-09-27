import type { Reward } from '@openrpg/shared';
import type { Adventures } from './store.js';
interface Pending {
  accountId: string;
  eventId: string;
  reward: Reward;
}
/** Small room-owned queue: database work never runs in the fixed simulation loop. */
export class Rewards {
  private pending: Pending[] = [];
  private saving?: Promise<void>;
  constructor(
    private store: Adventures,
    private changed: (status: 'saving' | 'saved' | 'error') => void,
  ) {}
  get backlog(): number {
    return this.pending.length;
  }
  add(accountId: string, eventId: string, reward: Reward): void {
    this.pending.push({ accountId, eventId, reward });
    void this.flush();
  }
  flush(): Promise<void> {
    if (this.saving) {
      return this.saving;
    }
    this.saving = this.save().finally(() => {
      this.saving = undefined;
    });
    return this.saving;
  }
  private async save(): Promise<void> {
    if (!this.pending.length) {
      return;
    }
    this.changed('saving');
    try {
      while (this.pending[0]) {
        const entry = this.pending[0];
        // Keep the same event ID on retry; the database receipt prevents duplicate loot.
        await this.store.reward(entry.accountId, entry.eventId, entry.reward);
        this.pending.shift();
      }
      this.changed('saved');
    } catch {
      this.changed('error');
    }
  }
}
