import { ITEMS, POTIONS, ownedQuantity, emptyLoadout, type AccountProfile, type AdventureProfile, type CharacterClass, type Loadout } from '@openrpg/shared';
import { itemIcon } from './item-art';
import { ShopPanel } from './shop';
const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
export class AdventurePanel {
  profile: AdventureProfile | null = null;
  loadout: Loadout = emptyLoadout();
  private accountId?: string;
  private kind: CharacterClass = 'archer';
  private revision = 0;
  private shop: ShopPanel;
  constructor(private changed: (profile: AdventureProfile | null) => void) {
    this.shop = new ShopPanel(profile => { this.revision++; this.accept(profile); element('supplies-status').textContent = ''; }, () => this.refresh());
    element<HTMLInputElement>('potion-count').oninput = () => {
      const field = element<HTMLInputElement>('potion-count');
      this.loadout.potions = Math.max(0, Math.min(Math.floor(Number(field.value) || 0), POTIONS.maxCarry, this.profile?.potions ?? 0));
      field.value = String(this.loadout.potions); this.potionButtons();
    };
    for (const [id, delta] of [['potion-less', -1], ['potion-more', 1]] as const) element(id).onclick = () => {
      const field = element<HTMLInputElement>('potion-count'); field.value = String(this.loadout.potions + delta); field.dispatchEvent(new Event('input'));
    };
    element('supplies-retry').onclick = () => { void this.refresh(); };
    this.render();
  }
  setAccount(account: AccountProfile | null): void {
    this.shop.reset();
    this.accountId = account?.id; this.profile = null; this.loadout = emptyLoadout(); this.revision++;
    this.changed(null); this.render();
    if (account) void this.refresh();
  }
  setClass(kind: CharacterClass): void { this.kind = kind; this.loadout.weapon = ''; this.loadout.armor = ''; this.render(); }
  async refresh(): Promise<void> {
    if (!this.accountId) return;
    const revision = ++this.revision;
    element('supplies-status').textContent = 'Opening your satchel…';
    try {
      const response = await fetch('/api/adventure', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Could not load your supplies. Please retry.');
      const profile = await response.json() as AdventureProfile;
      if (revision !== this.revision) return;
      this.accept(profile); element('supplies-status').textContent = '';
    } catch (error) { if (revision === this.revision) element('supplies-status').textContent = error instanceof Error ? error.message : 'Supplies unavailable.'; }
  }
  private accept(profile: AdventureProfile): void {
    this.profile = profile;
    for (const slot of ['weapon', 'armor'] as const) if (!ownedQuantity(profile, this.loadout[slot])) this.loadout[slot] = '';
    this.loadout.potions = Math.min(this.loadout.potions, profile.potions);
    this.changed(profile); this.render();
  }
  private potionButtons(): void {
    element<HTMLButtonElement>('potion-less').disabled = this.loadout.potions <= 0;
    element<HTMLButtonElement>('potion-more').disabled = this.loadout.potions >= Math.min(POTIONS.maxCarry, this.profile?.potions ?? 0);
  }
  private render(): void {
    for (const slot of ['weapon', 'armor'] as const) {
      const root = element(`loadout-${slot}`); root.replaceChildren();
      const choices = [{ id: '', name: slot === 'weapon' ? 'Class weapon' : 'Travel clothes', description: 'Standard class abilities.' }, ...ITEMS.filter(entry => entry.characterClass === this.kind && entry.slot === slot && ownedQuantity(this.profile, entry.id) > 0)];
      for (const choice of choices) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'gear-choice'; button.id = `gear-${slot}-${choice.id || 'default'}`;
        button.setAttribute('aria-pressed', String(this.loadout[slot] === choice.id));
        const name = document.createElement('strong'); name.textContent = choice.name;
        const detail = document.createElement('small'); detail.textContent = choice.description;
        if (choice.id) button.append(itemIcon(choice.id));
        button.append(name, detail); button.onclick = () => { this.loadout[slot] = choice.id; this.render(); document.getElementById(button.id)?.focus(); }; root.append(button);
      }
    }
    this.shop.setProfile(this.profile);
    const count = element<HTMLInputElement>('potion-count'); count.max = String(Math.min(POTIONS.maxCarry, this.profile?.potions ?? 0)); count.value = String(this.loadout.potions);
    this.potionButtons();
    element('potion-stock').textContent = `${this.profile?.potions ?? 0} stored · carry up to ${POTIONS.maxCarry}`;
    element('collection-summary').textContent = this.profile ? `${this.profile.items.length} / ${ITEMS.length} relics collected · ${this.profile.potions} health potion${this.profile.potions === 1 ? '' : 's'} · ${this.profile.completedMaps} / 5 story maps cleared` : 'Log in to see your collected equipment.';
    const root = element('item-collection'); root.replaceChildren();
    for (const gear of ITEMS) {
      const quantity = ownedQuantity(this.profile, gear.id), owned = quantity > 0;
      const card = document.createElement('article'); card.className = `item-card${owned ? ' owned' : ''}`;
      const label = document.createElement('small'); label.textContent = `${gear.characterClass} · ${gear.slot} · ${owned ? `Owned ×${quantity}` : 'Undiscovered'}`;
      const title = document.createElement('strong'); title.textContent = gear.name;
      const description = document.createElement('p'); description.textContent = gear.description;
      card.append(itemIcon(gear.id), label, title, description); root.append(card);
    }
    const supplies = element('collection-supplies'); supplies.replaceChildren();
    for (const [id, label] of [['potion', `${this.profile?.potions ?? 0} health potions`], ['coins', `${this.profile?.coins ?? 0} coins`]]) {
      const card = document.createElement('div'); card.className = 'supply-card'; card.append(itemIcon(id!), document.createTextNode(label!)); supplies.append(card);
    }
  }
}
