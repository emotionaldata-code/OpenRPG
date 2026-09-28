import { BIOME_IDS, type BiomeId } from '@openrpg/shared';
import type { Tone } from './sounds.js';

type BaseMusic = 'menu' | 'adventure' | 'boss';
export type Music = BaseMusic | `${BiomeId}-${'adventure' | 'boss'}`;
interface Bar {
  chord: readonly [number, number, number];
  melody: readonly number[];
}
interface Score {
  step: number;
  bars: readonly Bar[];
}
// Original looping scores. MIDI pitches; 0 leaves space between melody notes.
const G = [55, 59, 62] as const,
  Em = [52, 55, 59] as const;
const C = [48, 52, 55] as const,
  D = [50, 54, 57] as const;
const Dm = [50, 53, 57] as const,
  Bb = [46, 50, 53] as const;
const F = [53, 57, 60] as const,
  A = [45, 49, 52] as const;
const BASE_MUSIC: Record<BaseMusic, Score> = {
  // Gentle 6/8, G major: a flute melody over rolling, lute-like plucks.
  menu: {
    step: 0.36,
    bars: [
      { chord: G, melody: [67, 0, 71, 74, 0, 71] },
      { chord: Em, melody: [76, 0, 74, 71, 0, 0] },
      { chord: C, melody: [72, 0, 71, 69, 0, 67] },
      { chord: D, melody: [69, 0, 0, 66, 0, 0] },
      { chord: G, melody: [67, 0, 71, 74, 0, 76] },
      { chord: Em, melody: [79, 0, 76, 74, 0, 71] },
      { chord: C, melody: [72, 0, 69, 67, 0, 69] },
      { chord: D, melody: [74, 0, 0, 0, 0, 0] },
      { chord: Em, melody: [71, 0, 74, 76, 0, 74] },
      { chord: C, melody: [72, 0, 71, 67, 0, 0] },
      { chord: G, melody: [71, 0, 69, 67, 0, 62] },
      { chord: D, melody: [66, 0, 69, 74, 0, 0] },
      { chord: C, melody: [76, 0, 74, 72, 0, 71] },
      { chord: D, melody: [69, 0, 66, 62, 0, 66] },
      { chord: G, melody: [67, 0, 71, 74, 0, 71] },
      { chord: G, melody: [67, 0, 0, 0, 0, 0] },
    ],
  },
  // Driving 4/4, D minor: lower strings, an answering melody and soft frame drums.
  adventure: {
    step: 0.25,
    bars: [
      { chord: Dm, melody: [62, 0, 69, 0, 65, 67, 69, 0] },
      { chord: Bb, melody: [70, 0, 69, 65, 62, 0, 0, 0] },
      { chord: F, melody: [65, 0, 72, 0, 69, 67, 65, 0] },
      { chord: A, melody: [64, 0, 61, 0, 57, 0, 61, 0] },
      { chord: Dm, melody: [62, 0, 65, 69, 74, 0, 72, 69] },
      { chord: Bb, melody: [70, 0, 69, 0, 65, 0, 62, 0] },
      { chord: A, melody: [64, 0, 67, 0, 69, 0, 61, 0] },
      { chord: Dm, melody: [62, 0, 0, 0, 0, 0, 0, 0] },
      { chord: Bb, melody: [65, 0, 70, 0, 74, 72, 70, 0] },
      { chord: F, melody: [69, 0, 65, 0, 60, 0, 65, 0] },
      { chord: C, melody: [67, 0, 72, 0, 76, 74, 72, 0] },
      { chord: A, melody: [73, 0, 69, 0, 64, 0, 61, 0] },
      { chord: Bb, melody: [62, 0, 65, 0, 70, 69, 65, 0] },
      { chord: A, melody: [64, 0, 61, 0, 57, 0, 61, 0] },
      { chord: Dm, melody: [62, 0, 65, 69, 74, 0, 69, 65] },
      { chord: Dm, melody: [62, 0, 0, 0, 0, 0, 0, 0] },
    ],
  },
  // Faster D-minor battle march: low ostinato, rising calls and heavier frame drums.
  boss: {
    step: 0.19,
    bars: [
      { chord: Dm, melody: [62, 69, 62, 65, 74, 0, 72, 69] },
      { chord: Bb, melody: [70, 65, 70, 74, 77, 0, 74, 70] },
      { chord: Dm, melody: [74, 69, 65, 69, 72, 69, 65, 62] },
      { chord: A, melody: [61, 64, 69, 73, 76, 0, 73, 69] },
      { chord: Bb, melody: [74, 0, 77, 74, 70, 65, 70, 74] },
      { chord: C, melody: [76, 72, 67, 72, 79, 0, 76, 72] },
      { chord: A, melody: [73, 69, 64, 61, 64, 69, 73, 76] },
      { chord: Dm, melody: [74, 0, 69, 65, 62, 0, 0, 0] },
    ],
  },
};

// Separate melodies and harmony for each biome; boss calls answer their travel motif.
const motifs: Record<
  BiomeId,
  { root: number; step: number; travel: readonly number[]; battle: readonly number[] }
> = {
  desert: {
    root: 50,
    step: 0.29,
    travel: [0, 1, 5, 4, 7, 8, 7, 4],
    battle: [0, 7, 1, 8, 5, 4, 1, 0],
  },
  forest: {
    root: 55,
    step: 0.32,
    travel: [0, 3, 7, 10, 7, 5, 3, 0],
    battle: [0, 7, 10, 12, 10, 7, 3, 5],
  },
  castle: {
    root: 45,
    step: 0.26,
    travel: [0, 0, 7, 3, 2, 0, -1, 0],
    battle: [0, 3, 7, 0, 8, 7, 3, -1],
  },
  mountain: {
    root: 52,
    step: 0.34,
    travel: [0, 7, 12, 0, 10, 7, 5, 0],
    battle: [0, 0, 7, 12, 10, 7, 0, 5],
  },
  paradise: {
    root: 60,
    step: 0.31,
    travel: [0, 4, 7, 11, 12, 7, 4, 2],
    battle: [12, 11, 7, 6, 3, 6, 7, 0],
  },
  hell: {
    root: 43,
    step: 0.23,
    travel: [0, 1, 6, 0, 3, 1, -1, 0],
    battle: [0, 6, 1, 7, 3, 6, 1, -1],
  },
};
function biomeScore(biome: BiomeId, boss: boolean): Score {
  const m = motifs[biome],
    motif = boss ? m.battle : m.travel;
  return {
    step: m.step * (boss ? 0.7 : 1),
    bars: [0, -2, 3, -1].map((shift) => ({
      chord: [m.root + shift, m.root + shift + 3, m.root + shift + 7],
      melody: motif.map((n, i) => (!boss && i % 3 === 1 ? 0 : m.root + 12 + n + shift)),
    })),
  };
}
export const MUSIC: Record<Music, Score> = {
  ...BASE_MUSIC,
  ...Object.fromEntries(
    BIOME_IDS.flatMap((biome) => [
      [`${biome}-adventure`, biomeScore(biome, false)],
      [`${biome}-boss`, biomeScore(biome, true)],
    ]),
  ),
} as Record<Music, Score>;

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const note = (
  wave: OscillatorType,
  midi: number,
  duration: number,
  volume: number,
  attack = 0.008,
): Tone => ({ wave, hz: hz(midi), duration, volume, attack });

/** One eighth-note step; pure score-to-tone mapping, shared by playback and offline previews. */
export function musicStep(mode: Music, step: number): Tone[] {
  const score = MUSIC[mode],
    beats = score.bars[0]!.melody.length;
  const bar = score.bars[Math.floor(step / beats) % score.bars.length]!,
    beat = step % beats;
  const boss = mode === 'boss' || mode.endsWith('-boss');
  const menu = mode === 'menu',
    tones: Tone[] = [],
    melody = bar.melody[beat]!;
  if (melody) {
    const next = bar.melody.findIndex((pitch, i) => i > beat && pitch !== 0);
    const length = ((next < 0 ? beats : next) - beat) * score.step;
    tones.push(
      note(
        menu ? 'sine' : 'triangle',
        melody,
        length * 0.95,
        menu ? 0.075 : 0.045,
        menu ? 0.065 : 0.025,
      ),
    );
  }
  const pattern = menu ? [0, 1, 2, 1, 2, 1] : [0, 2, 1, 2, 0, 2, 1, 2];
  tones.push(
    note(
      'triangle',
      bar.chord[pattern[beat]!]! + (menu ? 12 : 0),
      menu ? 0.55 : 0.3,
      menu ? 0.022 : boss ? 0.032 : 0.025,
    ),
  );
  if (beat % (menu ? 3 : 4) === 0) {
    tones.push(note('sine', bar.chord[0] - 12, menu ? 1.1 : 0.7, 0.07, 0.025));
  }
  if (!menu && beat % (boss ? 2 : 4) === 0) {
    tones.push({ wave: 'sine', hz: 110, end: 45, duration: 0.18, volume: boss ? 0.1 : 0.075 });
  }
  if (!menu && beat % 4 === 2) {
    tones.push({ wave: 'noise', hz: 1300, end: 450, duration: 0.075, volume: 0.023 });
  }
  return tones;
}
