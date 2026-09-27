import Phaser from 'phaser';
import { SKIN, type CharacterClass, type SkinDraft } from '@openrpg/shared';
import { actorCanvas } from './art';

export function templateSkin(characterClass: CharacterClass): SkinDraft {
  const palette = ['transparent'];
  const frames: number[][] = [];
  for (let direction = 0; direction < SKIN.directions; direction++) for (let frame = 0; frame < SKIN.framesPerDirection; frame++) {
    const rgba = actorCanvas(characterClass, direction, frame).getContext('2d')!.getImageData(0, 0, SKIN.width, SKIN.height).data;
    const pixels: number[] = [];
    for (let i = 0; i < rgba.length; i += 4) {
      const color = rgba[i + 3] === 0 ? 'transparent' : `#${[rgba[i], rgba[i + 1], rgba[i + 2]].map(v => v!.toString(16).padStart(2, '0')).join('')}`;
      let index = palette.indexOf(color);
      if (index < 0) { index = palette.length; palette.push(color); }
      pixels.push(index);
    }
    frames.push(pixels);
  }
  return { name: `Woodland ${characterClass}`, characterClass, templateVersion: SKIN.version, palette, frames };
}
export function paintSkin(ctx: CanvasRenderingContext2D, skin: SkinDraft, frame: number): void {
  ctx.clearRect(0, 0, SKIN.width, SKIN.height);
  skin.frames[frame]!.forEach((color, pixel) => {
    if (!color) return;
    ctx.fillStyle = skin.palette[color]!;
    ctx.fillRect(pixel % SKIN.width, Math.floor(pixel / SKIN.width), 1, 1);
  });
}
export function skinCanvas(skin: SkinDraft, frame: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = SKIN.width; canvas.height = SKIN.height;
  paintSkin(canvas.getContext('2d')!, skin, frame);
  return canvas;
}
export function addSkinTextures(scene: Phaser.Scene, key: string, skin: SkinDraft): void {
  if (scene.textures.exists(`${key}-0-0`)) return;
  for (let direction = 0; direction < SKIN.directions; direction++) {
    const frames = Array.from({ length: SKIN.framesPerDirection }, (_, frame) => {
      const texture = `${key}-${direction}-${frame}`;
      scene.textures.addCanvas(texture, skinCanvas(skin, direction * SKIN.framesPerDirection + frame));
      return { key: texture };
    });
    scene.anims.create({ key: `${key}-${direction}`, frames, frameRate: 8, repeat: -1 });
  }
}
