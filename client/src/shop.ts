import { ECONOMY, ITEMS, POTIONS, ownedQuantity, type AdventureProfile, type Trade } from '@openrpg/shared';
import { itemIcon } from './item-art';
export class ShopPanel {
  private profile: AdventureProfile | null = null;
  private busy = false;
  private revision = 0;
  private root = document.getElementById('shop-items')!;
  private status = document.getElementById('shop-status')!;
  constructor(private changed: (profile: AdventureProfile) => void, private refresh: () => Promise<void>) {}
  reset(): void { this.revision++; this.busy = false; this.status.textContent = 'Log in from Your adventurer to trade.'; this.setProfile(null); }
  setProfile(profile: AdventureProfile | null): void { if (!this.profile && profile) this.status.textContent = ''; this.profile = profile; this.render(); }
  private render(): void {
    const purse = document.getElementById('shop-coins')!; purse.replaceChildren(itemIcon('coins'), document.createTextNode(`${this.profile?.coins ?? 0} coins`));
    this.root.replaceChildren();
    const entries = [...ITEMS, { id: 'potion', name: 'Health potion', characterClass: 'all classes', slot: 'consumable', description: 'Restore 50 HP with R. Pack before departure.', buy: ECONOMY.potionBuy, sell: ECONOMY.potionSell }];
    for (const gear of entries) {
      const count = gear.id === 'potion' ? this.profile?.potions ?? 0 : ownedQuantity(this.profile, gear.id);
      const card = document.createElement('article'); card.className = 'shop-card'; card.dataset.item = gear.id;
      const heading = document.createElement('div'); heading.className = 'shop-item-heading';
      const title = document.createElement('h3'); title.textContent = gear.name; heading.append(itemIcon(gear.id), title);
      const detail = document.createElement('p'); detail.textContent = `${gear.characterClass} · ${gear.description}`;
      const stock = document.createElement('small'); stock.textContent = `In your satchel: ${count}`;
      const actions = document.createElement('div'); actions.className = 'shop-actions';
      for (const action of ['buy', 'sell'] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = `${action === 'buy' ? 'Buy' : 'Sell'} 1 · ${gear[action]} coins`;
        button.disabled = !this.profile || this.busy || (action === 'buy' ? this.profile.coins < gear.buy || count >= (gear.id === 'potion' ? POTIONS.maxStored : ECONOMY.maxStack) : count === 0 || this.profile.coins + gear.sell > ECONOMY.maxCoins);
        button.onclick = () => { void this.trade({ action, itemId: gear.id }); }; actions.append(button);
      }
      card.append(heading, detail, stock, actions); this.root.append(card);
    }
  }
  private async trade(trade: Trade): Promise<void> {
    if (this.busy || !this.profile) return;
    const revision = this.revision; this.busy = true; this.render(); this.status.textContent = 'Trading with the quartermaster…';
    try {
      const response = await fetch('/api/adventure/trade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trade), signal: AbortSignal.timeout(10000) });
      const data = await response.json() as AdventureProfile & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Trade unavailable.');
      if (revision !== this.revision) return;
      this.changed(data); this.status.textContent = trade.action === 'buy' ? 'Purchased. Added to your satchel.' : 'Sold. Coins added to your purse.';
    } catch (error) {
      if (revision !== this.revision) return;
      this.status.textContent = `${error instanceof Error ? error.message : 'Trade interrupted.'} Refreshing your balance…`;
      await this.refresh();
    } finally {
      if (revision === this.revision) {
        this.busy = false; this.render();
        this.root.querySelector<HTMLButtonElement>(`[data-item="${trade.itemId}"] button:nth-child(${trade.action === 'buy' ? 1 : 2})`)?.focus();
      }
    }
  }
}
