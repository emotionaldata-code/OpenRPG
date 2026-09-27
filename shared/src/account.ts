export const CHARACTER_CLASSES = ['archer', 'mage', 'warrior'] as const;
export type CharacterClass = typeof CHARACTER_CLASSES[number];
export interface AccountProfile { id: string; username: string }
export function parseClass(value: unknown): CharacterClass {
  if (!CHARACTER_CLASSES.includes(value as CharacterClass)) throw new Error('Choose Archer, Mage, or Warrior.');
  return value as CharacterClass;
}
export function parseUsername(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{3,18}$/.test(value.trim())) throw new Error('Use 3–18 letters, numbers, underscores, or dashes for your username.');
  return value.trim();
}
