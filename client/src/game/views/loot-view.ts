import type Phaser from 'phaser';
import { ITEMS, item, type WorldState } from '@openrpg/shared';
import { itemCanvas } from '../../art/item-art';
interface DropView {
  icon: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
}
export class LootView {
  private views = new Map<string, DropView>();
  constructor(
    private scene: Phaser.Scene,
    private state: WorldState,
    private owner: string,
  ) {
    for (const id of [...ITEMS.map((gear) => gear.id), 'potion', 'coins']) {
      scene.textures.addCanvas(`loot-${id}`, itemCanvas(id));
    }
  }
  draw(): void {
    const self = this.state.players.get(this.owner);
    let nearest: string | undefined,
      distance = 90;
    if (self) {
      for (const [id, drop] of this.state.drops) {
        const next = Math.hypot(self.x - drop.x, self.y - drop.y);
        if (drop.owner === this.owner && next < distance) {
          nearest = id;
          distance = next;
        }
      }
    }
    for (const [id, drop] of this.state.drops) {
      if (drop.owner !== this.owner) {
        continue;
      }
      let view = this.views.get(id);
      if (!view) {
        view = {
          icon: this.scene.add.image(drop.x, drop.y, `loot-${drop.itemId}`).setScale(0.9),
          shadow: this.scene.add.ellipse(drop.x, drop.y + 7, 25, 10, 0xdab66d, 0.25),
          label: this.scene.add
            .text(
              drop.x,
              drop.y - 28,
              drop.itemId === 'coins'
                ? `${drop.quantity} coins`
                : drop.itemId === 'potion'
                  ? 'Health potion'
                  : item(drop.itemId)!.name,
              {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#fff0bb',
                backgroundColor: '#172e25',
              },
            )
            .setOrigin(0.5),
        };
        this.views.set(id, view);
      }
      view.icon
        .setY(drop.y - 6 + Math.sin(this.scene.time.now / 260 + Number(id)) * 2)
        .setDepth(drop.y + 2);
      view.shadow.setDepth(drop.y - 1);
      view.label.setDepth(drop.y + 3).setVisible(id === nearest);
    }
    for (const [id, view] of this.views) {
      if (!this.state.drops.has(id)) {
        view.icon.destroy();
        view.shadow.destroy();
        view.label.destroy();
        this.views.delete(id);
      }
    }
  }
}
