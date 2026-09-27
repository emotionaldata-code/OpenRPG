import type { Tone } from './sounds';
export interface Voice {
  pitch(hz: number): void;
  stop(): void;
}

/** One bounded voice pool, shared noise buffer and output compressor. */
export class Synth {
  private voices = new Set<Voice>();
  private noise: AudioBuffer;
  private output: GainNode;
  constructor(readonly context: AudioContext) {
    this.noise = context.createBuffer(1, context.sampleRate / 2, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.output = context.createGain();
    this.output.gain.value = 0.45;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    this.output.connect(limiter);
    limiter.connect(context.destination);
  }
  get activeVoices(): number {
    return this.voices.size;
  }
  tone(
    recipe: Tone,
    volume = 1,
    when = this.context.currentTime,
    sustain = false,
  ): Voice | undefined {
    if (this.voices.size >= 32 || volume <= 0) {
      return;
    }
    const ctx = this.context,
      start = Math.max(ctx.currentTime, when) + (recipe.delay ?? 0);
    const end = start + recipe.duration,
      gain = ctx.createGain();
    const source = recipe.wave === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
    let filter: BiquadFilterNode | undefined, frequency: AudioParam;
    if (source instanceof AudioBufferSourceNode) {
      source.buffer = this.noise;
      source.loop = true;
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      frequency = filter.frequency;
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.type = recipe.wave as OscillatorType;
      frequency = source.frequency;
      source.connect(gain);
    }
    frequency.setValueAtTime(recipe.hz, start);
    if (recipe.end !== undefined) {
      frequency.exponentialRampToValueAtTime(Math.max(20, recipe.end), end);
    }
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      recipe.volume * volume,
      start + Math.min(recipe.attack ?? 0.008, recipe.duration / 2),
    );
    if (!sustain) {
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    gain.connect(this.output);
    let stopped = false,
      cleanupTimer: number | undefined;
    const cleanup = (): void => {
      window.clearTimeout(cleanupTimer);
      source.disconnect();
      filter?.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    const voice: Voice = {
      pitch: (hz) => frequency.setTargetAtTime(hz, ctx.currentTime, 0.025),
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.008);
        source.stop(ctx.currentTime + 0.04);
        // Suspended contexts may delay `ended`; release nodes on wall time too.
        cleanupTimer = window.setTimeout(cleanup, 50);
      },
    };
    source.onended = cleanup;
    this.voices.add(voice);
    source.start(start);
    source.stop(end + 0.02);
    return voice;
  }
  stop(): void {
    for (const voice of this.voices) {
      voice.stop();
    }
  }
}
