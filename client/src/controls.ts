import Phaser from 'phaser';
import type { Intent, Point } from '@openrpg/shared';
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private firing = false;
  constructor(private scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    scene.input.on('pointerdown', this.down);
    scene.input.on('pointerup', this.up);
    scene.input.on('gameout', this.up);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.visibility);
  }
  private down = (p: Phaser.Input.Pointer): void => { if (p.leftButtonDown()) this.firing = true; };
  private up = (): void => { this.firing = false; };
  private visibility = (): void => { if (document.hidden) this.clear(); };
  clear = (): void => { this.firing = false; this.scene.input.keyboard?.resetKeys(); };
  sample(player: Point): Intent {
    const down = (...keys: string[]): number => Number(keys.some((k) => this.keys[k]?.isDown));
    const pointer = this.scene.input.activePointer;
    pointer.updateWorldPoint(this.scene.cameras.main);
    return { moveX: down('D', 'RIGHT') - down('A', 'LEFT'), moveY: down('S', 'DOWN') - down('W', 'UP'), aim: Math.atan2(pointer.worldY - player.y, pointer.worldX - player.x), fire: this.firing };
  }
  dispose(): void {
    window.removeEventListener('blur', this.clear); document.removeEventListener('visibilitychange', this.visibility);
    this.scene.input.off('pointerdown', this.down); this.scene.input.off('pointerup', this.up); this.scene.input.off('gameout', this.up);
  }
}
