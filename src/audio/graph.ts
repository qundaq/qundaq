import { Automation } from './automation';
import type { SleepStep } from './timer';

// The parts of the Web Audio API the engine uses, so tests can hand it a fake. The browser's own
// AudioContext fits these shapes (src/ui/sounds/useSoundEngine.ts passes it in without a cast).
export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(value: number, time: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
  /** Missing in some browsers (Firefox); the engine then holds the value it computes itself. */
  cancelAndHoldAtTime?(time: number): unknown;
}

export interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect(): void;
}

export interface GainLike extends NodeLike {
  readonly gain: ParamLike;
}

export interface ScheduledSourceLike extends NodeLike {
  onended: ((event: Event) => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends ScheduledSourceLike {
  buffer: BufferLike | null;
  loop: boolean;
}

export interface ConstantSourceLike extends ScheduledSourceLike {
  readonly offset: ParamLike;
}

export interface CompressorLike extends NodeLike {
  readonly threshold: ParamLike;
  readonly knee: ParamLike;
  readonly ratio: ParamLike;
  readonly attack: ParamLike;
  readonly release: ParamLike;
}

export interface ContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  /** 'suspended' | 'running' | 'closed', and 'interrupted' in Safari (compared as a string). */
  readonly state: string;
  readonly destination: NodeLike;
  onstatechange: ((event: Event) => void) | null;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  createGain(): GainLike;
  createBufferSource(): BufferSourceLike;
  createConstantSource(): ConstantSourceLike;
  createDynamicsCompressor(): CompressorLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
}

/** An AudioParam together with the record of what the engine scheduled on it. */
export class Param {
  private readonly shadow: Automation;

  constructor(
    private readonly real: ParamLike,
    initial: number,
  ) {
    real.value = initial;
    this.shadow = new Automation(initial);
  }

  /**
   * Freezes the value at `time` and returns it: every change starts from where the sound is, never from a
   * stale schedule. `cancelAndHoldAtTime` alone is not enough: per the W3C algorithm, when nothing is
   * scheduled after `time` and the event before it is already a plain set or a finished ramp, the browser
   * inserts nothing (the curve was already flat), so a later `linearRampToValueAtTime` would ramp from that
   * old event instead of from `time` — an audible jump. `setValueAtTime` is always called too, unconditionally,
   * to anchor the real curve at `time` regardless of what the browser did or did not insert.
   */
  hold(time: number): number {
    const value = this.shadow.valueAt(time);
    if (typeof this.real.cancelAndHoldAtTime === 'function') this.real.cancelAndHoldAtTime(time);
    else this.real.cancelScheduledValues(time);
    this.real.setValueAtTime(value, time);
    this.shadow.cancelAndHoldAtTime(time);
    return value;
  }

  set(value: number, time: number): void {
    this.real.setValueAtTime(value, time);
    this.shadow.setValueAtTime(value, time);
  }

  ramp(value: number, time: number): void {
    this.real.linearRampToValueAtTime(value, time);
    this.shadow.linearRampToValueAtTime(value, time);
  }

  approach(value: number, time: number, timeConstant: number): void {
    this.real.setTargetAtTime(value, time, timeConstant);
    this.shadow.setTargetAtTime(value, time, timeConstant);
  }

  steps(steps: readonly SleepStep[]): void {
    for (const step of steps) {
      if (step.kind === 'set') this.set(step.value, step.time);
      else this.ramp(step.value, step.time);
    }
  }
}
