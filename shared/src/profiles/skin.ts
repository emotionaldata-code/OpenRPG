import { parseClass, type CharacterClass } from './account.js';

export const SKIN = {
  width: 24,
  height: 28,
  directions: 4,
  framesPerDirection: 3,
  version: 1,
  maxColors: 64,
  maxSaved: 32,
} as const;
export interface SkinDraft {
  name: string;
  characterClass: CharacterClass;
  templateVersion: number;
  palette: string[]; // Index 0 is transparent; other entries are opaque RGB colors.
  frames: number[][]; // Direction order: right, down, left, up. Three frames each.
}
export interface SkinSummary {
  id: string;
  name: string;
  characterClass: CharacterClass;
  templateVersion: number;
}
export interface Skin extends SkinDraft {
  id: string;
}
export function parseSkinId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error('Invalid skin ID.');
  }
  return value.toLowerCase();
}
export function parseSkin(value: unknown): SkinDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a skin.');
  }
  const raw = value as Record<string, unknown>;
  const characterClass = parseClass(raw.characterClass);
  if (
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    raw.name.trim().length > 32 ||
    // Skin names reject invisible control characters intentionally.
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f]/.test(raw.name)
  ) {
    throw new Error('Give your skin a name of 1–32 characters.');
  }
  if (raw.templateVersion !== SKIN.version) {
    throw new Error('Unsupported skin template.');
  }
  if (
    !Array.isArray(raw.palette) ||
    raw.palette.length < 2 ||
    raw.palette.length > SKIN.maxColors ||
    raw.palette[0] !== 'transparent' ||
    !raw.palette.slice(1).every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
  ) {
    throw new Error('Use up to 63 colors plus transparency.');
  }
  const palette = raw.palette.map((color: string) => color.toLowerCase());
  if (
    !Array.isArray(raw.frames) ||
    raw.frames.length !== SKIN.directions * SKIN.framesPerDirection
  ) {
    throw new Error('A skin needs all 12 animation frames.');
  }
  const frames = raw.frames.map((frame: unknown) => {
    if (
      !Array.isArray(frame) ||
      frame.length !== SKIN.width * SKIN.height ||
      !frame.every((p) => Number.isInteger(p) && p >= 0 && p < palette.length)
    ) {
      throw new Error('Invalid frame pixels.');
    }
    if (!frame.some((p) => p !== 0)) {
      throw new Error('Each animation frame needs visible pixels.');
    }
    return [...frame] as number[];
  });
  return { name: raw.name.trim(), characterClass, templateVersion: SKIN.version, palette, frames };
}
