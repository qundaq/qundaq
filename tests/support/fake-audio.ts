import { vi } from 'vitest';
import { Automation, type AutomationEvent } from '../../src/audio/automation';
import type {
  BufferLike,
  BufferSourceLike,
  CompressorLike,
  ConstantSourceLike,
  ContextLike,
  EngineDeps,
  GainLike,
  NodeLike,
  ParamLike,
} from '../../src/audio/engine';
import type { SoundId } from '../../src/domain/sounds';

/**
 * A fake of the parts of the Web Audio API the engine uses (src/audio/engine.ts declares them). Every
 * AudioParam keeps an Automation of what was scheduled on it, so a test can ask what value a gain has at
 * any audio-clock time, and every node records its connections and its start/stop calls. The clock only
 * advances through FakeDeps.advance, and only while the context is running, as a real one does.
 */
export class FakeParam implements ParamLike {
  automation = new Automation(0);
  /** Every scheduling call, in order, for assertions on how a value was reached. */
  readonly calls: string[] = [];
  cancelAndHoldAtTime?: (time: number) => unknown;

  /** `now`: the owning context's `currentTime`, so `.value` reads the schedule at "now", as a real AudioParam does. */
  constructor(
    private readonly now: () => number = () => 0,
    holdSupported = true,
  ) {
    if (holdSupported) {
      this.cancelAndHoldAtTime = (time: number) => {
        this.calls.push(`hold@${time}`);
        this.w3cCancelAndHold(time);
      };
    }
  }

  /**
   * The real algorithm (W3C §1.6.9), not `Automation.cancelAndHoldAtTime`'s always-insert model: an
   * in-progress ramp or `setTargetAtTime` approach is truncated to the value it has reached, but when
   * nothing is scheduled after `time` and the event at or before it is already a plain set or a ramp that
   * had already finished, the curve was already flat, and the browser inserts nothing at all. Calling
   * `linearRampToValueAtTime` after that ramps from that old event, not from `time` — the transient a
   * caller must guard against by also calling `setValueAtTime` itself (src/audio/engine.ts `Param.hold`).
   * Step 5 of the algorithm — dropping everything scheduled after `time` — happens either way: only
   * inserting the compensating value is conditional, never removing the stale future automation.
   */
  private w3cCancelAndHold(time: number): void {
    const events = this.automation.events;
    const nextIndex = events.findIndex((event) => event.time > time);
    const next = nextIndex === -1 ? undefined : events[nextIndex];
    const before = nextIndex === -1 ? events : events.slice(0, nextIndex);
    const last = before.length > 0 ? before[before.length - 1] : undefined;
    // A ramp in progress (its target is still ahead), or an exponential approach with nothing to end it.
    const truncate = next?.type === 'linear' || last?.type === 'target';
    const held = truncate ? this.automation.valueAt(time) : 0;
    // W3C only drops events strictly after `time`; one scheduled exactly at `time` is kept. Automation's own
    // cancelScheduledValues(time) drops that boundary event too (its own documented simplification), so it
    // is collected here first and replayed afterwards.
    const atTime = events.filter((event) => event.time === time);
    this.automation.cancelScheduledValues(time);
    for (const event of atTime) this.replay(event);
    if (truncate) this.automation.setValueAtTime(held, time);
  }

  private replay(event: AutomationEvent): void {
    if (event.type === 'set') this.automation.setValueAtTime(event.value, event.time);
    else if (event.type === 'linear') this.automation.linearRampToValueAtTime(event.value, event.time);
    else this.automation.setTargetAtTime(event.value, event.time, event.timeConstant);
  }

  /** The value of the schedule right now, exactly as reading a real AudioParam's `.value` would. */
  get value(): number {
    return this.automation.valueAt(this.now());
  }

  /** Setting `.value` before anything is scheduled sets the starting point of the automation. */
  set value(next: number) {
    if (this.automation.events.length === 0) this.automation = new Automation(next);
  }

  setValueAtTime(value: number, time: number): void {
    this.calls.push(`set ${value}@${time}`);
    this.automation.setValueAtTime(value, time);
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.calls.push(`linear ${value}@${time}`);
    this.automation.linearRampToValueAtTime(value, time);
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    this.calls.push(`target ${value}@${time}`);
    this.automation.setTargetAtTime(value, time, timeConstant);
  }

  cancelScheduledValues(time: number): void {
    this.calls.push(`cancel@${time}`);
    this.automation.cancelScheduledValues(time);
  }

  valueAt(time: number): number {
    return this.automation.valueAt(time);
  }
}

export class FakeNode implements NodeLike {
  readonly outputs: FakeNode[] = [];
  disconnected = false;

  constructor(readonly kind: string) {}

  connect(destination: NodeLike): void {
    this.outputs.push(destination as FakeNode);
  }

  disconnect(): void {
    this.disconnected = true;
    this.outputs.length = 0;
  }
}

export class FakeGain extends FakeNode implements GainLike {
  readonly gain: FakeParam;

  constructor(holdSupported: boolean, now: () => number) {
    super('gain');
    this.gain = new FakeParam(now, holdSupported);
  }
}

export class FakeBufferSource extends FakeNode implements BufferSourceLike {
  buffer: BufferLike | null = null;
  loop = false;
  onended: ((event: Event) => void) | null = null;
  readonly starts: (number | undefined)[] = [];
  readonly stops: (number | undefined)[] = [];

  constructor() {
    super('source');
  }

  start(when?: number): void {
    this.starts.push(when);
  }

  stop(when?: number): void {
    this.stops.push(when);
  }
}

export class FakeConstantSource extends FakeNode implements ConstantSourceLike {
  readonly offset: FakeParam;
  onended: ((event: Event) => void) | null = null;
  readonly starts: (number | undefined)[] = [];
  readonly stops: (number | undefined)[] = [];

  constructor(holdSupported: boolean, now: () => number) {
    super('constant');
    this.offset = new FakeParam(now, holdSupported);
  }

  start(when?: number): void {
    this.starts.push(when);
  }

  stop(when?: number): void {
    this.stops.push(when);
  }

  /** What the browser does when the scheduled stop time passes. */
  fireEnded(): void {
    this.onended?.(new Event('ended'));
  }
}

export class FakeCompressor extends FakeNode implements CompressorLike {
  readonly threshold: FakeParam;
  readonly knee: FakeParam;
  readonly ratio: FakeParam;
  readonly attack: FakeParam;
  readonly release: FakeParam;

  constructor(now: () => number) {
    super('compressor');
    this.threshold = new FakeParam(now);
    this.knee = new FakeParam(now);
    this.ratio = new FakeParam(now);
    this.attack = new FakeParam(now);
    this.release = new FakeParam(now);
  }
}

export interface FakeContextOptions {
  sampleRate?: number;
  /** false: the params have no cancelAndHoldAtTime (Firefox), so the engine holds values itself. */
  holdSupported?: boolean;
}

export class FakeContext implements ContextLike {
  currentTime = 0;
  readonly sampleRate: number;
  state = 'suspended';
  readonly destination = new FakeNode('destination');
  onstatechange: ((event: Event) => void) | null = null;
  readonly holdSupported: boolean;
  /** resume/suspend calls, in order. */
  readonly calls: string[] = [];
  readonly gains: FakeGain[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly sentinels: FakeConstantSource[] = [];
  readonly compressors: FakeCompressor[] = [];
  readonly buffers: { length: number; sampleRate: number }[] = [];

  constructor(options: FakeContextOptions = {}) {
    this.sampleRate = options.sampleRate ?? 48_000;
    this.holdSupported = options.holdSupported ?? true;
  }

  /** The five gains the engine builds first, in order: layer bus, master, transport, sleep, cap. */
  get graph(): { bus: FakeGain; master: FakeGain; transport: FakeGain; sleep: FakeGain; cap: FakeGain } {
    const [bus, master, transport, sleep, cap] = this.gains;
    if (!bus || !master || !transport || !sleep || !cap) throw new Error('The engine has not built its graph');
    return { bus, master, transport, sleep, cap };
  }

  /** The gain of the running layer's source, or null once the source is gone. */
  voiceGain(source: FakeBufferSource): FakeGain | null {
    const node = source.outputs[0];
    return node instanceof FakeGain ? node : null;
  }

  private setState(state: string): void {
    if (this.state === state) return;
    this.state = state;
    // The browser fires statechange from its own task, never inside resume() or suspend().
    queueMicrotask(() => this.onstatechange?.(new Event('statechange')));
  }

  resume(): Promise<void> {
    this.calls.push('resume');
    if (this.state !== 'closed') this.setState('running');
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.calls.push('suspend');
    if (this.state !== 'closed') this.setState('suspended');
    return Promise.resolve();
  }

  /** The system took the output away (a call, an alarm): Safari's 'interrupted' state. */
  interrupt(): void {
    this.setState('interrupted');
  }

  /** The system gives the output back on its own (the call ended while the app stayed in front). */
  endInterruption(): void {
    this.setState('running');
  }

  createGain(): FakeGain {
    const node = new FakeGain(this.holdSupported, () => this.currentTime);
    this.gains.push(node);
    return node;
  }

  createBufferSource(): FakeBufferSource {
    const node = new FakeBufferSource();
    this.sources.push(node);
    return node;
  }

  createConstantSource(): FakeConstantSource {
    const node = new FakeConstantSource(this.holdSupported, () => this.currentTime);
    this.sentinels.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeCompressor {
    const node = new FakeCompressor(() => this.currentTime);
    this.compressors.push(node);
    return node;
  }

  createBuffer(_channels: number, length: number, sampleRate: number): BufferLike {
    this.buffers.push({ length, sampleRate });
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

interface Timer {
  id: number;
  at: number;
  callback: () => void;
}

/** The wall clock the fakes start at (epoch ms). */
export const WALL_START = 1_790_000_000_000;

/**
 * Engine dependencies over a fake context, a fake wall clock and fake timers. `advance` moves the wall
 * clock, the audio clock (only while the context runs) and fires the timers that fall due, in order.
 */
export class FakeDeps implements EngineDeps {
  wall = WALL_START;
  readonly context: FakeContext;
  private timers: Timer[] = [];
  private nextTimer = 1;
  readonly createContext = vi.fn((): FakeContext => this.context);
  readonly generate = vi.fn((_soundId: SoundId, sampleRate: number): Float32Array => new Float32Array(sampleRate));
  readonly prepareSession = vi.fn();

  constructor(options: FakeContextOptions = {}) {
    this.context = new FakeContext(options);
  }

  now = (): number => this.wall;

  setTimeout = (callback: () => void, ms: number): number => {
    const id = this.nextTimer++;
    this.timers.push({ id, at: this.wall + Math.max(0, ms), callback });
    return id;
  };

  clearTimeout = (id: number): void => {
    this.timers = this.timers.filter((timer) => timer.id !== id);
  };

  /** Pending timers' due times, relative to now, in ms. */
  get pendingTimers(): number[] {
    return this.timers.map((timer) => timer.at - this.wall).sort((a, b) => a - b);
  }

  advance(ms: number): void {
    const target = this.wall + ms;
    for (;;) {
      const due = this.timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.moveTo(due.at);
      this.timers = this.timers.filter((timer) => timer.id !== due.id);
      due.callback();
    }
    this.moveTo(target);
  }

  private moveTo(wall: number): void {
    const elapsed = wall - this.wall;
    if (elapsed <= 0) return;
    if (this.context.state === 'running') this.context.currentTime += elapsed / 1000;
    this.wall = wall;
  }
}

/** Lets the fake context's queued statechange events run. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
