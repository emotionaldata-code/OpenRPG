import type Phaser from 'phaser';
import { ITEMS, type Player } from '@openrpg/shared';
import { equipmentCanvas } from '../../art/item-art';
/** Two cached, frame-synchronized overlays per player, independent of their skin. */
export class EquipmentView {
  private armor: Phaser.GameObjects.Image;
  private weapon: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene) {
    if (!scene.textures.exists('gear-oak-bow-0-0')) {
      for (const gear of ITEMS) {
        for (let d = 0; d < 4; d++) {
          for (let f = 0; f < 3; f++) {
            scene.textures.addCanvas(`gear-${gear.id}-${d}-${f}`, equipmentCanvas(gear.id, d, f));
          }
        }
      }
    }
    this.armor = scene.add
      .image(0, 0, 'gear-iron-armor-0-0')
      .setOrigin(0.5, 0.8)
      .setScale(1.8)
      .setVisible(false);
    this.weapon = scene.add
      .image(0, 0, 'gear-oak-bow-0-0')
      .setOrigin(0.5, 0.8)
      .setScale(1.8)
      .setVisible(false);
  }
  draw(player: Pick<Player, 'armor' | 'weapon'>, sprite: Phaser.GameObjects.Sprite): void {
    const frame = sprite.texture.key.split('-').slice(-2).join('-');
    for (const [slot, image] of [
      ['armor', this.armor],
      ['weapon', this.weapon],
    ] as const) {
      image.setVisible(sprite.visible && !!player[slot]);
      if (player[slot]) {
        image
          .setTexture(`gear-${player[slot]}-${frame}`)
          .setPosition(sprite.x, sprite.y)
          .setDepth(sprite.depth + (slot === 'armor' ? 0.1 : 0.2))
          .setAlpha(sprite.alpha);
      }
    }
  }
  get textures(): string[] {
    return [this.armor, this.weapon]
      .filter((image) => image.visible)
      .map((image) => image.texture.key);
  }
  destroy(): void {
    this.armor.destroy();
    this.weapon.destroy();
  }
}
