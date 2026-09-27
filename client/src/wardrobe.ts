import type { AccountProfile, CharacterClass, Skin, SkinSummary } from '@openrpg/shared';
import { SkinEditor } from './skin-editor';
import { skinRequest } from './skin-api';

export class Wardrobe {
  private skins: SkinSummary[] = [];
  private accountId?: string;
  private revision = 0;
  private kind: CharacterClass = 'archer';
  private choices = new Map<CharacterClass, string>();
  private select = document.getElementById('equipped-skin') as HTMLSelectElement;
  private editor = new SkinEditor(skin => this.saved(skin), id => this.deleted(id));
  constructor() {
    document.getElementById('my-skins')!.onclick = () => { this.editor.open(this.kind); void this.refresh(); };
    this.select.onchange = () => this.choices.set(this.kind, this.select.value);
  }
  get selected(): string | undefined { return this.choices.get(this.kind) || undefined; }
  setAccount(profile: AccountProfile | null): void {
    this.revision++; this.accountId = profile?.id; this.skins = []; this.choices.clear();
    this.editor.setActive(!!profile); this.render();
    if (profile) void this.refresh();
  }
  setClass(kind: CharacterClass): void { this.kind = kind; this.render(); }
  private async refresh(): Promise<void> {
    if (!this.accountId) return;
    const revision = ++this.revision;
    try {
      const skins = await skinRequest<SkinSummary[]>();
      if (revision !== this.revision) return;
      this.skins = skins; this.render(); this.message('');
    } catch (error) { if (revision === this.revision) this.message(error instanceof Error ? error.message : 'Cannot load skins.'); }
  }
  private saved(skin: Skin): void {
    this.revision++; this.skins.unshift(skin); this.choices.set(skin.characterClass, skin.id);
    this.render(); this.message(`Saved “${skin.name}” for ${skin.characterClass}.`);
  }
  private deleted(id: string): void {
    this.revision++; this.skins = this.skins.filter(skin => skin.id !== id);
    for (const [kind, selected] of this.choices) if (selected === id) this.choices.delete(kind);
    this.render(); this.message('Skin removed from your wardrobe.');
  }
  private render(): void {
    if (this.selected && !this.skins.some(skin => skin.id === this.selected)) this.choices.delete(this.kind);
    this.select.replaceChildren(new Option('Class original', ''));
    for (const skin of this.skins.filter(skin => skin.characterClass === this.kind)) this.select.add(new Option(skin.name, skin.id));
    this.select.value = this.selected ?? '';
    this.editor.setLibrary(this.skins);
  }
  private message(text: string): void { document.getElementById('wardrobe-status')!.textContent = text; }
}
