/** Required elements are declared in index.html; fail early if markup drifts. */
export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing UI element: ${id}`);
  }
  return node as T;
}
