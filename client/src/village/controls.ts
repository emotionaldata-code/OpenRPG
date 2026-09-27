import type { Intent } from '@openrpg/shared';

/** DOM key listeners leave native dialog fields alone and never capture typing. */
export class VillageControls {
  private keys = new Set<string>();
  private aim = Math.PI / 2;
  constructor(
    private blocked: () => boolean,
    private interact: () => void,
  ) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }
  private down = (event: KeyboardEvent): void => {
    if (this.blocked() || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowLeft',
        'ArrowDown',
        'ArrowRight',
        'KeyE',
      ].includes(event.code)
    ) {
      event.preventDefault();
      this.keys.add(event.code);
      if (event.code === 'KeyE' && !event.repeat) {
        this.interact();
      }
    }
  };
  private up = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };
  clear = (): void => {
    this.keys.clear();
  };
  sample(): Intent {
    if (this.blocked()) {
      this.clear();
    }
    const has = (...keys: string[]): number => Number(keys.some((key) => this.keys.has(key)));
    const moveX = has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft');
    const moveY = has('KeyS', 'ArrowDown') - has('KeyW', 'ArrowUp');
    if (moveX || moveY) {
      this.aim = Math.atan2(moveY, moveX);
    }
    return { moveX, moveY, aim: this.aim, fire: false, special: false };
  }
  dispose(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
  }
}
