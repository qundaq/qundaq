import { MAX_LAYERS, isSoundId, type SoundId } from '../domain/sounds';
import { MINUTE } from '../domain/time';
import { Automation } from './automation';
import { DEFAULT_TIMER, isTimerChoice, recoverSteps, sleepSteps, timerEndsAt, type SleepStep, type TimerChoice } from './timer';
import { DEFAULT_CAP, DEFAULT_MASTER, DEFAULT_LEVEL, busScale, capGain, clamp01, clampCap, masterAfterCapChange, sliderGain } from './volume';

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

export interface EngineDeps {
  createContext(): ContextLike;
  /** The samples of a sound's loop at this rate (audio/catalog.ts generateSound). */
  generate(soundId: SoundId, sampleRate: number): Float32Array;
  /** Wall-clock time, epoch ms. */
  now(): number;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  /** Called first in every tap that can start sound: navigator.audioSession.type = 'playback'. */
  prepareSession(): void;
}

export type EngineStatus = 'stopped' | 'playing' | 'paused' | 'interrupted';

export interface EngineLayer {
  readonly soundId: SoundId;
  /** The layer's slider, 0..1. */
  readonly level: number;
}

/** What the Sesler tab and the now-playing bar show. The same object until something changes. */
export interface EngineState {
  readonly status: EngineStatus;
  readonly layers: readonly EngineLayer[];
  /** The master slider, 0..1 of the capped range. */
  readonly master: number;
  /** The selected timer chip (null: ∞). */
  readonly timer: TimerChoice;
  /** Wall-clock end of the running timer (epoch ms), or null when none counts down. */
  readonly endsAt: number | null;
  /** Sounds whose loop is being generated ("Hazırlanıyor…"). */
  readonly preparing: readonly SoundId[];
}

/** What the app remembers between launches (settings.lastSound): the selection, never the playing state. */
export interface SavedSound {
  /** As stored: ids a newer version may have written are skipped, levels are clamped. */
  layers: readonly { soundId: string; level: number }[];
  master: number;
  timer: TimerChoice;
}

export type ToggleResult = 'added' | 'removed' | 'full';

/** Starting playback, resuming and switching mixes fade in over this long (≥ 1.5 s: a sleeping baby is near). */
export const START_FADE_SECONDS = 2;
/** A removed layer fades out over this long, then its source stops. */
export const REMOVE_FADE_SECONDS = 0.3;
/** Pause fades out over this long before the context is suspended. */
export const PAUSE_FADE_SECONDS = 0.3;
/** Any gain rise the engine makes by itself (the bus after a layer goes, the cap) takes at least this long. */
export const RISE_SECONDS = 1.5;
/** Lowering the cap applies over this long. */
export const CAP_LOWER_SECONDS = 0.5;
/** Time constant of a slider move: quick, without a click. */
export const SLIDER_TIME_CONSTANT = 0.05;
/** A loop that has not played for this long is dropped from memory (iOS kills memory-hungry pages in the background). */
export const EVICT_AFTER_MS = 5 * MINUTE;
/**
 * The pause before each loop's generation. Generating runs on the main thread and can block an old phone
 * for a few hundred ms per sound; the gap lets the page paint between loops, so a six-layer mix freezes
 * it six short times, never for seconds in one block.
 */
export const GENERATE_GAP_MS = 30;
/**
 * The limiter before the speaker: catches peaks of several layers that happen to line up. WebKit's and
 * Blink's DynamicsCompressorNode also apply a fixed makeup gain of (1 / gain at full scale)^0.6, about
 * +1.7 dB with these settings, to everything, below the threshold too. It is constant, so nothing gets
 * louder over time; checklist row 35's readings include it. Not compensated here: a later engine may drop it.
 */
export const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;

/** An AudioParam together with the record of what the engine scheduled on it. */
class Param {
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

interface Graph {
  context: ContextLike;
  bus: Param; // 1 / max(1, √Σg²): the layers together never louder than one
  master: Param; // the master slider only
  transport: Param; // play / pause / resume ramps only
  sleep: Param; // the sleep timer only
  cap: Param; // the safety cap only
  sleepNode: GainLike;
  busNode: GainLike;
}

interface Voice {
  source: BufferSourceLike;
  node: GainLike;
  gain: Param;
}

interface CachedLoop {
  buffer: BufferLike;
  /** When the sound last stopped playing (epoch ms); null while it plays. */
  idleSince: number | null;
}

function sameLayers(a: readonly EngineLayer[], b: readonly EngineLayer[]): boolean {
  return a.length === b.length && a.every((layer, i) => layer.soundId === b[i]!.soundId && layer.level === b[i]!.level);
}

/**
 * The sound mixer: one AudioContext, and per layer `source (loop) → layer gain → bus → master → transport
 * → sleep → cap → limiter → speaker`. Every gain node has one job, so the sleep timer, the pause ramps,
 * the sliders and the cap never overwrite each other's automation, and nothing the parent did not ask
 * for ever makes the sound louder.
 */
class Engine {
  private state: EngineState = { status: 'stopped', layers: [], master: DEFAULT_MASTER, timer: DEFAULT_TIMER, endsAt: null, preparing: [] };
  private readonly listeners = new Set<() => void>();
  private graph: Graph | null = null;
  private cap = DEFAULT_CAP;
  private readonly voices = new Map<SoundId, Voice>();
  private readonly loops = new Map<string, CachedLoop>();
  private generating: number | null = null;
  private suspendTimer: number | null = null;
  private wallTimer: number | null = null;
  private evictTimer: number | null = null;
  private sentinel: ConstantSourceLike | null = null;
  /** Bumped whenever the timer is rescheduled or cancelled, so a replaced sentinel's `ended` is ignored. */
  private timerToken = 0;
  /** Audio-clock time before which the bus must not start rising: the end of any voice still fading out. */
  private busRiseNotBefore = 0;

  constructor(private readonly deps: EngineDeps) {}

  getSnapshot = (): EngineState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<EngineState>): void {
    const next = { ...this.state, ...patch };
    const current = this.state;
    const changed =
      next.status !== current.status ||
      next.master !== current.master ||
      next.timer !== current.timer ||
      next.endsAt !== current.endsAt ||
      !sameLayers(next.layers, current.layers) ||
      next.preparing.length !== current.preparing.length ||
      next.preparing.some((id, i) => id !== current.preparing[i]);
    if (!changed) return;
    this.state = next;
    this.markIdle();
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * The last selection, restored at launch. Never starts playback and never creates the context; once the
   * graph exists (a second mount) it changes nothing, since the nodes would not follow.
   */
  restore(saved: SavedSound | undefined, cap: number): void {
    if (this.graph) return;
    this.cap = clampCap(cap);
    if (!saved) return;
    const layers = this.usable(saved.layers);
    const timer = isTimerChoice(saved.timer) ? saved.timer : DEFAULT_TIMER;
    this.update({ layers, master: clamp01(saved.master), timer });
  }

  /** Known, unique sound ids, at most MAX_LAYERS, levels clamped. */
  private usable(layers: readonly { soundId: string; level: number }[]): EngineLayer[] {
    const out: EngineLayer[] = [];
    for (const layer of layers) {
      if (!isSoundId(layer.soundId) || out.some((other) => other.soundId === layer.soundId)) continue;
      if (out.length === MAX_LAYERS) break;
      out.push({ soundId: layer.soundId, level: clamp01(layer.level) });
    }
    return out;
  }

  // ---- The first tap -------------------------------------------------------------------------------

  /**
   * Synchronous, first in every tap that can start sound, before any await: iOS only lets a context start
   * inside the tap. Sets the audio session to 'playback', creates the context if needed, resumes it.
   */
  private unlock(): Graph {
    this.deps.prepareSession();
    const graph = this.ensureGraph();
    this.cancelSuspend();
    this.resumeContext(graph.context);
    return graph;
  }

  private ensureGraph(): Graph {
    if (this.graph) return this.graph;
    const context = this.deps.createContext();
    const gain = (initial: number) => {
      const node = context.createGain();
      return { node, param: new Param(node.gain, initial) };
    };
    const bus = gain(busScale(this.state.layers.map((layer) => layer.level)));
    const master = gain(sliderGain(this.state.master));
    const transport = gain(0);
    const sleep = gain(1);
    const cap = gain(capGain(this.cap));
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = LIMITER.threshold;
    limiter.knee.value = LIMITER.knee;
    limiter.ratio.value = LIMITER.ratio;
    limiter.attack.value = LIMITER.attack;
    limiter.release.value = LIMITER.release;
    bus.node.connect(master.node);
    master.node.connect(transport.node);
    transport.node.connect(sleep.node);
    sleep.node.connect(cap.node);
    cap.node.connect(limiter);
    limiter.connect(context.destination);
    context.onstatechange = () => this.contextStateChanged();
    this.graph = {
      context,
      bus: bus.param,
      master: master.param,
      transport: transport.param,
      sleep: sleep.param,
      cap: cap.param,
      sleepNode: sleep.node,
      busNode: bus.node,
    };
    return this.graph;
  }

  /**
   * Resumes, and once the browser has done so, brings an interrupted sound back even when no statechange
   * fires (the context was running already, or reported it before the engine looked).
   */
  private resumeContext(context: ContextLike): void {
    context.resume().then(
      () => {
        if (this.state.status === 'interrupted' && context.state === 'running') this.contextStateChanged();
      },
      (error: unknown) => console.error('Could not start the sound', error),
    );
  }

  private suspendContext(): void {
    const context = this.graph?.context;
    if (!context || context.state !== 'running') return;
    context.suspend().catch((error: unknown) => console.error('Could not suspend the sound', error));
  }

  private cancelSuspend(): void {
    if (this.suspendTimer !== null) this.deps.clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
  }

  // ---- Controls ------------------------------------------------------------------------------------

  /** A tile tap. While stopped it also starts playback, while interrupted it also resumes; while paused it only changes the selection. */
  toggleLayer(soundId: SoundId): ToggleResult {
    const layers = this.state.layers;
    if (layers.some((layer) => layer.soundId === soundId)) {
      const rest = layers.filter((layer) => layer.soundId !== soundId);
      if (rest.length === 0 && this.state.status !== 'stopped') {
        this.update({ layers: rest, preparing: this.stillSelected(rest) });
        this.stop(REMOVE_FADE_SECONDS);
        return 'removed';
      }
      this.update({ layers: rest, preparing: this.stillSelected(rest) });
      this.fadeOutVoice(soundId, REMOVE_FADE_SECONDS);
      this.applyBus(REMOVE_FADE_SECONDS);
      return 'removed';
    }
    if (layers.length >= MAX_LAYERS) return 'full';
    const layer: EngineLayer = { soundId, level: DEFAULT_LEVEL };
    if (this.state.status === 'stopped') {
      this.update({ layers: [...layers, layer] });
      this.play(); // unlocks the context first, synchronously (R6)
      return 'added';
    }
    if (this.state.status === 'interrupted') {
      // The tap doubles as "Devam et": the context resumes in it (R6). A timer that ran out meanwhile stays
      // stopped (R2), checked first so the context is never resumed for it; the tile still joins the selection.
      if (this.timerExpired()) {
        this.finishTimer();
        this.update({ layers: [...layers, layer] });
        return 'added';
      }
      this.unlock();
    }
    this.update({ layers: [...layers, layer] });
    this.applyBus(0);
    if (this.state.status !== 'paused') this.startVoice(layer, START_FADE_SECONDS);
    return 'added';
  }

  setLevel(soundId: SoundId, level: number): void {
    const value = clamp01(level);
    if (!this.state.layers.some((layer) => layer.soundId === soundId)) return;
    this.update({ layers: this.state.layers.map((layer) => (layer.soundId === soundId ? { soundId, level: value } : layer)) });
    const voice = this.voices.get(soundId);
    if (voice && this.graph) {
      const t = this.graph.context.currentTime;
      voice.gain.hold(t);
      voice.gain.approach(sliderGain(value), t, SLIDER_TIME_CONSTANT);
    }
    this.applyBus(0);
  }

  setMaster(value: number): void {
    const master = clamp01(value);
    this.update({ master });
    if (!this.graph) return;
    const t = this.graph.context.currentTime;
    this.graph.master.hold(t);
    this.graph.master.approach(sliderGain(master), t, SLIDER_TIME_CONSTANT);
  }

  /** Ayarlar saved a new cap. Raising it never raises what plays now (volume.masterAfterCapChange). */
  setCap(value: number): void {
    const next = clampCap(value);
    const previous = this.cap;
    if (next === previous) return;
    this.cap = next;
    const master = masterAfterCapChange(this.state.master, previous, next);
    if (master !== this.state.master) this.setMaster(master);
    if (!this.graph) return;
    const t = this.graph.context.currentTime;
    this.graph.cap.hold(t);
    this.graph.cap.ramp(capGain(next), t + (next > previous ? RISE_SECONDS : CAP_LOWER_SECONDS));
  }

  /** A timer chip. While sound plays or is paused the countdown restarts from now; while stopped it starts on play. */
  setTimer(choice: TimerChoice): void {
    this.update({ timer: choice });
    if (this.state.status === 'stopped') return;
    this.update({ endsAt: choice === null ? null : timerEndsAt(this.deps.now(), choice) });
    this.armTimer();
  }

  play(): void {
    const status = this.state.status;
    if (status === 'playing' || this.state.layers.length === 0) return;
    // Paused or interrupted: the countdown went on meanwhile (R2), so a timer that ran out stays stopped, unresumed.
    if (status !== 'stopped' && this.timerExpired()) {
      this.finishTimer();
      return;
    }
    const graph = this.unlock();
    if (status === 'stopped') {
      const timer = this.state.timer;
      this.update({ status: 'playing', endsAt: timer === null ? null : timerEndsAt(this.deps.now(), timer) });
    } else {
      this.update({ status: 'playing' });
    }
    // The bus follows the layers as they are now: a mix loaded while paused must not play at the old scale.
    this.applyBus(0);
    // A voice about to start at full gain with no fade of its own needs the transport at 0 first: a pause's
    // or a stop's own fade (0.3 s) may still be mid-ramp here, nowhere near 0 yet, if play() runs inside
    // that window (R1) — a mix loaded right after pausing, or right after the last tile fades out. Without
    // one (a pause then play by a double tap), the transport turns back from where it is: a cut would be a
    // click and a 2 s dropout next to a sleeping baby.
    const layers = this.state.layers.filter((layer) => !this.voices.has(layer.soundId));
    const rate = graph.context.sampleRate;
    if (layers.some((layer) => this.loops.has(this.loopKey(layer.soundId, rate)))) {
      const t = graph.context.currentTime;
      graph.transport.hold(t);
      graph.transport.set(0, t);
    }
    for (const layer of layers) this.startVoice(layer, 0);
    this.fadeIn(graph);
    this.armTimer();
  }

  pause(): void {
    if (this.state.status !== 'playing' && this.state.status !== 'interrupted') return;
    this.update({ status: 'paused' });
    const graph = this.graph;
    if (!graph) return;
    const t = graph.context.currentTime;
    graph.transport.hold(t);
    graph.transport.ramp(0, t + PAUSE_FADE_SECONDS);
    this.cancelSuspend();
    this.suspendTimer = this.deps.setTimeout(() => {
      this.suspendTimer = null;
      if (this.state.status === 'paused') this.suspendContext();
    }, PAUSE_FADE_SECONDS * 1000 + 50);
  }

  /** Stops everything and forgets the countdown; the selection and the chip stay. `fade` seconds for a removed last layer. */
  stop(fade = 0): void {
    this.clearTimer();
    this.cancelSuspend();
    for (const soundId of [...this.voices.keys()]) this.fadeOutVoice(soundId, fade);
    const wasStopped = this.state.status === 'stopped';
    // The selection stays, but nothing is generated for a stopped engine: play() queues what it misses again.
    this.update({ status: 'stopped', endsAt: null, preparing: [] });
    const graph = this.graph;
    if (!graph || wasStopped) return;
    const t = graph.context.currentTime;
    if (fade === 0) {
      graph.transport.hold(t);
      graph.transport.set(0, t);
      this.suspendContext();
    } else {
      graph.transport.hold(t);
      graph.transport.ramp(0, t + fade);
      this.suspendTimer = this.deps.setTimeout(() => {
        this.suspendTimer = null;
        if (this.state.status === 'stopped') this.suspendContext();
      }, fade * 1000 + 50);
    }
  }

  /**
   * A tap on a saved mix: its layers replace the current ones and play. Unknown ids (a newer version's
   * sounds) are skipped; with none left, nothing starts. While sound plays, old and new crossfade. When
   * the timer had already run out, the selection is still taken up but nothing starts (R2): 'stopped' says
   * so, rather than claiming a start that did not happen.
   */
  loadMix(layers: readonly { soundId: string; gain: number }[]): 'started' | 'stopped' | 'empty' {
    const next = this.usable(layers.map((layer) => ({ soundId: layer.soundId, level: layer.gain })));
    if (next.length === 0) return 'empty';
    const status = this.state.status;
    if (status === 'stopped' || status === 'paused') {
      for (const soundId of [...this.voices.keys()]) this.fadeOutVoice(soundId, 0);
      this.update({ layers: next, preparing: this.stillSelected(next) });
      this.play(); // unlocks the context first, synchronously (R6); a no-op when the timer had run out
      return this.state.status === 'playing' ? 'started' : 'stopped';
    }
    // status is 'playing' or 'interrupted' here. An expired timer while interrupted stays stopped (R2):
    // checked before unlock(), so an expired timer never resumes the context just to load a new mix.
    if (status === 'interrupted' && this.timerExpired()) {
      this.finishTimer();
      this.update({ layers: next });
      return 'stopped';
    }
    // Playing or interrupted (not expired): the new layers start in this tap, crossfading with the old ones.
    const graph = this.unlock();
    const t = graph.context.currentTime;
    for (const soundId of [...this.voices.keys()]) {
      if (!next.some((layer) => layer.soundId === soundId)) this.fadeOutVoice(soundId, START_FADE_SECONDS);
    }
    this.update({ layers: next, preparing: this.stillSelected(next) });
    for (const layer of next) {
      const voice = this.voices.get(layer.soundId);
      if (!voice) this.startVoice(layer, START_FADE_SECONDS);
      else {
        voice.gain.hold(t);
        voice.gain.ramp(sliderGain(layer.level), t + START_FADE_SECONDS);
      }
    }
    // The old voices fade out over START_FADE_SECONDS too: the bus must not finish rising before they are gone.
    this.applyBus(START_FADE_SECONDS);
    return 'started';
  }

  // ---- The outside world ---------------------------------------------------------------------------

  /** The page became visible again: a timer that ran out stops; an interrupted sound tries to come back. */
  onVisible(): void {
    if (this.timerExpired()) {
      this.finishTimer();
      return;
    }
    const graph = this.graph;
    if (!graph) return;
    const status = this.state.status;
    if (status === 'playing' && graph.context.state !== 'running') this.markInterrupted(graph);
    if (this.state.status === 'interrupted') this.resumeContext(graph.context);
  }

  /** navigator.audioSession's state ('active', 'inactive', 'interrupted'), where the browser has it. */
  onSessionState(state: string): void {
    const graph = this.graph;
    if (!graph) return;
    if (state === 'interrupted' && this.state.status === 'playing') this.markInterrupted(graph);
    else if (state === 'active') {
      if (this.state.status === 'interrupted') {
        if (this.timerExpired()) this.finishTimer();
        else this.resumeContext(graph.context);
      } else if ((this.state.status === 'stopped' || this.state.status === 'paused') && graph.context.state === 'running') {
        // The interruption ended on its own after a timer expiry or a pause had already silenced the sound
        // (their own suspend() was a no-op then, the context not being 'running' yet): no silent awake context.
        this.suspendContext();
      }
    }
  }

  private contextStateChanged(): void {
    const graph = this.graph;
    if (!graph) return;
    const state = graph.context.state;
    if (state === 'running') {
      if (this.state.status === 'stopped' || this.state.status === 'paused') {
        // Same reasoning as onSessionState's 'active' branch, for the statechange path.
        this.suspendContext();
        return;
      }
      if (this.state.status !== 'interrupted') return;
      if (this.timerExpired()) {
        this.finishTimer();
        return;
      }
      this.update({ status: 'playing' });
      this.fadeIn(graph);
      this.armTimer();
      return;
    }
    // Suspended by the system (a call, an alarm, Siri) while the parent meant it to play.
    if ((state === 'interrupted' || state === 'suspended') && this.state.status === 'playing') this.markInterrupted(graph);
  }

  private markInterrupted(graph: Graph): void {
    this.update({ status: 'interrupted' });
    // Silent from here: when the system lets the sound go on, it comes back with a fade, not at full level.
    const t = graph.context.currentTime;
    graph.transport.hold(t);
    graph.transport.set(0, t);
  }

  // ---- Voices ---------------------------------------------------------------------------------------

  private loopKey(soundId: SoundId, sampleRate: number): string {
    return `${soundId}@${sampleRate}`;
  }

  /** Starts a layer's source, fading its gain in over `fade` seconds, or queues its loop's generation first. */
  private startVoice(layer: EngineLayer, fade: number): void {
    const graph = this.graph;
    if (!graph || this.voices.has(layer.soundId)) return;
    const cached = this.loops.get(this.loopKey(layer.soundId, graph.context.sampleRate));
    if (!cached) {
      this.prepare(layer.soundId);
      return;
    }
    cached.idleSince = null;
    const context = graph.context;
    const source = context.createBufferSource();
    source.buffer = cached.buffer;
    source.loop = true;
    const node = context.createGain();
    const gain = new Param(node.gain, fade > 0 ? 0 : sliderGain(layer.level));
    source.connect(node);
    node.connect(graph.busNode);
    const t = context.currentTime;
    if (fade > 0) {
      gain.set(0, t);
      gain.ramp(sliderGain(layer.level), t + fade);
    }
    source.start();
    this.voices.set(layer.soundId, { source, node, gain });
  }

  private fadeOutVoice(soundId: SoundId, fade: number): void {
    const voice = this.voices.get(soundId);
    const graph = this.graph;
    if (!voice || !graph) return;
    this.voices.delete(soundId);
    const t = graph.context.currentTime;
    if (fade > 0) {
      voice.gain.hold(t);
      voice.gain.ramp(0, t + fade);
      voice.source.onended = () => voice.node.disconnect();
      voice.source.stop(t + fade + 0.05);
      // Nothing may make the bus rise until this voice is actually gone, however applyBus gets called meanwhile.
      this.busRiseNotBefore = Math.max(this.busRiseNotBefore, t + fade);
    } else {
      voice.source.stop();
      voice.source.disconnect();
      voice.node.disconnect();
    }
    this.markIdle();
  }

  /**
   * The bus follows the layers: at once when it goes down; when it goes up, after `delay` and over
   * RISE_SECONDS, but never before `busRiseNotBefore` (a voice still fading out from an earlier call):
   * whichever call raises the bus next, the rise still waits for that voice to actually be gone.
   */
  private applyBus(delay: number): void {
    const graph = this.graph;
    if (!graph) return;
    const t = graph.context.currentTime;
    const next = busScale(this.state.layers.map((layer) => layer.level));
    const current = graph.bus.hold(t);
    if (next <= current) graph.bus.approach(next, t, SLIDER_TIME_CONSTANT);
    else {
      const riseAt = Math.max(t + delay, this.busRiseNotBefore);
      graph.bus.set(current, riseAt);
      graph.bus.ramp(next, riseAt + RISE_SECONDS);
    }
  }

  /** Brings the transport up to full over START_FADE_SECONDS from wherever it is (0 after a stop, a pause or an interruption). */
  private fadeIn(graph: Graph): void {
    const t = graph.context.currentTime;
    const current = graph.transport.hold(t);
    graph.transport.set(current, t);
    graph.transport.ramp(1, t + START_FADE_SECONDS);
  }

  /** The queued generations `layers` still needs: deselecting a tile also cancels its "Hazırlanıyor…". */
  private stillSelected(layers: readonly EngineLayer[]): SoundId[] {
    return this.state.preparing.filter((id) => layers.some((layer) => layer.soundId === id));
  }

  /** Generates missing loops one per task, so the tile can show "Hazırlanıyor…" and the page stays responsive. */
  private prepare(soundId: SoundId): void {
    if (this.state.preparing.includes(soundId)) return;
    this.update({ preparing: [...this.state.preparing, soundId] });
    if (this.generating === null) this.generating = this.deps.setTimeout(() => this.generateNext(), GENERATE_GAP_MS);
  }

  private generateNext(): void {
    this.generating = null;
    const graph = this.graph;
    const [soundId, ...rest] = this.state.preparing;
    if (!graph || soundId === undefined) return;
    const rate = graph.context.sampleRate;
    try {
      const samples = this.deps.generate(soundId, rate);
      const buffer = graph.context.createBuffer(1, samples.length, rate);
      buffer.getChannelData(0).set(samples);
      this.loops.set(this.loopKey(soundId, rate), { buffer, idleSince: null });
      this.update({ preparing: rest });
      const layer = this.state.layers.find((entry) => entry.soundId === soundId);
      const status = this.state.status;
      if (layer && (status === 'playing' || status === 'interrupted')) this.startVoice(layer, START_FADE_SECONDS);
    } catch (error) {
      // Out of memory on an old phone, say: the tile goes back to off instead of staying on "Hazırlanıyor…".
      console.error(`Could not generate the sound ${soundId}`, error);
      const layers = this.state.layers.filter((entry) => entry.soundId !== soundId);
      this.update({ preparing: rest, layers });
      // It was the only layer: nothing plays any more, so stop cleanly instead of a silent "playing" with no sound and the timer still counting down.
      if (layers.length === 0 && this.state.status !== 'stopped') this.stop();
      else this.applyBus(0);
    }
    if (rest.length > 0) this.generating = this.deps.setTimeout(() => this.generateNext(), GENERATE_GAP_MS);
    this.markIdle();
  }

  /** Notes when each cached loop stopped playing, and drops those idle for EVICT_AFTER_MS. */
  private markIdle(): void {
    const graph = this.graph;
    if (!graph) return;
    const now = this.deps.now();
    const rate = graph.context.sampleRate;
    const playing = new Set<string>(
      this.state.status === 'stopped' ? [] : this.state.layers.map((layer) => this.loopKey(layer.soundId, rate)),
    );
    let idle = false;
    for (const [key, loop] of this.loops) {
      if (playing.has(key)) loop.idleSince = null;
      else {
        loop.idleSince ??= now;
        if (now - loop.idleSince >= EVICT_AFTER_MS) this.loops.delete(key);
        else idle = true;
      }
    }
    if (idle && this.evictTimer === null) {
      this.evictTimer = this.deps.setTimeout(() => {
        this.evictTimer = null;
        this.markIdle();
      }, EVICT_AFTER_MS + 1000);
    }
  }

  // ---- The sleep timer -----------------------------------------------------------------------------

  private timerExpired(): boolean {
    return this.state.endsAt !== null && this.deps.now() >= this.state.endsAt;
  }

  private clearTimer(): void {
    this.timerToken += 1;
    if (this.wallTimer !== null) this.deps.clearTimeout(this.wallTimer);
    this.wallTimer = null;
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel) {
      sentinel.onended = null;
      sentinel.stop();
      sentinel.disconnect();
    }
  }

  /**
   * Schedules the running timer, or its absence, from the wall clock (R2): the fade on the `sleep` gain,
   * a silent sentinel whose `ended` stops everything (JS runs while audio plays, even locked), and a JS
   * timeout as a second way to stop at `endsAt`. No source ever gets a stop time from the timer.
   */
  private armTimer(): void {
    this.clearTimer();
    const endsAt = this.state.endsAt;
    const now = this.deps.now();
    if (endsAt !== null) {
      if (now >= endsAt) {
        this.finishTimer();
        return;
      }
      const token = this.timerToken;
      this.wallTimer = this.deps.setTimeout(() => {
        this.wallTimer = null;
        if (token === this.timerToken && this.timerExpired()) this.finishTimer();
      }, endsAt - now);
    }
    const graph = this.graph;
    // The audio clock stands still while the context is paused or interrupted: the fade is scheduled when it runs again.
    if (!graph || this.state.status !== 'playing') return;
    const t = graph.context.currentTime;
    const held = graph.sleep.hold(t);
    if (endsAt === null) {
      graph.sleep.steps(recoverSteps(t, held));
      return;
    }
    graph.sleep.steps(sleepSteps(endsAt, now, t, held));
    const token = this.timerToken;
    const sentinel = graph.context.createConstantSource();
    sentinel.offset.value = 0;
    sentinel.connect(graph.sleepNode);
    sentinel.onended = () => {
      if (token === this.timerToken) this.finishTimer();
    };
    sentinel.start();
    sentinel.stop(t + (endsAt - now) / 1000);
    this.sentinel = sentinel;
  }

  /** The timer ran out: stopped wins over any "resume" path from here on. */
  private finishTimer(): void {
    if (this.state.status === 'stopped') return;
    this.stop();
    const graph = this.graph;
    if (!graph) return;
    // Ready for the next play: the fade is over and the next timer starts from full.
    const t = graph.context.currentTime;
    graph.sleep.hold(t);
    graph.sleep.set(1, t);
  }
}

export type SoundEngine = Pick<
  Engine,
  | 'getSnapshot'
  | 'subscribe'
  | 'restore'
  | 'toggleLayer'
  | 'setLevel'
  | 'setMaster'
  | 'setCap'
  | 'setTimer'
  | 'play'
  | 'pause'
  | 'stop'
  | 'loadMix'
  | 'onVisible'
  | 'onSessionState'
>;

export function createSoundEngine(deps: EngineDeps): SoundEngine {
  return new Engine(deps);
}
