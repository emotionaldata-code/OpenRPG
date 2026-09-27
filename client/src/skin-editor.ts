import type Phaser from 'phaser';
import { SKIN, parseSkin, type CharacterClass, type Skin, type SkinDraft, type SkinSummary } from '@openrpg/shared';
import { skinCanvas, templateSkin } from './skin-art';
import { fillPixels, pencilLine, type PixelTool } from './pixel-tools';
import { skinRequest } from './skin-api';
import { SkinPreview, mountSkinPreview } from './skin-preview';
import { Confirmation } from './confirmation';

export class SkinEditor {
  private dialog: HTMLDialogElement;
  private draft = templateSkin('archer');
  private history: SkinDraft[] = [];
  private future: SkinDraft[] = [];
  private direction = 1;
  private frame = 0;
  private color = 1;
  private tool: PixelTool = 'pencil';
  private lastPixel: number | null = null;
  private preview?: SkinPreview;
  private game?: Phaser.Game;
  private busy = false;
  private generation = 0;
  private active = false;
  private initialized = false;
  private dirty = false;
  private confirmation = new Confirmation();
  constructor(private saved: (skin: Skin) => void, private deleted: (id: string) => void) {
    this.dialog = document.createElement('dialog'); this.dialog.id = 'skin-editor'; this.dialog.setAttribute('aria-labelledby', 'skin-title');
    this.dialog.innerHTML = `
      <header class="studio-header"><div><span class="eyebrow">YOUR WARDROBE</span><h2 id="skin-title">Skin workshop</h2><p class="studio-subtitle">Make a look of your own. Wear it on your next expedition.</p></div><button id="skin-close" aria-label="Close skin editor">Close ✕</button></header>
      <div class="studio-library"><div class="library-heading"><label for="skin-library">SAVED SKINS</label><span id="skin-count"></span></div><div class="library-controls"><select id="skin-library"><option value="">No saved skins yet</option></select><button id="skin-copy" disabled>Edit a copy</button><button id="skin-delete" class="danger" disabled>Delete</button></div><p id="skin-library-hint" class="studio-hint">Create your first skin below.</p></div>
      <div class="studio-layout">
        <aside class="studio-tools">
          <label for="skin-class">START FROM A CLASS</label><select id="skin-class"><option value="archer">Archer</option><option value="mage">Mage</option><option value="warrior">Warrior</option></select><button id="skin-reset">New from template</button>
          <label for="skin-name">SKIN NAME</label><input id="skin-name" maxlength="32" placeholder="Name your creation">
          <span class="tool-label">TOOLS</span><div class="pixel-tools" role="group" aria-label="Pixel tools"><button data-tool="pencil" aria-pressed="true">✎ Pencil</button><button data-tool="eraser" aria-pressed="false">◇ Eraser</button><button data-tool="fill" aria-pressed="false">▧ Fill</button><button data-tool="picker" aria-pressed="false">⌖ Pick</button></div>
          <span class="tool-label">PALETTE</span><div id="skin-palette" role="group" aria-label="Skin colors"></div>
          <label for="skin-color">CHOSEN COLOR</label><div class="color-row"><input id="skin-color" type="color" value="#c6aa66"><button id="skin-add-color">Add color</button></div><button id="skin-recolor">Replace color</button>
          <p class="studio-hint">Replace the selected swatch across every frame.</p>
        </aside>
        <section class="studio-drawing" aria-label="Pixel drawing board"><div class="frame-controls"><label for="skin-direction">VIEW</label><select id="skin-direction"><option value="0">Right</option><option value="1" selected>Front</option><option value="2">Left</option><option value="3">Back</option></select><label for="skin-frame">FRAME</label><select id="skin-frame"><option value="0">1 · Idle</option><option value="1">2 · Walk</option><option value="2">3 · Walk</option></select></div>
          <div class="pixel-scroll"><canvas id="skin-board" width="288" height="336" aria-label="Skin pixel drawing canvas"></canvas></div>
          <div class="drawing-actions"><button id="skin-undo">↶ Undo</button><button id="skin-redo">↷ Redo</button><label for="skin-zoom">Zoom</label><select id="skin-zoom"><option value="8">8×</option><option value="12" selected>12×</option><option value="16">16×</option></select></div><p class="studio-hint">Painting changes this frame only.</p>
        </section>
        <aside class="studio-preview"><span class="eyebrow">PREVIEW · <span id="skin-current-class"></span></span><div id="skin-live"></div><label class="preview-toggle"><input id="skin-walking" type="checkbox" checked> Show walking</label><p class="studio-hint">A new appearance. Same abilities.</p><div class="studio-save"><button id="skin-save" class="primary">Save new skin <span aria-hidden="true">↗</span></button><p class="studio-hint">Saves a separate design in your wardrobe.</p></div></aside>
      </div><footer class="studio-footer"><span id="skin-draft-state">Draft</span><p id="skin-status" role="status" aria-live="polite"></p></footer>`;
    document.body.append(this.dialog);
    this.el('skin-close').onclick = () => this.close();
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.el('skin-reset').onclick = async () => {
      const generation = this.generation;
      if (this.dirty && !await this.confirmation.ask({ title: 'Start a new skin?', message: 'Your unsaved changes will be replaced by the class template.', accept: 'Start new skin' })) return;
      if (!this.active || generation !== this.generation) return;
      this.load(templateSkin(this.el<HTMLSelectElement>('skin-class').value as CharacterClass));
    };
    this.el('skin-copy').onclick = () => void this.run(async () => {
      const id = this.el<HTMLSelectElement>('skin-library').value;
      const generation = this.generation;
      if (!id) throw new Error('Choose a saved design first.');
      if (this.dirty && !await this.confirmation.ask({ title: 'Open this saved skin?', message: 'Your unsaved changes will be replaced. The saved skin stays unchanged until you save a new copy.', accept: 'Open a copy' })) { this.message('Draft kept.'); return; }
      if (!this.active || generation !== this.generation) return;
      const skin = await skinRequest<Skin>(`/${id}`);
      if (generation === this.generation && this.active) this.load(skin);
    });
    this.el<HTMLSelectElement>('skin-library').onchange = () => this.libraryActions();
    this.el('skin-delete').onclick = () => void this.run(async () => {
      const select = this.el<HTMLSelectElement>('skin-library');
      const id = select.value;
      if (!id) return;
      const name = select.selectedOptions[0]!.textContent!;
      const generation = this.generation;
      if (!await this.confirmation.ask({ title: 'Delete this skin?', message: `“${name}” will be permanently removed from your wardrobe. Your current draft will stay here.`, accept: 'Delete skin', destructive: true })) { this.message('Skin kept.'); return; }
      if (generation !== this.generation || !this.active) return;
      await skinRequest<void>(`/${id}`, {}, 'DELETE');
      if (generation !== this.generation || !this.active) return;
      this.deleted(id); this.message('Skin deleted. Your current draft is still here.');
    });
    this.el<HTMLInputElement>('skin-name').oninput = () => { this.draft.name = this.el<HTMLInputElement>('skin-name').value; this.dirty = true; this.draftStatus(); };
    for (const button of Array.from(this.dialog.querySelectorAll<HTMLButtonElement>('[data-tool]'))) button.onclick = () => {
      this.tool = button.dataset.tool as PixelTool;
      for (const other of Array.from(this.dialog.querySelectorAll('[data-tool]'))) other.setAttribute('aria-pressed', String(other === button));
    };
    for (const id of ['skin-direction', 'skin-frame', 'skin-zoom']) this.el<HTMLSelectElement>(id).onchange = () => {
      this.endStroke(); this.direction = Number(this.el<HTMLSelectElement>('skin-direction').value); this.frame = Number(this.el<HTMLSelectElement>('skin-frame').value); this.render();
    };
    this.el<HTMLInputElement>('skin-walking').onchange = () => { if (this.preview) this.preview.walking = this.el<HTMLInputElement>('skin-walking').checked; };
    this.el('skin-add-color').onclick = () => {
      if (this.draft.palette.length >= SKIN.maxColors) { this.message('The palette is full (63 colors). Recolor an existing swatch.'); return; }
      this.remember(); this.draft.palette.push(this.el<HTMLInputElement>('skin-color').value); this.color = this.draft.palette.length - 1; this.render();
    };
    this.el('skin-recolor').onclick = () => {
      if (!this.color) { this.message('Choose an opaque swatch to recolor.'); return; }
      this.remember(); this.draft.palette[this.color] = this.el<HTMLInputElement>('skin-color').value; this.render();
    };
    this.el('skin-undo').onclick = () => this.travel(this.history, this.future);
    this.el('skin-redo').onclick = () => this.travel(this.future, this.history);
    const board = this.el<HTMLCanvasElement>('skin-board');
    board.onpointerdown = event => {
      if (event.button !== 0 || this.busy || this.lastPixel !== null) return;
      event.preventDefault(); board.setPointerCapture(event.pointerId);
      const pixel = this.pixel(event);
      if (this.tool === 'picker') { this.color = this.draft.frames[this.index()]![pixel]!; this.render(); return; }
      this.remember(); this.lastPixel = pixel; this.draw(pixel);
    };
    board.onpointermove = event => { if (this.lastPixel !== null) this.draw(this.pixel(event)); };
    board.onpointerup = board.onpointercancel = board.onlostpointercapture = () => this.endStroke();
    window.addEventListener('blur', () => this.endStroke());
    this.el('skin-save').onclick = () => void this.run(async () => {
      const draft = parseSkin(this.draft); const generation = this.generation;
      const skin = await skinRequest<Skin>('', draft);
      if (generation !== this.generation || !this.active) return;
      this.dirty = false; this.saved(skin); this.draftStatus();
      this.el<HTMLSelectElement>('skin-library').value = skin.id;
      this.message(`“${skin.name}” saved to your wardrobe.`);
    });
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.dialog.querySelector(`#${id}`) as T; }
  setActive(active: boolean): void {
    this.generation++; this.active = active; this.close(); this.load(templateSkin('archer'));
    this.setLibrary([]); this.initialized = false;
  }
  setLibrary(skins: SkinSummary[]): void {
    const select = this.el<HTMLSelectElement>('skin-library'); const previous = select.value;
    select.replaceChildren(new Option(skins.length ? 'Choose a saved skin' : 'No saved skins yet', ''));
    for (const skin of skins) select.add(new Option(`${skin.name} · ${skin.characterClass}`, skin.id));
    select.value = skins.some(skin => skin.id === previous) ? previous : '';
    this.el('skin-count').textContent = `${skins.length} / ${SKIN.maxSaved}`;
    this.el('skin-library-hint').textContent = skins.length ? 'Choose a skin to edit a copy or delete it.' : 'Create your first skin below.';
    this.libraryActions();
  }
  private libraryActions(): void {
    const disabled = this.busy || !this.el<HTMLSelectElement>('skin-library').value;
    this.el<HTMLButtonElement>('skin-copy').disabled = disabled;
    this.el<HTMLButtonElement>('skin-delete').disabled = disabled;
  }
  open(kind: CharacterClass): void {
    if (!this.active || this.dialog.open) return;
    if (!this.initialized) { this.load(templateSkin(kind)); this.initialized = true; }
    this.dialog.showModal();
    this.preview = new SkinPreview(this.draft); this.preview.direction = this.direction;
    this.preview.walking = this.el<HTMLInputElement>('skin-walking').checked;
    this.game = mountSkinPreview(this.el('skin-live'), this.preview);
    this.render();
  }
  private close(): void { this.confirmation.cancel(); this.endStroke(); this.dialog.close(); this.game?.destroy(true); this.game = undefined; this.preview = undefined; }
  private load(draft: SkinDraft): void {
    this.draft = structuredClone(draft); this.dirty = false; this.history = []; this.future = []; this.color = 1;
    this.el<HTMLInputElement>('skin-name').value = draft.name; this.el<HTMLSelectElement>('skin-class').value = draft.characterClass;
    this.message(''); this.render();
  }
  private index(): number { return this.direction * SKIN.framesPerDirection + this.frame; }
  private pixel(event: PointerEvent): number {
    const box = this.el('skin-board').getBoundingClientRect();
    return Math.min(SKIN.height - 1, Math.max(0, Math.floor((event.clientY - box.top) / box.height * SKIN.height))) * SKIN.width + Math.min(SKIN.width - 1, Math.max(0, Math.floor((event.clientX - box.left) / box.width * SKIN.width)));
  }
  private draw(pixel: number): void {
    const pixels = this.draft.frames[this.index()]!;
    if (this.tool === 'fill') { fillPixels(pixels, pixel, this.color); this.endStroke(); }
    else { pencilLine(pixels, this.lastPixel ?? pixel, pixel, this.tool === 'eraser' ? 0 : this.color); this.lastPixel = pixel; }
    this.render();
  }
  private endStroke(): void { this.lastPixel = null; }
  private remember(): void { this.dirty = true; this.history.push(structuredClone(this.draft)); if (this.history.length > 30) this.history.shift(); this.future = []; }
  private travel(from: SkinDraft[], to: SkinDraft[]): void {
    const draft = from.pop(); if (!draft) return;
    this.dirty = true; to.push(structuredClone(this.draft)); this.draft = draft; this.color = Math.min(this.color, draft.palette.length - 1);
    this.el<HTMLInputElement>('skin-name').value = draft.name; this.render();
  }
  private render(): void {
    this.draftStatus();
    this.el('skin-current-class').textContent = this.draft.characterClass.toUpperCase();
    const zoom = Number(this.el<HTMLSelectElement>('skin-zoom').value);
    const board = this.el<HTMLCanvasElement>('skin-board'); board.width = SKIN.width * zoom; board.height = SKIN.height * zoom;
    const ctx = board.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < SKIN.height; y++) for (let x = 0; x < SKIN.width; x++) { ctx.fillStyle = (x + y) % 2 ? '#2e4338' : '#263b31'; ctx.fillRect(x * zoom, y * zoom, zoom, zoom); }
    ctx.drawImage(skinCanvas(this.draft, this.index()), 0, 0, board.width, board.height);
    ctx.fillStyle = '#0c211c44';
    for (let x = 0; x < board.width; x += zoom) ctx.fillRect(x, 0, 1, board.height);
    for (let y = 0; y < board.height; y += zoom) ctx.fillRect(0, y, board.width, 1);
    const palette = this.el('skin-palette'); palette.replaceChildren();
    this.draft.palette.forEach((color, index) => {
      const button = document.createElement('button'); button.style.backgroundColor = color; button.title = index ? color : 'Transparent'; button.setAttribute('aria-label', `Color ${index}: ${color}`); button.setAttribute('aria-pressed', String(index === this.color));
      if (!index) button.textContent = '×';
      button.onclick = () => { this.color = index; this.render(); }; palette.append(button);
    });
    if (this.color) this.el<HTMLInputElement>('skin-color').value = this.draft.palette[this.color]!;
    this.el<HTMLButtonElement>('skin-undo').disabled = !this.history.length;
    this.el<HTMLButtonElement>('skin-redo').disabled = !this.future.length;
    this.el<HTMLButtonElement>('skin-recolor').disabled = !this.color;
    if (this.preview) { this.preview.draft = this.draft; this.preview.direction = this.direction; this.preview.dirty = true; }
  }
  private draftStatus(): void { this.el('skin-draft-state').textContent = this.dirty ? 'Unsaved changes' : 'Draft ready'; }
  private message(message: string): void { this.el('skin-status').textContent = message; }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy || !this.active) return;
    this.endStroke(); this.busy = true;
    const generation = this.generation;
    this.message('Working…');
    this.dialog.querySelector<HTMLElement>('.studio-layout')!.inert = true;
    this.dialog.querySelector<HTMLElement>('.studio-library')!.inert = true;
    this.dialog.setAttribute('aria-busy', 'true');
    this.el('skin-save').setAttribute('disabled', ''); this.libraryActions();
    try { await action(); }
    catch (error) { if (generation === this.generation) this.message(error instanceof Error ? error.message : 'Skin request failed.'); }
    finally { this.dialog.querySelector<HTMLElement>('.studio-layout')!.inert = false; this.dialog.querySelector<HTMLElement>('.studio-library')!.inert = false; this.dialog.setAttribute('aria-busy', 'false'); this.busy = false; this.el('skin-save').removeAttribute('disabled'); this.libraryActions(); }
  }
}
