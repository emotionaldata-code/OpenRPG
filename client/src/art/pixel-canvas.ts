export function canvas(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const ctx = element.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  return element;
}
export function rect(
  c: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), width, height);
}
