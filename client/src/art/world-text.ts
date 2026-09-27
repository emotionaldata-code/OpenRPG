import Phaser from 'phaser';

/** Supersample labels independently, keeping terrain and sprites pixel-sharp. */
export function worldText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const label = scene.add.text(x, y, text, { ...style, resolution: 3 });
  label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return label;
}
