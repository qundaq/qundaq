import { isSoundId, type SoundId } from '../domain/sounds';
import { MINUTE } from '../domain/time';
import {
  Param,
  type BufferLike,
  type BufferSourceLike,
  type ConstantSourceLike,
  type ContextLike,
  type GainLike,
} from './graph';
import {
  DEFAULT_TIMER,
  isTimerChoice,
  recoverSteps,
  sleepSteps,
  timerEndsAt,
  type TimerChoice,
} from './timer';
import {
  DEFAULT_CAP,
  DEFAULT_MASTER,
  VOICE_LEVEL,
  capGain,
  clamp01,
  clampCap,
  masterAfterCapChange,
  sliderGain,
} from './volume';

export interface EngineDeps {
  createContext(): ContextLike;
  /** One sound's loop, ready to play (audio/loader.ts loadLoop). Rejects when the file is missing or undecodable. */
  load(context: ContextLike, soundId: SoundId): Promise<BufferLike>;
  /** Wall-clock time, epoch ms. */
  now(): number;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  /** Called first in every tap that can start sound: navigator.audioSession.type = 'playback'. */
  prepareSession(): void;
}

export type EngineStatus = 'stopped' | 'playing' | 'paused' | 'interrupted';

/** What the sounds tab and the now-playing bar show. The same object until something changes. */
export interface EngineState {
  readonly status: EngineStatus;
  /** The selected sound (playing, paused or waiting to be played); null: nothing selected. */
  readonly current: SoundId | null;
  /** The master slider, 0..1 of the capped range. */
  readonly master: number;
  /** The selected timer chip (null: ∞). */
  readonly timer: TimerChoice;
  /** Wall-clock end of the running timer (epoch ms), or null when none counts down. */
  readonly endsAt: number | null;
  /** The sound whose file is being fetched and decoded (sounds.preparing), if any. */
  readonly loading: SoundId | null;
  /** Sounds whose file failed to load this session: their tiles say so and do nothing. */
  readonly unavailable: readonly SoundId[];
}

/** What the app remembers between launches (settings.lastSound): the selection, never the playing state. */
export interface SavedSound {
  /** As stored: an id this version does not know reads as nothing selected. */
  soundId: string | null;
  master: number;
  timer: TimerChoice;
}

/** Starting playback, resuming and a new sound fading in take this long (≥ 1.5 s: a sleeping baby is near). */
export const START_FADE_SECONDS = 2;
/** Switching sounds: the old one fades out as the new one fades in, so the two never add up to more than one (R4). */
export const SWITCH_FADE_SECONDS = START_FADE_SECONDS;
/** Pause fades out over this long before the context is suspended. */
export const PAUSE_FADE_SECONDS = 0.3;
/** Raising the cap takes at least this long: nothing the parent did not ask for gets louder quickly. */
export const RISE_SECONDS = 1.5;
/** Lowering the cap applies over this long. */
export const CAP_LOWER_SECONDS = 0.5;
/** Time constant of a slider move: quick, without a click. */
export const SLIDER_TIME_CONSTANT = 0.05;
/** A loop that has not played for this long is dropped from memory (iOS kills memory-hungry pages in the background). */
export const EVICT_AFTER_MS = 5 * MINUTE;
/**
 * The limiter before the speaker. WebKit's and Blink's DynamicsCompressorNode also apply a fixed makeup
 * gain of (1 / gain at full scale)^0.6, about +1.7 dB with these settings, to everything, below the
 * threshold too. It is constant, so nothing gets louder over time; checklist row 35's readings include it.
 */
export const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;

interface Graph {
  context: ContextLike;
  master: Param; // the master slider only
  transport: Param; // play / pause / resume ramps only
  sleep: Param; // the sleep timer only
  cap: Param; // the safety cap only
  sleepNode: GainLike;
  masterNode: GainLike; // where a voice connects
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

/**
 * The sound player: one AudioContext, and `source (loop) → voice gain → master → transport → sleep → cap
 * → limiter → speaker`. One sound plays at a time; a switch briefly overlaps the old voice (fading out)
 * and the new one (fading in). Every gain node has one job, so the sleep timer, the pause ramps, the
 * slider and the cap never overwrite each other's automation, and nothing the parent did not ask for
 * ever makes the sound louder.
 */
class Engine {
  private state: EngineState = {
    status: 'stopped',
    current: null,
    master: DEFAULT_MASTER,
    timer: DEFAULT_TIMER,
    endsAt: null,
    loading: null,
    unavailable: [],
  };
  private readonly listeners = new Set<() => void>();
  private graph: Graph | null = null;
  private cap = DEFAULT_CAP;
  private voice: Voice | null = null;
  /** Voices a switch left fading out: forgotten as the current voice, but still sounding until they end. */
  private readonly fading = new Set<Voice>();
  private readonly loops = new Map<SoundId, CachedLoop>();
  private suspendTimer: number | null = null;
  private wallTimer: number | null = null;
  private evictTimer: number | null = null;
  private sentinel: ConstantSourceLike | null = null;
  /** Bumped whenever the timer is rescheduled or cancelled, so a replaced sentinel's `ended` is ignored. */
  private timerToken = 0;

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
      next.current !== current.current ||
      next.master !== current.master ||
      next.timer !== current.timer ||
      next.endsAt !== current.endsAt ||
      next.loading !== current.loading ||
      next.unavailable.length !== current.unavailable.length ||
      next.unavailable.some((id, i) => id !== current.unavailable[i]);
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
    const timer = isTimerChoice(saved.timer) ? saved.timer : DEFAULT_TIMER;
    this.update({
      current: isSoundId(saved.soundId) ? saved.soundId : null,
      master: clamp01(saved.master),
      timer,
    });
  }

  // ---- Lifecycle: the first tap -----------------------------------------------------------------

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

    master.node.connect(transport.node);
    transport.node.connect(sleep.node);
    sleep.node.connect(cap.node);
    cap.node.connect(limiter);
    limiter.connect(context.destination);

    context.onstatechange = () => this.contextStateChanged();
    this.graph = {
      context,
      master: master.param,
      transport: transport.param,
      sleep: sleep.param,
      cap: cap.param,
      sleepNode: sleep.node,
      masterNode: master.node,
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
        if (this.state.status === 'interrupted' && context.state === 'running')
          this.contextStateChanged();
      },
      (error: unknown) => console.error('Could not start the sound', error),
    );
  }

  private suspendContext(): void {
    const context = this.graph?.context;
    if (!context || context.state !== 'running') return;
    context
      .suspend()
      .catch((error: unknown) => console.error('Could not suspend the sound', error));
  }

  private cancelSuspend(): void {
    if (this.suspendTimer !== null) this.deps.clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
  }

  // ---- The tiles --------------------------------------------------------------------------------

  /**
   * A tile tap: the tile is the play control (R7). The playing sound's tile pauses it; the current
   * sound's tile otherwise plays it; another tile switches to that sound and plays it (also from paused).
   * The tap that can start sound reaches the context synchronously, before any await (R6 of Plan 5).
   */
  select(soundId: SoundId): void {
    if (this.state.unavailable.includes(soundId)) return;
    const { status, current } = this.state;

    if (current === soundId) {
      if (status === 'playing') this.pause();
      else this.play();
      return;
    }

    if (status === 'stopped' || status === 'paused') {
      this.dropVoice(0);
      this.update({ current: soundId, loading: null });
      this.play(); // unlocks the context first, synchronously; a no-op when the timer had run out
      return;
    }

    // playing or interrupted. A timer that ran out while interrupted stays stopped (R2), checked first so
    // the context is never resumed for it; the selection still moves.
    if (status === 'interrupted' && this.timerExpired()) {
      this.finishTimer();
      this.update({ current: soundId, loading: null });
      return;
    }
    this.unlock();
    this.dropVoice(SWITCH_FADE_SECONDS);
    this.update({ current: soundId, loading: null });
    this.startVoice(soundId, START_FADE_SECONDS);
  }

  // ---- Volume -----------------------------------------------------------------------------------

  setMaster(value: number): void {
    const master = clamp01(value);
    this.update({ master });
    if (!this.graph) return;
    const t = this.graph.context.currentTime;
    this.graph.master.hold(t);
    this.graph.master.approach(sliderGain(master), t, SLIDER_TIME_CONSTANT);
  }

  /** Settings saved a new cap. Raising it never raises what plays now (volume.masterAfterCapChange). */
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

  // ---- Timer: the chip --------------------------------------------------------------------------

  /** A timer chip. While sound plays or is paused the countdown restarts from now; while stopped it starts on play. */
  setTimer(choice: TimerChoice): void {
    this.update({ timer: choice });
    if (this.state.status === 'stopped') return;
    this.update({ endsAt: choice === null ? null : timerEndsAt(this.deps.now(), choice) });
    this.armTimer();
  }

  // ---- Lifecycle: play, pause, stop -------------------------------------------------------------

  play(): void {
    const { status, current } = this.state;
    if (status === 'playing' || current === null) return;
    // Paused or interrupted: the countdown went on meanwhile (R2), so a timer that ran out stays stopped, unresumed.
    if (status !== 'stopped' && this.timerExpired()) {
      this.finishTimer();
      return;
    }

    const graph = this.unlock();
    if (status === 'stopped') {
      const timer = this.state.timer;
      this.update({
        status: 'playing',
        endsAt: timer === null ? null : timerEndsAt(this.deps.now(), timer),
      });
    } else {
      this.update({ status: 'playing' });
    }

    if (!this.voice) {
      // A voice that starts at full gain with no fade of its own needs the transport at 0 first: a pause's own
      // fade (0.3 s) may still be mid-ramp here. Without a voice to start (a pause then play by a double tap),
      // the transport turns back from where it is: a cut would be a click.
      if (this.loops.has(current)) {
        const t = graph.context.currentTime;
        graph.transport.hold(t);
        graph.transport.set(0, t);
      }
      this.startVoice(current, 0);
    }

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
    this.suspendTimer = this.deps.setTimeout(
      () => {
        this.suspendTimer = null;
        if (this.state.status === 'paused') this.suspendContext();
      },
      PAUSE_FADE_SECONDS * 1000 + 50,
    );
  }

  /** Stops everything and forgets the countdown; the selection and the chip stay. */
  stop(): void {
    this.clearTimer();
    this.cancelSuspend();
    this.dropVoice(0); // also cuts a voice still fading out from a switch

    const wasStopped = this.state.status === 'stopped';
    this.update({ status: 'stopped', endsAt: null, loading: null });
    const graph = this.graph;
    if (!graph || wasStopped) return;
    const t = graph.context.currentTime;
    graph.transport.hold(t);
    graph.transport.set(0, t);
    this.suspendContext();
  }

  // ---- Recovery ---------------------------------------------------------------------------------

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
      } else if (
        (this.state.status === 'stopped' || this.state.status === 'paused') &&
        graph.context.state === 'running'
      ) {
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
    if ((state === 'interrupted' || state === 'suspended') && this.state.status === 'playing')
      this.markInterrupted(graph);
  }

  private markInterrupted(graph: Graph): void {
    this.update({ status: 'interrupted' });
    // Silent from here: when the system lets the sound go on, it comes back with a fade, not at full level.
    const t = graph.context.currentTime;
    graph.transport.hold(t);
    graph.transport.set(0, t);
  }

  // ---- Voices and loops -------------------------------------------------------------------------

  /** Starts the sound's source, fading its gain in over `fade` seconds, or loads its file first. */
  private startVoice(soundId: SoundId, fade: number): void {
    const graph = this.graph;
    if (!graph || this.voice) return;
    const cached = this.loops.get(soundId);
    if (!cached) {
      this.load(soundId);
      return;
    }

    cached.idleSince = null;
    const context = graph.context;
    const source = context.createBufferSource();
    source.buffer = cached.buffer;
    source.loop = true;
    const node = context.createGain();
    const level = sliderGain(VOICE_LEVEL);
    const gain = new Param(node.gain, fade > 0 ? 0 : level);
    source.connect(node);
    node.connect(graph.masterNode);
    const t = context.currentTime;
    if (fade > 0) {
      gain.set(0, t);
      gain.ramp(level, t + fade);
    }

    source.start();
    this.voice = { source, node, gain };
  }

  /**
   * The current voice leaves: faded out over `fade` seconds (a switch), or at once. At once also cuts any
   * voice an earlier switch left fading out: it is only used while the transport is silent or about to be,
   * and a fading voice frozen by a suspended context would otherwise play its tail under the next fade-in.
   */
  private dropVoice(fade: number): void {
    const graph = this.graph;
    if (!graph) return;
    if (fade <= 0) this.cutFading();
    const voice = this.voice;
    if (!voice) return;
    this.voice = null;
    const t = graph.context.currentTime;
    if (fade > 0) {
      voice.gain.hold(t);
      voice.gain.ramp(0, t + fade);
      this.fading.add(voice);
      voice.source.onended = () => {
        this.fading.delete(voice);
        voice.node.disconnect();
      };
      voice.source.stop(t + fade + 0.05);
    } else {
      voice.source.stop();
      voice.source.disconnect();
      voice.node.disconnect();
    }

    this.markIdle();
  }

  /** Stops and disconnects, at once, every voice still fading out from a switch. */
  private cutFading(): void {
    for (const voice of this.fading) {
      voice.source.onended = null;
      voice.source.stop();
      voice.source.disconnect();
      voice.node.disconnect();
    }
    this.fading.clear();
  }

  /** Brings the transport up to full over START_FADE_SECONDS from wherever it is (0 after a stop, a pause or an interruption). */
  private fadeIn(graph: Graph): void {
    const t = graph.context.currentTime;
    const current = graph.transport.hold(t);
    graph.transport.set(current, t);
    graph.transport.ramp(1, t + START_FADE_SECONDS);
  }

  /**
   * Fetches and decodes a sound (the tile shows sounds.preparing meanwhile). A result for a sound that is
   * no longer the selected one is only cached. A failure marks the sound unavailable and, if it was the
   * selected one, clears the selection and stops: never a silent "playing" with the timer counting down (R8).
   */
  private load(soundId: SoundId): void {
    const graph = this.graph;
    if (!graph || this.state.loading === soundId) return;
    this.update({ loading: soundId });
    this.deps.load(graph.context, soundId).then(
      (buffer) => {
        // A second load of the same sound (selected again while the first was in flight) must not replace a
        // buffer a playing voice already uses.
        if (!this.loops.has(soundId)) this.loops.set(soundId, { buffer, idleSince: null });
        if (this.state.loading === soundId) this.update({ loading: null });
        const status = this.state.status;
        if (this.state.current === soundId && (status === 'playing' || status === 'interrupted'))
          this.startVoice(soundId, START_FADE_SECONDS);
        this.markIdle();
      },
      (error: unknown) => {
        console.error(`Could not load the sound ${soundId}`, error);
        const wasCurrent = this.state.current === soundId;
        this.update({
          loading: this.state.loading === soundId ? null : this.state.loading,
          unavailable: this.state.unavailable.includes(soundId)
            ? this.state.unavailable
            : [...this.state.unavailable, soundId],
          ...(wasCurrent ? { current: null } : {}),
        });
        if (wasCurrent && this.state.status !== 'stopped') this.stop();
      },
    );
  }

  /** Notes when each cached loop stopped playing, and drops those idle for EVICT_AFTER_MS. */
  private markIdle(): void {
    if (!this.graph) return;
    const now = this.deps.now();
    const playing = this.state.status === 'stopped' ? null : this.state.current;

    let idle = false;
    for (const [id, loop] of this.loops) {
      if (id === playing) loop.idleSince = null;
      else {
        loop.idleSince ??= now;
        if (now - loop.idleSince >= EVICT_AFTER_MS) this.loops.delete(id);
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

  // ---- Timer: the countdown ---------------------------------------------------------------------

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
  | 'select'
  | 'setMaster'
  | 'setCap'
  | 'setTimer'
  | 'play'
  | 'pause'
  | 'stop'
  | 'onVisible'
  | 'onSessionState'
>;

export function createSoundEngine(deps: EngineDeps): SoundEngine {
  return new Engine(deps);
}
