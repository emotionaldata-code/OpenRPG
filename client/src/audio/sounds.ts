/** Original synth recipes: frequencies in Hz, times in seconds, volume 0–1. */
export interface Tone {
  wave: OscillatorType | 'noise';
  hz: number;
  end?: number;
  duration: number;
  volume: number;
  delay?: number;
  attack?: number;
}
const tone = (
  wave: Tone['wave'],
  hz: number,
  end: number,
  duration: number,
  volume = 0.15,
  delay = 0,
): Tone => ({ wave, hz, end, duration, volume, delay });
const chime = (notes: number[]): Tone[] =>
  notes.map((hz, i) => tone('sine', hz, hz, 0.24, 0.12, i * 0.085));
export const SOUNDS = {
  click: [tone('triangle', 620, 420, 0.055, 0.1)],
  important: chime([294, 440, 587]),
  'archer-shot': [
    tone('triangle', 720, 150, 0.12, 0.17),
    tone('noise', 5200, 800, 0.2, 0.12),
    tone('sine', 180, 70, 0.12, 0.12),
  ],
  'mage-shot': [
    tone('sine', 100, 55, 0.32, 0.2),
    tone('triangle', 260, 740, 0.18, 0.12),
    tone('noise', 2200, 300, 0.38, 0.18, 0.04),
  ],
  'warrior-shot': [
    tone('noise', 3600, 300, 0.22, 0.2),
    tone('triangle', 780, 190, 0.12, 0.12),
    tone('sine', 130, 45, 0.2, 0.18, 0.04),
  ],
  'archer-special': [tone('noise', 4000, 600, 0.45, 0.22), ...chime([440, 659, 880])],
  'mage-special': [
    tone('sawtooth', 80, 260, 0.42, 0.09),
    tone('noise', 400, 2600, 0.65, 0.28),
    tone('sine', 140, 45, 0.6, 0.2, 0.12),
  ],
  'warrior-special': [tone('triangle', 110, 110, 0.7, 0.12), ...chime([220, 330, 440, 660])],
  dash: [tone('noise', 2400, 500, 0.16, 0.12)],
  stun: [
    tone('sine', 140, 55, 0.2, 0.2),
    tone('triangle', 740, 370, 0.35, 0.1, 0.03),
    tone('sine', 1120, 560, 0.45, 0.07, 0.07),
  ],
  'bad-shot': [tone('triangle', 180, 70, 0.16, 0.13), tone('noise', 500, 160, 0.08, 0.07)],
  perfect: [
    tone('sine', 110, 55, 0.25, 0.2),
    tone('noise', 4800, 1000, 0.16, 0.1),
    ...chime([784, 1175, 1568]),
  ],
  hurt: [tone('triangle', 170, 65, 0.19, 0.25), tone('noise', 600, 180, 0.12, 0.2)],
  'mob-hurt': [tone('noise', 950, 250, 0.09, 0.18), tone('sine', 180, 80, 0.1, 0.16)],
  'mob-death': [tone('triangle', 230, 45, 0.3, 0.17), tone('noise', 750, 120, 0.25, 0.12)],
  'enemy-melee': [tone('noise', 1000, 250, 0.2, 0.14)],
  'enemy-ranged': [tone('sine', 540, 180, 0.22, 0.12)],
  'enemy-boss': [tone('triangle', 95, 45, 0.45, 0.19), tone('noise', 1200, 180, 0.4, 0.16)],
  loot: chime([659, 880, 1319]),
  potion: [tone('sine', 260, 780, 0.3, 0.14), ...chime([523, 784])],
  death: [tone('triangle', 220, 55, 0.7, 0.16), tone('sine', 165, 41, 0.85, 0.14)],
  respawn: chime([294, 392, 587, 784]),
  victory: chime([392, 494, 587, 784]),
  defeat: chime([294, 262, 220, 147]),
} satisfies Record<string, Tone[]>;
export type Sound = keyof typeof SOUNDS;
