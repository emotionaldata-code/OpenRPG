import Phaser from 'phaser';
import { SKIN, type SkinDraft } from '@openrpg/shared';
import { paintSkin } from './skin-art';

/** Uses the same pixel data and 8 fps timing as the game, without networking. */
export class SkinPreview extends Phaser.Scene {
  draft: SkinDraft;
  direction = 1;
  walking = true;
  dirty = true;
  private texture!: Phaser.Textures.CanvasTexture;
  private lastFrame = -1;
  constructor(draft: SkinDraft) { super('skin-preview'); this.draft = draft; }
  create(): void {
    this.texture = this.textures.createCanvas('preview-skin', SKIN.width, SKIN.height)!;
    this.add.image(120, 105, 'preview-skin').setScale(5);
  }
  update(time: number): void {
    const frame = this.direction * SKIN.framesPerDirection + (this.walking ? Math.floor(time / 125) % 3 : 0);
    if (!this.dirty && frame === this.lastFrame) return;
    paintSkin(this.texture.context, this.draft, frame); this.texture.refresh();
    this.lastFrame = frame; this.dirty = false;
  }
}
export function mountSkinPreview(parent: HTMLElement, scene: SkinPreview): Phaser.Game {
  return new Phaser.Game({ type: Phaser.AUTO, parent, width: 240, height: 210, backgroundColor: '#1e362c', pixelArt: true, banner: false, audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false }, fps: { limit: 30 }, scene });
}
