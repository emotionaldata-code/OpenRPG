import type Phaser from 'phaser';
import type { Intent, Point } from '@openrpg/shared';
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private firing = false;
  private special = false;
  private pressedFire = false;
  private pressedSpecial = false;
  private cancelFire = false;
  constructor(
    private scene: Phaser.Scene,
    private potion: () => void,
  ) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    scene.input.keyboard!.on('keydown-R', this.drink);
    scene.input.on('pointerdown', this.down);
    scene.input.on('pointerup', this.up);
    scene.input.on('gameout', this.clear);
    scene.input.mouse?.disableContextMenu();
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.visibility);
  }
  private drink = (event: KeyboardEvent): void => {
    if (!event.repeat) {
      this.potion();
    }
  };
  private down = (p: Phaser.Input.Pointer): void => {
    if (p.leftButtonDown()) {
      this.firing = true;
      this.pressedFire = true;
    }
    if (p.rightButtonDown()) {
      this.special = true;
      this.pressedSpecial = true;
    }
  };
  private up = (p: Phaser.Input.Pointer): void => {
    this.firing = p.leftButtonDown();
    this.special = p.rightButtonDown();
  };
  private visibility = (): void => {
    if (document.hidden) {
      this.clear();
    }
  };
  consume(): void {
    this.pressedFire = false;
    this.pressedSpecial = false;
    this.cancelFire = false;
  }
  clear = (): void => {
    this.firing = false;
    this.special = false;
    this.consume();
    this.cancelFire = true;
    this.scene.input.keyboard?.resetKeys();
  };
  sample(player: Point): Intent {
    const down = (...keys: string[]): number => Number(keys.some((k) => this.keys[k]?.isDown));
    const pointer = this.scene.input.activePointer;
    pointer.updateWorldPoint(this.scene.cameras.main);
    return {
      moveX: down('D', 'RIGHT') - down('A', 'LEFT'),
      moveY: down('S', 'DOWN') - down('W', 'UP'),
      aim: Math.atan2(pointer.worldY - player.y, pointer.worldX - player.x),
      fire: this.firing || this.pressedFire,
      special: this.special || this.pressedSpecial,
      cancelFire: this.cancelFire,
    };
  }
  dispose(): void {
    this.scene.input.keyboard?.off('keydown-R', this.drink);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.visibility);
    this.scene.input.off('pointerdown', this.down);
    this.scene.input.off('pointerup', this.up);
    this.scene.input.off('gameout', this.clear);
  }
}
