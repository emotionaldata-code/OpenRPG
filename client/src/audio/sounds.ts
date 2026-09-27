/** Original synth recipes: frequencies in Hz, times in seconds, volume 0–1. */
export interface Tone { wave: OscillatorType | 'noise'; hz: number; end?: number; duration: number; volume: number; delay?: number; attack?: number }
const tone = (wave: Tone['wave'], hz: number, end: number, duration: number, volume = .15, delay = 0): Tone => ({ wave, hz, end, duration, volume, delay });
const chime = (notes: number[]): Tone[] => notes.map((hz, i) => tone('sine', hz, hz, .24, .12, i * .085));
export const SOUNDS = {
  click: [tone('triangle', 620, 420, .055, .1)],
  important: chime([294, 440, 587]),
  'archer-shot': [tone('triangle', 380, 120, .1), tone('noise', 3400, 900, .16, .13)],
  'mage-shot': [tone('sine', 160, 520, .22, .2), tone('noise', 700, 2400, .28, .15)],
  'warrior-shot': [tone('noise', 2200, 350, .23, .22), tone('triangle', 680, 160, .13, .11)],
  'archer-special': [tone('noise', 4000, 600, .45, .22), ...chime([440, 659, 880])],
  'mage-special': [tone('sawtooth', 80, 260, .42, .09), tone('noise', 400, 2600, .65, .28), tone('sine', 140, 45, .6, .2, .12)],
  'warrior-special': [tone('triangle', 110, 110, .7, .12), ...chime([220, 330, 440, 660])],
  sweet: chime([880, 1175]),
  hurt: [tone('triangle', 170, 65, .19, .25), tone('noise', 600, 180, .12, .2)],
  'mob-hurt': [tone('noise', 950, 250, .09, .18), tone('sine', 180, 80, .1, .16)],
  'mob-death': [tone('triangle', 230, 45, .3, .17), tone('noise', 750, 120, .25, .12)],
  'enemy-melee': [tone('noise', 1000, 250, .2, .14)],
  'enemy-ranged': [tone('sine', 540, 180, .22, .12)],
  'enemy-boss': [tone('triangle', 95, 45, .45, .19), tone('noise', 1200, 180, .4, .16)],
  loot: chime([659, 880, 1319]),
  potion: [tone('sine', 260, 780, .3, .14), ...chime([523, 784])],
  death: [tone('triangle', 220, 55, .7, .16), tone('sine', 165, 41, .85, .14)],
  respawn: chime([294, 392, 587, 784]),
  victory: chime([392, 494, 587, 784]),
  defeat: chime([294, 262, 220, 147]),
} satisfies Record<string, Tone[]>;
export type Sound = keyof typeof SOUNDS;
