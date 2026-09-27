import { CHARACTER_CLASSES, type CharacterClass } from '@openrpg/shared';
import { actorCanvas } from '../../art/art';

// Temporary village choice, fixed on expedition entry; no account preference is saved.
export class ClassSelection {
  selected: CharacterClass = 'archer';
  constructor(changed: (kind: CharacterClass) => void) {
    for (const kind of CHARACTER_CLASSES) {
      const canvas = document.getElementById(`preview-${kind}`) as HTMLCanvasElement;
      canvas.width = 24;
      canvas.height = 28;
      canvas.getContext('2d')!.drawImage(actorCanvas(kind, 1, 0), 0, 0);
      document.getElementById(`class-${kind}`)!.onclick = () => {
        this.selected = kind;
        changed(kind);
        for (const option of CHARACTER_CLASSES) {
          document
            .getElementById(`class-${option}`)!
            .setAttribute('aria-pressed', String(option === kind));
        }
      };
    }
  }
}
