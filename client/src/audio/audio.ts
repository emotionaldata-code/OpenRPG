import { CHARGE, type CharacterClass } from '@openrpg/shared';
import { SOUNDS, type Sound, type Tone } from './sounds';
import { MUSIC, musicStep, type Music } from './music';
import { Synth, type Voice } from './synth';
const preference = 'openrpg.audio';

/** Browser-owned audio. No network messages, asset requests or queued combat sounds. */
export class GameAudio {
  private synth?: Synth;
  private enabled = true;
  private mode: Music = 'menu';
  private timer?: number;
  private step = 0;
  private nextStep = 0;
  private recent = new Map<Sound, number>();
  private musicVoices: Voice[] = [];
  private charging?: Voice;
  private sweet = false;
  private active = true;
  private unsupported = typeof window.AudioContext !== 'function';
  constructor() {
    try {
      this.enabled = localStorage.getItem(preference) !== 'off';
    } catch {
      /* Storage is optional. */
    }
  }
  get isEnabled(): boolean {
    return this.enabled;
  }
  get supported(): boolean {
    return !this.unsupported;
  }
  get audible(): boolean {
    return (
      this.enabled && this.active && !document.hidden && this.synth?.context.state === 'running'
    );
  }
  get diagnostics(): { state: string; voices: number; music: Music; charging: boolean } {
    return {
      state: this.synth?.context.state ?? 'locked',
      voices: this.synth?.activeVoices ?? 0,
      music: this.mode,
      charging: !!this.charging,
    };
  }
  /** Attempt autoplay on mount; retry directly from gestures if the browser blocks it. */
  unlock(): void {
    if (!this.enabled || this.unsupported || document.hidden || !this.active) {
      return;
    }
    try {
      this.synth ??= new Synth(new AudioContext({ latencyHint: 'interactive' }));
      const ctx = this.synth.context;
      if (ctx.state !== 'running') {
        void ctx
          .resume()
          .then(() => this.startMusic())
          .catch(() => {});
      } else {
        this.startMusic();
      }
    } catch {
      this.unsupported = true;
    }
  }
  toggle(): void {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(preference, this.enabled ? 'on' : 'off');
    } catch {
      /* Private browsing may deny storage. */
    }
    if (this.enabled) {
      this.unlock();
    } else {
      this.quiet();
    }
  }
  focus(active: boolean): void {
    this.active = active;
    if (!active) {
      this.quiet();
    } else if (this.synth) {
      this.unlock();
    }
  }
  setMusic(mode: Music): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    window.clearInterval(this.timer);
    this.timer = undefined;
    for (const voice of this.musicVoices) {
      voice.stop();
    }
    this.musicVoices = [];
    this.stopCharge();
    this.startMusic();
  }
  play(sound: Sound, volume = 1): void {
    if (!this.audible || volume < 0.01) {
      return;
    }
    const now = this.synth!.context.currentTime;
    if (now - (this.recent.get(sound) ?? -10) < 0.065) {
      return;
    }
    this.recent.set(sound, now);
    for (const tone of SOUNDS[sound]) {
      this.synth!.tone(tone, volume);
    }
  }
  charge(progress: number | null, kind: CharacterClass): void {
    if (!this.audible || progress === null) {
      this.stopCharge();
      return;
    }
    const hz =
      { archer: 180, mage: 130, warrior: 95 }[kind] * (1 + Math.min(progress, CHARGE.sweetEnd) * 2);
    this.charging ??= this.synth!.tone(
      { wave: 'sine', hz, duration: 3600, volume: 0.055 },
      1,
      undefined,
      true,
    );
    this.charging?.pitch(hz);
    if (!this.sweet && progress >= CHARGE.sweetStart && progress <= CHARGE.sweetEnd) {
      this.play('sweet');
      this.sweet = true;
    }
    if (progress > CHARGE.sweetEnd) {
      this.charging?.pitch(hz * 0.7);
    }
  }
  stopCharge(): void {
    this.charging?.stop();
    this.charging = undefined;
    this.sweet = false;
  }
  private startMusic(): void {
    if (!this.audible || this.timer !== undefined) {
      return;
    }
    this.nextStep = this.synth!.context.currentTime + 0.05;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 100);
    this.schedule();
  }
  private schedule(): void {
    if (!this.audible) {
      return;
    }
    const synth = this.synth!,
      now = synth.context.currentTime,
      music = MUSIC[this.mode];
    if (this.nextStep < now) {
      this.nextStep = now + 0.02;
    } // Never catch up missed background music.
    while (this.nextStep < now + 0.2) {
      for (const tone of musicStep(this.mode, this.step)) {
        this.musicNote(tone, this.nextStep);
      }
      this.step++;
      this.nextStep += music.step;
    }
  }
  private musicNote(tone: Tone, when: number): void {
    const voice = this.synth!.tone(tone, 1, when);
    if (voice) {
      this.musicVoices.push(voice);
    }
    if (this.musicVoices.length > 24) {
      this.musicVoices.shift()?.stop();
    }
  }
  private quiet(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.stopCharge();
    this.synth?.stop();
    this.musicVoices = [];
    this.recent.clear();
    // Let the brief release envelope finish before suspending the context.
    const ctx = this.synth?.context;
    if (ctx) {
      window.setTimeout(() => {
        if (!this.enabled || !this.active || document.hidden) {
          void ctx.suspend().catch(() => {});
        }
      }, 50);
    }
  }
  dispose(): void {
    this.active = false;
    this.quiet();
    void this.synth?.context.close().catch(() => {});
  }
}
export const audio = new GameAudio();
