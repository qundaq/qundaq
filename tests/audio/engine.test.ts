import { describe, expect, it, vi } from 'vitest';
import {
  CAP_LOWER_SECONDS,
  EVICT_AFTER_MS,
  LIMITER,
  PAUSE_FADE_SECONDS,
  REMOVE_FADE_SECONDS,
  RISE_SECONDS,
  START_FADE_SECONDS,
  createSoundEngine,
  type SoundEngine,
} from '../../src/audio/engine';
import { DEFAULT_TIMER, FADE_SECONDS, RECOVER_SECONDS, type TimerChoice } from '../../src/audio/timer';
import { DEFAULT_CAP, DEFAULT_LEVEL, DEFAULT_MASTER, busScale, capGain, sliderGain } from '../../src/audio/volume';
import { MINUTE } from '../../src/domain/time';
import { FakeDeps, FakeParam, WALL_START, flush, type FakeContext, type FakeContextOptions } from '../support/fake-audio';

function setup(options: FakeContextOptions = {}): { engine: SoundEngine; deps: FakeDeps; context: FakeContext } {
  const deps = new FakeDeps(options);
  return { engine: createSoundEngine(deps), deps, context: deps.context };
}

/** A playing engine with `ids` enabled, their loops generated and their sources started. */
function playing(ids: readonly ('white' | 'rain' | 'pink' | 'brown' | 'wind' | 'waves' | 'shush')[] = ['white'], options: FakeContextOptions = {}) {
  const { engine, deps } = setup(options);
  for (const id of ids) engine.toggleLayer(id);
  deps.advance(100); // generation runs from a timer
  return { engine, deps, context: deps.context };
}

/** The largest value of `param` over [from, to], sampled every 50 ms: no gain may rise above what the parent asked for. */
function peakBetween(param: FakeParam, from: number, to: number): number {
  let max = -Infinity;
  for (let t = from; t <= to + 1e-9; t += 0.05) max = Math.max(max, param.valueAt(t));
  return max;
}

/**
 * The engine's actual output at audio-clock time `at`: master × transport × sleep × cap × bus × √Σv², every
 * voice's own gain squared and summed (every source contributes, fading-out and not-yet-disconnected ones
 * included, since the engine's own bookkeeping — layers, voices — may already have forgotten them).
 */
function totalPower(context: FakeContext, at: number): number {
  const sumSquares = context.sources.reduce((total, source) => {
    const value = context.voiceGain(source)?.gain.valueAt(at) ?? 0;
    return total + value * value;
  }, 0);
  const { bus, master, transport, sleep, cap } = context.graph;
  const chain = master.gain.valueAt(at) * transport.gain.valueAt(at) * sleep.gain.valueAt(at) * cap.gain.valueAt(at) * bus.gain.valueAt(at);
  return chain * Math.sqrt(sumSquares);
}

const END_OF_15 = 15 * 60; // seconds on the audio clock when a 15-minute timer set at 0 ends

describe('the first tap (R6)', () => {
  it('a tile tap while stopped sets the session, creates and resumes the context synchronously, then generates and plays', () => {
    const { engine, deps } = setup();
    expect(engine.toggleLayer('white')).toBe('added');
    // Before any await and before any generation: session, context, resume, in that order.
    expect(deps.prepareSession).toHaveBeenCalledTimes(1);
    expect(deps.createContext).toHaveBeenCalledTimes(1);
    expect(deps.context.calls).toEqual(['resume']);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', preparing: ['white'], layers: [{ soundId: 'white', level: DEFAULT_LEVEL }] });

    deps.advance(100);
    expect(deps.generate).toHaveBeenCalledWith('white', 48_000);
    expect(deps.context.buffers).toEqual([{ length: 48_000, sampleRate: 48_000 }]);
    const [source] = deps.context.sources;
    expect(source?.loop).toBe(true);
    expect(source?.starts).toEqual([undefined]);
    expect(source?.stops).toEqual([]);
    expect(engine.getSnapshot().preparing).toEqual([]);
    // The layer plays at its level; the transport brings the sound in over 2 s from silence.
    const t = deps.context.currentTime;
    expect(deps.context.voiceGain(source!)?.gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(sliderGain(DEFAULT_LEVEL), 9);
    const { transport } = deps.context.graph;
    expect(transport.gain.valueAt(0)).toBe(0);
    expect(transport.gain.valueAt(START_FADE_SECONDS)).toBe(1);
    expect(transport.gain.valueAt(START_FADE_SECONDS / 2)).toBeCloseTo(0.5, 9);
  });

  it('builds one gain per job in order, with the limiter before the speaker', () => {
    const { context } = playing();
    const { bus, master, transport, sleep, cap } = context.graph;
    expect(bus.outputs).toEqual([master]);
    expect(master.outputs).toEqual([transport]);
    expect(transport.outputs).toEqual([sleep]);
    expect(sleep.outputs).toEqual([cap]);
    const [limiter] = context.compressors;
    expect(cap.outputs).toEqual([limiter]);
    expect(limiter?.outputs).toEqual([context.destination]);
    expect(limiter).toMatchObject({ threshold: { value: LIMITER.threshold }, ratio: { value: LIMITER.ratio }, attack: { value: LIMITER.attack } });
    expect(context.voiceGain(context.sources[0]!)?.outputs).toEqual([bus]);
    expect(cap.gain.value).toBe(capGain(DEFAULT_CAP));
    expect(master.gain.value).toBe(sliderGain(DEFAULT_MASTER));
    expect(sleep.gain.value).toBe(1);
  });

  it('refuses a seventh layer', () => {
    const { engine } = playing(['white', 'pink', 'brown', 'rain', 'wind', 'waves']);
    expect(engine.toggleLayer('shush')).toBe('full');
    expect(engine.getSnapshot().layers).toHaveLength(6);
  });

  it('a tile tap while paused only changes the selection; play then starts it', () => {
    const { engine, deps, context } = playing();
    engine.pause();
    expect(engine.toggleLayer('rain')).toBe('added');
    deps.advance(1000);
    expect(engine.getSnapshot()).toMatchObject({ status: 'paused', layers: [{ soundId: 'white' }, { soundId: 'rain' }] });
    expect(context.sources).toHaveLength(1);
    engine.play();
    deps.advance(100);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1]?.starts).toEqual([undefined]);
  });

  it('removing the last playing layer stops the sound with a short fade', () => {
    const { engine, deps, context } = playing();
    const t = context.currentTime;
    expect(engine.toggleLayer('white')).toBe('removed');
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', layers: [], endsAt: null });
    expect(context.sources[0]?.stops).toEqual([t + REMOVE_FADE_SECONDS + 0.05]);
    expect(context.graph.transport.gain.valueAt(t + REMOVE_FADE_SECONDS)).toBe(0);
    deps.advance(1000);
    expect(context.calls).toEqual(['resume', 'suspend']);
  });
});

describe('sliders, the bus and the cap (R1)', () => {
  it('the master slider moves the master gain only; the cap and the sleep gain stay', () => {
    const { engine, context } = playing();
    const { master, sleep, cap } = context.graph;
    const sleepCalls = sleep.gain.calls.length; // the default 60 dk timer was scheduled on play
    engine.setMaster(0.5);
    expect(engine.getSnapshot().master).toBe(0.5);
    expect(master.gain.valueAt(10)).toBeCloseTo(0.25, 6);
    expect(sleep.gain.calls).toHaveLength(sleepCalls);
    expect(cap.gain.calls).toEqual([]);
  });

  it('keeps two or six full layers no louder than one through the layer bus', () => {
    const { engine, deps, context } = playing(['white', 'pink']);
    engine.setLevel('white', 1);
    engine.setLevel('pink', 1);
    deps.advance(3000);
    expect(context.graph.bus.gain.valueAt(context.currentTime)).toBeCloseTo(busScale([1, 1]), 3);
    for (const id of ['brown', 'rain', 'wind', 'waves'] as const) {
      engine.toggleLayer(id);
      engine.setLevel(id, 1);
    }
    deps.advance(3000);
    expect(context.graph.bus.gain.valueAt(context.currentTime)).toBeCloseTo(busScale([1, 1, 1, 1, 1, 1]), 3);
  });

  it('the bus goes down at once and comes back up over 1.5 s when a layer leaves', () => {
    const { engine, deps, context } = playing(['white', 'pink']);
    engine.setLevel('white', 1);
    engine.setLevel('pink', 1);
    deps.advance(3000);
    const t = context.currentTime;
    engine.toggleLayer('pink');
    const { bus } = context.graph;
    expect(bus.gain.valueAt(t + REMOVE_FADE_SECONDS)).toBeCloseTo(busScale([1, 1]), 3);
    expect(bus.gain.valueAt(t + REMOVE_FADE_SECONDS + RISE_SECONDS)).toBeCloseTo(1, 9);
    expect(peakBetween(bus.gain, t, t + REMOVE_FADE_SECONDS + RISE_SECONDS)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('raising the cap lowers the master so that what plays stays the same, and nothing gets louder meanwhile', () => {
    const { engine, deps, context } = playing();
    deps.advance(3000);
    const t = context.currentTime;
    const { master, cap } = context.graph;
    const before = master.gain.valueAt(t) * cap.gain.valueAt(t);
    engine.setCap(1);
    expect(engine.getSnapshot().master).toBeCloseTo(0.3, 9);
    for (let at = t; at <= t + 5; at += 0.05) expect(master.gain.valueAt(at) * cap.gain.valueAt(at)).toBeLessThanOrEqual(before + 1e-6);
    expect(master.gain.valueAt(t + 5) * cap.gain.valueAt(t + 5)).toBeCloseTo(before, 4);
    expect(cap.gain.valueAt(t + RISE_SECONDS)).toBe(1);
    expect(cap.gain.valueAt(t + RISE_SECONDS / 2)).toBeLessThan(1);
  });

  it('a second cap raise, long after the first one settled, still shows no rise in what plays', () => {
    // cancelAndHoldAtTime alone does not anchor the real curve at `time` once the previous ramp has
    // already finished (W3C §1.6.9): without Param.hold also calling setValueAtTime, the next ramp would
    // interpolate from that old, long-past event instead, jumping almost straight to its target.
    const { engine, deps, context } = playing();
    engine.setCap(0.7);
    deps.advance(10 * MINUTE); // the first raise's ramp is long over: the last event on `cap` is old
    const t = context.currentTime;
    const { master, cap } = context.graph;
    const before = master.gain.valueAt(t) * cap.gain.valueAt(t);
    engine.setCap(1);
    for (let at = t; at <= t + RISE_SECONDS + 0.1; at += 0.05) {
      expect(master.gain.valueAt(at) * cap.gain.valueAt(at)).toBeLessThanOrEqual(before + 1e-6);
    }
    expect(cap.gain.valueAt(t + RISE_SECONDS)).toBeCloseTo(1, 9);
  });

  it('lowering the cap ramps it down over half a second and leaves the master where it is', () => {
    const { engine, context } = playing();
    const t = context.currentTime;
    engine.setCap(0.3);
    expect(engine.getSnapshot().master).toBe(DEFAULT_MASTER);
    const { cap, master } = context.graph;
    expect(cap.gain.valueAt(t + CAP_LOWER_SECONDS)).toBeCloseTo(capGain(0.3), 9);
    expect(cap.gain.valueAt(t + CAP_LOWER_SECONDS / 2)).toBeGreaterThan(capGain(0.3));
    expect(master.gain.calls).toEqual([]);
  });

  it('a cap outside 0.2–1 is clamped, and one set before the first tap reaches the graph', () => {
    const { engine, deps } = setup();
    engine.setCap(5);
    engine.toggleLayer('white');
    expect(deps.context.graph.cap.gain.value).toBe(1);
    engine.setCap(0);
    expect(deps.context.graph.cap.gain.valueAt(10)).toBeCloseTo(capGain(0.2), 9);
  });

  it('a layer level move touches its own gain only, and never the sleep gain', () => {
    const { engine, context } = playing();
    engine.setTimer(15);
    const { sleep } = context.graph;
    const calls = sleep.gain.calls.length;
    engine.setLevel('white', 0.2);
    const gain = context.voiceGain(context.sources[0]!)!.gain;
    expect(gain.valueAt(context.currentTime + 5)).toBeCloseTo(sliderGain(0.2), 6);
    expect(sleep.gain.calls).toHaveLength(calls);
    expect(engine.getSnapshot().layers).toEqual([{ soundId: 'white', level: 0.2 }]);
  });
});

describe('the sleep timer (R1, R2)', () => {
  it('starts with 60 dk selected; choosing a chip while stopped schedules nothing', () => {
    const { engine, deps } = setup();
    expect(engine.getSnapshot().timer).toBe(60);
    engine.setTimer(15);
    expect(engine.getSnapshot()).toMatchObject({ timer: 15, endsAt: null });
    expect(deps.createContext).not.toHaveBeenCalled();
    expect(deps.pendingTimers).toEqual([]);
  });

  it('on play, schedules the fade on the sleep gain alone, a silent sentinel, and a wall-clock timeout; no source gets a stop time', () => {
    const { engine, deps, context } = setup();
    engine.setTimer(15);
    engine.toggleLayer('white');
    deps.advance(100);
    expect(engine.getSnapshot().endsAt).toBe(WALL_START + 15 * MINUTE);
    const { sleep, master, transport } = context.graph;
    expect(sleep.gain.valueAt(END_OF_15 - FADE_SECONDS)).toBe(1);
    expect(sleep.gain.valueAt(END_OF_15 - FADE_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(sleep.gain.valueAt(END_OF_15)).toBe(0);
    expect(master.gain.calls).toEqual([]);
    expect(transport.gain.calls.filter((call) => call.startsWith('linear 0'))).toEqual([]);
    const [sentinel] = context.sentinels;
    expect(sentinel?.offset.value).toBe(0);
    expect(sentinel?.outputs).toEqual([sleep]);
    expect(sentinel?.stops).toEqual([END_OF_15]);
    expect(context.sources[0]?.stops).toEqual([]);
    expect(deps.pendingTimers).toEqual([15 * MINUTE - 100]);
  });

  it("the sentinel's end stops everything: the context is suspended and the sleep gain is ready for the next play", () => {
    const { engine, deps, context } = setup();
    engine.setTimer(15);
    engine.toggleLayer('white');
    deps.advance(100);
    context.sentinels[0]!.fireEnded();
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null, timer: 15, layers: [{ soundId: 'white' }] });
    expect(context.calls).toEqual(['resume', 'suspend']);
    expect(context.sources[0]?.stops).toEqual([undefined]);
    expect(context.graph.sleep.gain.valueAt(context.currentTime + 1)).toBe(1);
    expect(deps.pendingTimers).toEqual([EVICT_AFTER_MS + 1000]); // only the loop cache's eviction is left
  });

  it('the wall-clock timeout stops it too, and after it play starts a fresh countdown with the same chip', () => {
    const { engine, deps, context } = setup();
    engine.setTimer(15);
    engine.toggleLayer('white');
    deps.advance(15 * MINUTE);
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null, timer: 15 });
    engine.play();
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', endsAt: WALL_START + 30 * MINUTE });
    expect(context.sentinels).toHaveLength(2);
    expect(context.sentinels[1]?.stops).toEqual([context.currentTime + 15 * 60]);
  });

  it('rescheduling replaces the sentinel and ignores the stale one', () => {
    const { engine, deps, context } = playing();
    const before = context.sentinels.length; // one for the default 60 dk timer
    engine.setTimer(15);
    const first = context.sentinels.at(-1)!;
    engine.setTimer(30);
    expect(first.stops).toHaveLength(2); // stopped at once when replaced
    expect(first.onended).toBeNull();
    expect(context.sentinels).toHaveLength(before + 2);
    first.fireEnded();
    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().endsAt).toBe(deps.wall + 30 * MINUTE);
    const end = context.currentTime + 30 * 60;
    expect(context.graph.sleep.gain.valueAt(end - 1)).toBeCloseTo(1 / FADE_SECONDS, 9);
    expect(context.graph.sleep.gain.valueAt(end)).toBe(0);
  });

  it('a slider move during the timer leaves the fade in place and never raises any gain', () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    deps.advance(5 * MINUTE);
    const t = context.currentTime;
    const { master, sleep, transport, cap, bus } = context.graph;
    const before = master.gain.valueAt(t);
    engine.setMaster(0.3);
    expect(peakBetween(master.gain, t, t + 60)).toBeLessThanOrEqual(before + 1e-9);
    const end = t + 10 * 60;
    expect(sleep.gain.valueAt(end - FADE_SECONDS)).toBe(1);
    expect(sleep.gain.valueAt(end)).toBe(0);
    for (const param of [sleep, transport, cap, bus]) expect(peakBetween(param.gain, t, end)).toBeLessThanOrEqual(param.gain.valueAt(t) + 1e-9);
  });

  it('cancelling inside the fade holds the value where it is and comes back over 3 s', () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    deps.advance(15 * MINUTE - 10_000); // 10 s left: the fade is at 1/3
    const t = context.currentTime;
    const { sleep } = context.graph;
    expect(sleep.gain.valueAt(t)).toBeCloseTo(1 / 3, 6);
    engine.setTimer(null);
    expect(engine.getSnapshot()).toMatchObject({ timer: null, endsAt: null, status: 'playing' });
    expect(sleep.gain.valueAt(t)).toBeCloseTo(1 / 3, 6);
    expect(sleep.gain.valueAt(t + RECOVER_SECONDS / 2)).toBeCloseTo(2 / 3, 6);
    expect(sleep.gain.valueAt(t + RECOVER_SECONDS)).toBe(1);
    expect(context.sentinels[0]?.onended).toBeNull();
    expect(deps.pendingTimers).toEqual([]);
    deps.advance(20_000);
    expect(engine.getSnapshot().status).toBe('playing');
  });

  it('without cancelAndHoldAtTime, the engine holds the value it computes itself', () => {
    const { engine, deps, context } = playing(['white'], { holdSupported: false });
    engine.setTimer(15);
    deps.advance(15 * MINUTE - 10_000);
    const t = context.currentTime;
    const { sleep } = context.graph;
    engine.setTimer(null);
    expect(sleep.gain.calls).toContain(`cancel@${t}`);
    expect(sleep.gain.calls.some((call) => call.startsWith('set 0.3333'))).toBe(true);
    expect(sleep.gain.valueAt(t)).toBeCloseTo(1 / 3, 6);
    expect(sleep.gain.valueAt(t + RECOVER_SECONDS)).toBe(1);
  });

  it('pausing inside the fade fades the transport, leaves the sleep gain alone, and the countdown still ends on time', () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    const endsAt = deps.wall + 15 * MINUTE;
    deps.advance(15 * MINUTE - 10_000);
    const t = context.currentTime;
    const { sleep, transport } = context.graph;
    const sleepCalls = sleep.gain.calls.length;
    engine.pause();
    expect(engine.getSnapshot()).toMatchObject({ status: 'paused', endsAt });
    expect(transport.gain.valueAt(t + PAUSE_FADE_SECONDS)).toBe(0);
    expect(sleep.gain.calls).toHaveLength(sleepCalls);
    deps.advance(10_000);
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
  });

  it('paused for 5 minutes with 10 left: after resume the fade still ends at the original endsAt', () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    deps.advance(5 * MINUTE);
    engine.pause();
    deps.advance(5 * MINUTE);
    expect(context.state).toBe('suspended');
    engine.play();
    expect(context.calls.at(-1)).toBe('resume');
    const t = context.currentTime;
    const { sleep, transport } = context.graph;
    expect(sleep.gain.valueAt(t + 5 * 60 - FADE_SECONDS)).toBe(1);
    expect(sleep.gain.valueAt(t + 5 * 60)).toBe(0);
    expect(context.sentinels.at(-1)?.stops).toEqual([t + 5 * 60]);
    expect(transport.gain.valueAt(t)).toBe(0);
    expect(transport.gain.valueAt(t + START_FADE_SECONDS)).toBe(1);
    // The resume raises nothing but the transport's own fade-in (R1).
    const { bus, master, cap } = context.graph;
    for (const param of [bus, master, cap]) expect(peakBetween(param.gain, t, t + 10)).toBeLessThanOrEqual(param.gain.valueAt(t) + 1e-9);
    expect(peakBetween(sleep.gain, t, t + 10)).toBeLessThanOrEqual(1);
    deps.advance(5 * MINUTE);
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped' });
  });

  it('a layer added after the timer gets no stop time, fades in over 2 s, and the fade stays as it was', () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    const { sleep } = context.graph;
    const calls = sleep.gain.calls.length;
    const t = context.currentTime;
    engine.toggleLayer('rain');
    deps.advance(100); // the loop is generated 30 ms later, and the source starts then
    const source = context.sources[1]!;
    expect(source.stops).toEqual([]);
    const gain = context.voiceGain(source)!.gain;
    expect(gain.valueAt(t)).toBe(0);
    expect(gain.valueAt(t + 1)).toBeLessThan(sliderGain(DEFAULT_LEVEL) / 2);
    expect(gain.valueAt(t + 0.1 + START_FADE_SECONDS)).toBeCloseTo(sliderGain(DEFAULT_LEVEL), 9);
    expect(sleep.gain.calls).toHaveLength(calls);
    expect(context.sentinels).toHaveLength(2); // the default timer's, then this one; nothing new for the layer
  });

  it('an interruption that lasts past endsAt does not resume: stopped wins', async () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    const resumes = context.calls.filter((call) => call === 'resume').length;
    deps.wall += 20 * MINUTE; // iOS freezes JS timers during an interruption: the wall clock moves, no timeout fires
    engine.onVisible();
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
    expect(context.calls.filter((call) => call === 'resume')).toHaveLength(resumes);
  });
});

describe('pause, resume and interruptions (R14)', () => {
  it('pause fades the transport out and suspends afterwards; a play within the fade cancels the suspend', () => {
    const { engine, deps, context } = playing();
    engine.pause();
    expect(engine.getSnapshot().status).toBe('paused');
    expect(context.calls).toEqual(['resume']);
    deps.advance(100);
    engine.play();
    deps.advance(1000);
    expect(context.calls).toEqual(['resume', 'resume']);
    expect(engine.getSnapshot().status).toBe('playing');
    engine.pause();
    deps.advance(1000);
    expect(context.calls).toEqual(['resume', 'resume', 'suspend']);
  });

  it('a suspension by the system marks the sound interrupted and silent; becoming visible resumes it with a fade', async () => {
    const { engine, deps, context } = playing();
    deps.advance(3000);
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    const { transport } = context.graph;
    expect(transport.gain.valueAt(context.currentTime + 1)).toBe(0);
    engine.onVisible();
    expect(context.calls).toEqual(['resume', 'resume']);
    await flush();
    expect(engine.getSnapshot().status).toBe('playing');
    const t = context.currentTime;
    expect(transport.gain.valueAt(t)).toBe(0);
    expect(transport.gain.valueAt(t + START_FADE_SECONDS)).toBe(1);
    const { bus, master, cap, sleep } = context.graph;
    for (const param of [bus, master, cap]) expect(peakBetween(param.gain, t, t + 10)).toBeLessThanOrEqual(param.gain.valueAt(t) + 1e-9);
    expect(peakBetween(sleep.gain, t, t + 10)).toBeLessThanOrEqual(1);
  });

  it('the session says active while the context already runs: the sound still comes back', async () => {
    const { engine, context } = playing();
    await flush(); // drain the initial play()'s own pending resume().then(), so only this test's own resume reconciles below
    engine.onSessionState('interrupted');
    expect(engine.getSnapshot().status).toBe('interrupted');
    expect(context.state).toBe('running'); // no statechange will ever fire
    engine.onSessionState('active');
    await flush();
    expect(engine.getSnapshot().status).toBe('playing');
  });

  it('play while paused with an expired timer stops without resuming the context (R2)', () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    engine.pause();
    deps.advance(1000);
    const resumes = context.calls.filter((call) => call === 'resume').length;
    deps.wall += 20 * MINUTE; // the wall clock jumps (the timer's own timeout has not run)
    engine.play();
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
    expect(context.calls.filter((call) => call === 'resume')).toHaveLength(resumes);
  });

  it('the audio session says interrupted, then active', async () => {
    const { engine, context } = playing();
    await flush(); // drain the initial play()'s own pending resume().then(), so only this test's own resume reconciles below
    engine.onSessionState('interrupted');
    expect(engine.getSnapshot().status).toBe('interrupted');
    engine.onSessionState('active');
    expect(context.calls).toEqual(['resume', 'resume']);
    await flush();
    expect(engine.getSnapshot().status).toBe('playing');
  });

  it('"Devam et" (play while interrupted) resumes in the tap itself', async () => {
    const { engine, deps, context } = playing();
    context.interrupt();
    await flush();
    engine.play();
    expect(deps.prepareSession).toHaveBeenCalledTimes(2);
    expect(context.calls).toEqual(['resume', 'resume']);
    expect(engine.getSnapshot().status).toBe('playing');
  });

  it('stop forgets the countdown, stops and disconnects the sources, and suspends', () => {
    const { engine, deps, context } = playing(['white', 'rain']);
    engine.setTimer(30);
    engine.stop();
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null, timer: 30, layers: [{ soundId: 'white' }, { soundId: 'rain' }] });
    for (const source of context.sources) {
      expect(source.stops).toEqual([undefined]);
      expect(source.disconnected).toBe(true);
    }
    expect(context.calls).toEqual(['resume', 'suspend']);
    expect(deps.pendingTimers).toEqual([EVICT_AFTER_MS + 1000]);
  });

  it('the session says active with an expired timer while interrupted: stopped wins, no resume', () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    engine.onSessionState('interrupted');
    expect(engine.getSnapshot().status).toBe('interrupted');
    const resumes = context.calls.filter((call) => call === 'resume').length;
    deps.wall += 20 * MINUTE; // iOS freezes JS timers during an interruption
    engine.onSessionState('active');
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
    expect(context.calls.filter((call) => call === 'resume')).toHaveLength(resumes);
  });

  it('does not suspend a context that is not running: an interruption already took it away', async () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    const before = [...context.calls];
    deps.advance(15 * MINUTE); // the wall-clock timeout still fires; the context stays 'interrupted' throughout
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
    expect(context.calls).toEqual(before); // no new suspend() call: the context was never 'running'
  });

  it('finishTimer during an interruption suspends the context once it wakes on its own (no silent awake context)', async () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    deps.advance(15 * MINUTE); // the wall-clock timeout fires; suspend() no-ops since the context is not 'running'
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
    expect(context.calls).not.toContain('suspend');
    context.endInterruption(); // the system lets the context run again on its own, unasked
    await flush();
    expect(context.calls.at(-1)).toBe('suspend');
    expect(context.state).toBe('suspended');
  });

  it("onSessionState('active') suspends a context that reads running with no statechange fired (no silent awake context)", async () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    deps.advance(15 * MINUTE); // the wall-clock timeout fires; suspend() no-ops since the context is not 'running'
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
    expect(context.calls).not.toContain('suspend');
    context.state = 'running'; // the audioSession and the AudioContext can disagree: no onstatechange fires from this
    engine.onSessionState('active');
    expect(context.calls.at(-1)).toBe('suspend');
  });
});

describe('mixes and the last selection (R7)', () => {
  it('loadMix skips unknown ids, refuses a mix with none left, and crossfades over 2 s while playing', () => {
    const { engine, deps, context } = playing(['white']);
    expect(engine.loadMix([{ soundId: 'train', gain: 0.5 }])).toBe('empty');
    expect(engine.getSnapshot().layers).toEqual([{ soundId: 'white', level: DEFAULT_LEVEL }]);
    deps.advance(3000);
    const t = context.currentTime;
    expect(engine.loadMix([{ soundId: 'train', gain: 0.5 }, { soundId: 'rain', gain: 0.4 }, { soundId: 'rain', gain: 0.9 }])).toBe('started');
    expect(engine.getSnapshot().layers).toEqual([{ soundId: 'rain', level: 0.4 }]);
    const old = context.voiceGain(context.sources[0]!)!.gain;
    expect(old.valueAt(t + START_FADE_SECONDS)).toBe(0);
    expect(context.sources[0]?.stops).toEqual([t + START_FADE_SECONDS + 0.05]);
    deps.advance(100);
    const fresh = context.voiceGain(context.sources[1]!)!.gain;
    expect(fresh.valueAt(context.currentTime + START_FADE_SECONDS)).toBeCloseTo(sliderGain(0.4), 9);
  });

  it('loadMix raising a shared layer long after it started ramps over START_FADE_SECONDS, not an instant jump', () => {
    // The layer's gain has no automation events at all yet (it started at fade 0, straight to its level):
    // exactly the case where a bare cancelAndHoldAtTime leaves the real curve untouched (W3C §1.6.9).
    const { engine, deps, context } = playing(['white']);
    deps.advance(10 * MINUTE);
    const t = context.currentTime;
    expect(engine.loadMix([{ soundId: 'white', gain: 1 }])).toBe('started');
    const gain = context.voiceGain(context.sources[0]!)!.gain;
    expect(gain.valueAt(t)).toBeCloseTo(sliderGain(DEFAULT_LEVEL), 6);
    const mid = (sliderGain(DEFAULT_LEVEL) + sliderGain(1)) / 2;
    expect(gain.valueAt(t + START_FADE_SECONDS / 2)).toBeCloseTo(mid, 2);
    expect(gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(sliderGain(1), 9);
  });

  it('loadMix while playing keeps the total output from overshooting while old layers still fade out', () => {
    const six = ['white', 'pink', 'brown', 'rain', 'wind', 'waves'] as const;
    const { engine, deps, context } = playing(six);
    for (const id of six) engine.setLevel(id, 1);
    deps.advance(3000);
    const t = context.currentTime;
    const before = totalPower(context, t); // six full layers: exactly at the safety ceiling (master² × cap²)
    expect(engine.loadMix([{ soundId: 'white', gain: 1 }])).toBe('started');
    const settled = t + START_FADE_SECONDS + RISE_SECONDS + 0.1;
    for (let at = t; at <= settled; at += 0.02) {
      expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-3);
    }
    expect(totalPower(context, settled)).toBeCloseTo(before, 3); // one full layer alone: back at the same ceiling
  });

  it('a setLevel move during a loadMix crossfade must not let the bus rise before old layers are gone', () => {
    const six = ['white', 'pink', 'brown', 'rain', 'wind', 'waves'] as const;
    const { engine, deps, context } = playing(six);
    for (const id of six) engine.setLevel(id, 1);
    deps.advance(3000);
    const t = context.currentTime;
    const before = totalPower(context, t);
    expect(engine.loadMix([{ soundId: 'white', gain: 1 }])).toBe('started');
    engine.setLevel('white', 0.95); // a lowering move, in the same tick the crossfade starts; applyBus(0) must not re-hold and rise early
    deps.advance(100);
    const settled = t + START_FADE_SECONDS + RISE_SECONDS + 0.2;
    for (let at = t; at <= settled; at += 0.02) {
      expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-3);
    }
  });

  it('a generator failure during a loadMix crossfade must not let the bus rise before old layers are gone', () => {
    const six = ['white', 'pink', 'brown', 'rain', 'wind', 'waves'] as const;
    const { engine, deps, context } = playing(six);
    for (const id of six) engine.setLevel(id, 1);
    deps.advance(3000);
    const t = context.currentTime;
    const before = totalPower(context, t);
    deps.generate.mockImplementationOnce(() => {
      throw new RangeError('Array buffer allocation failed');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(engine.loadMix([{ soundId: 'white', gain: 1 }, { soundId: 'heartbeat', gain: 1 }])).toBe('started');
    deps.advance(100); // heartbeat's generation runs from a timer and throws: its tile goes back to off
    expect(engine.getSnapshot().layers).toEqual([{ soundId: 'white', level: 1 }]);
    const settled = t + START_FADE_SECONDS + RISE_SECONDS + 0.2;
    for (let at = t; at <= settled; at += 0.02) {
      expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-3);
    }
    error.mockRestore();
  });

  it('loadMix shortly after pausing must not start new voices before the transport is truly silent', () => {
    const six = ['white', 'pink', 'brown', 'rain', 'wind', 'waves'] as const;
    const { engine, deps, context } = playing(six); // caches every loop, so a later restart is instant
    for (const id of six) engine.setLevel(id, 1);
    deps.advance(3000); // let the transport's own fade-in and the levels settle
    for (const id of ['pink', 'brown', 'rain', 'wind', 'waves'] as const) engine.toggleLayer(id); // down to one full layer; the loops stay cached
    deps.advance(2500); // let those removals' own fades and the bus's own rise (0.3 s + 1.5 s) settle
    const before = totalPower(context, context.currentTime);
    engine.pause();
    deps.advance(100); // 0.1 s into the 0.3 s pause fade: the transport is still well above 0
    expect(engine.loadMix(six.map((soundId) => ({ soundId, gain: 1 })))).toBe('started');
    const t = context.currentTime;
    expect(totalPower(context, t)).toBeLessThanOrEqual(before + 1e-3); // no instant jump right when the new voices start
    for (let at = t; at <= t + START_FADE_SECONDS + 0.1; at += 0.02) expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-3);
    deps.advance(2100); // past the transport's own fade-in
    expect(totalPower(context, context.currentTime)).toBeCloseTo(before, 3); // six full layers: the same ceiling
  });

  it('loadMix shortly after removing the last tile must not start new voices before the transport is truly silent', () => {
    const six = ['white', 'pink', 'brown', 'rain', 'wind', 'waves'] as const;
    const { engine, deps, context } = playing(six);
    for (const id of six) engine.setLevel(id, 1);
    deps.advance(3000);
    for (const id of ['pink', 'brown', 'rain', 'wind', 'waves'] as const) engine.toggleLayer(id);
    deps.advance(2500);
    const before = totalPower(context, context.currentTime);
    expect(engine.toggleLayer('white')).toBe('removed'); // the last tile: stop(REMOVE_FADE_SECONDS)
    deps.advance(100); // 0.1 s into the 0.3 s stop fade: white's own fading tail is still audible
    expect(engine.loadMix(six.map((soundId) => ({ soundId, gain: 1 })))).toBe('started');
    const t = context.currentTime;
    for (let at = t; at <= t + START_FADE_SECONDS + 0.1; at += 0.02) expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-3);
    deps.advance(2100);
    expect(totalPower(context, context.currentTime)).toBeCloseTo(before, 3);
  });

  it('loadMix to a single layer shortly after removing the last tile must not step before the fading tail is gone', () => {
    const six = ['white', 'pink', 'brown', 'rain', 'wind', 'waves'] as const;
    const { engine, deps, context } = playing(six);
    for (const id of six) engine.setLevel(id, 1);
    deps.advance(3000);
    for (const id of ['pink', 'brown', 'rain', 'wind', 'waves'] as const) engine.toggleLayer(id);
    deps.advance(2500);
    const before = totalPower(context, context.currentTime);
    expect(engine.toggleLayer('white')).toBe('removed');
    deps.advance(50); // 50 ms into the 0.3 s stop fade: white's own fading tail is still audible
    expect(engine.loadMix([{ soundId: 'pink', gain: 1 }])).toBe('started');
    const t = context.currentTime;
    for (let at = t; at <= t + START_FADE_SECONDS + 0.1; at += 0.02) {
      expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-3);
    }
    deps.advance(2100);
    expect(totalPower(context, context.currentTime)).toBeCloseTo(before, 3);
  });

  it('loadMix starting an already-cached voice ramps it in over START_FADE_SECONDS, not an instant jump', () => {
    const { engine, deps, context } = playing(['white']);
    engine.toggleLayer('rain'); // caches rain's loop
    deps.advance(100);
    engine.toggleLayer('rain'); // removes it again; the loop stays cached
    deps.advance(3000);
    const t = context.currentTime;
    expect(engine.loadMix([{ soundId: 'white', gain: DEFAULT_LEVEL }, { soundId: 'rain', gain: 1 }])).toBe('started');
    expect(deps.generate).toHaveBeenCalledTimes(2); // no new generation: the loop was already cached
    const source = context.sources.at(-1)!;
    const gain = context.voiceGain(source)!.gain;
    expect(gain.valueAt(t)).toBe(0);
    expect(gain.valueAt(t + START_FADE_SECONDS / 2)).toBeLessThan(sliderGain(1) / 2 + 0.05);
    expect(gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(sliderGain(1), 9);
  });

  it('toggleLayer re-adding a cached layer while playing ramps it in over START_FADE_SECONDS, not an instant jump', () => {
    const { engine, deps, context } = playing(['white', 'rain']);
    expect(engine.toggleLayer('rain')).toBe('removed'); // the loop stays cached
    deps.advance(3000);
    const t = context.currentTime;
    expect(engine.toggleLayer('rain')).toBe('added'); // re-added while playing: no generation needed
    expect(deps.generate).toHaveBeenCalledTimes(2);
    const source = context.sources.at(-1)!;
    const gain = context.voiceGain(source)!.gain;
    expect(gain.valueAt(t)).toBe(0);
    expect(gain.valueAt(t + START_FADE_SECONDS / 2)).toBeLessThan(sliderGain(DEFAULT_LEVEL) / 2 + 0.05);
    expect(gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(sliderGain(DEFAULT_LEVEL), 9);
  });

  it('loadMix while playing unlocks the context again, even though sound already plays', () => {
    const { engine, deps, context } = playing(['white']);
    const resumesBefore = context.calls.filter((call) => call === 'resume').length;
    const prepareBefore = deps.prepareSession.mock.calls.length;
    expect(engine.loadMix([{ soundId: 'rain', gain: 0.5 }])).toBe('started');
    expect(deps.prepareSession.mock.calls.length).toBe(prepareBefore + 1);
    expect(context.calls.filter((call) => call === 'resume').length).toBe(resumesBefore + 1);
  });

  it('loadMix while paused rescales the layer bus before the new layers play (R4)', () => {
    const { engine, deps, context } = playing(['white']);
    engine.pause();
    deps.advance(1000);
    const t = context.currentTime;
    const six = ['white', 'pink', 'brown', 'rain', 'wind', 'waves'].map((soundId) => ({ soundId, gain: 1 }));
    expect(engine.loadMix(six)).toBe('started');
    deps.advance(100);
    const { bus } = context.graph;
    expect(bus.gain.valueAt(t + 1)).toBeCloseTo(busScale([1, 1, 1, 1, 1, 1]), 3);
    expect(peakBetween(bus.gain, t, t + 5)).toBeLessThanOrEqual(1 + 1e-9);
    expect(context.sources).toHaveLength(7);
  });

  it('a generator that throws takes its tile back to off and lets the next sound through', () => {
    const { engine, deps, context } = setup();
    deps.generate.mockImplementationOnce(() => {
      throw new RangeError('Array buffer allocation failed');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    engine.toggleLayer('white');
    engine.toggleLayer('rain');
    deps.advance(100);
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', layers: [{ soundId: 'rain' }], preparing: [] });
    expect(context.sources).toHaveLength(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('loadMix while stopped unlocks the context in the tap and starts the mix', () => {
    const { engine, deps } = setup();
    expect(engine.loadMix([{ soundId: 'white', gain: 0.5 }, { soundId: 'pink', gain: 0.6 }])).toBe('started');
    expect(deps.context.calls).toEqual(['resume']);
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', layers: [{ soundId: 'white', level: 0.5 }, { soundId: 'pink', level: 0.6 }] });
  });

  it('loadMix while paused with an expired timer ends stopped, not "started"', () => {
    const { engine, deps } = playing();
    engine.setTimer(15);
    engine.pause();
    deps.advance(1000);
    deps.wall += 20 * MINUTE; // iOS freezes JS timers: the wall clock jumps, no timeout fires
    expect(engine.loadMix([{ soundId: 'rain', gain: 0.5 }])).toBe('stopped');
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null, layers: [{ soundId: 'rain', level: 0.5 }] });
  });

  it('loadMix while interrupted with an expired timer stops without resuming the context (R2)', async () => {
    const { engine, deps, context } = playing();
    engine.setTimer(15);
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    const resumes = context.calls.filter((call) => call === 'resume').length;
    deps.wall += 20 * MINUTE;
    expect(engine.loadMix([{ soundId: 'rain', gain: 0.5 }])).toBe('stopped');
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null, layers: [{ soundId: 'rain', level: 0.5 }] });
    expect(context.calls.filter((call) => call === 'resume')).toHaveLength(resumes);
  });

  it("the only layer's generator throwing stops cleanly instead of a silent \"playing\" with nothing left", () => {
    const { engine, deps } = setup();
    deps.generate.mockImplementationOnce(() => {
      throw new RangeError('Array buffer allocation failed');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    engine.setTimer(15);
    engine.toggleLayer('white');
    deps.advance(100);
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null, layers: [] });
    expect(deps.pendingTimers).toEqual([]); // no loop was ever cached; the timer was cleared with the stop
    error.mockRestore();
  });

  it('restore keeps known, unique ids up to six with clamped levels and never creates a context', () => {
    const { engine, deps } = setup();
    engine.restore(
      {
        layers: [
          { soundId: 'white', level: 2 },
          { soundId: 'train', level: 0.5 },
          { soundId: 'white', level: 0.1 },
          { soundId: 'pink', level: -1 },
        ],
        master: 0.4,
        timer: null,
      },
      0.8,
    );
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', layers: [{ soundId: 'white', level: 1 }, { soundId: 'pink', level: 0 }], master: 0.4, timer: null });
    expect(deps.createContext).not.toHaveBeenCalled();
    engine.play();
    expect(deps.context.graph.cap.gain.value).toBe(capGain(0.8));
    expect(deps.context.graph.master.gain.value).toBe(sliderGain(0.4));
  });

  it('restore does nothing once the graph already exists', () => {
    const { engine, deps } = setup();
    engine.toggleLayer('white'); // builds the graph
    deps.advance(100);
    const before = engine.getSnapshot();
    engine.restore({ layers: [{ soundId: 'pink', level: 0.9 }], master: 0.1, timer: 30 }, 0.9);
    expect(engine.getSnapshot()).toBe(before);
    expect(deps.context.graph.cap.gain.value).not.toBe(capGain(0.9));
  });

  it('restore falls back to the default timer chip when the saved value is not a valid choice', () => {
    const { engine } = setup();
    engine.restore({ layers: [], master: 0.5, timer: 45 as unknown as TimerChoice }, 0.5);
    expect(engine.getSnapshot().timer).toBe(DEFAULT_TIMER);
  });
});

describe('memory and the store (R13, R19)', () => {
  it('drops a loop idle for five minutes and generates it again when needed', () => {
    const { engine, deps } = playing();
    expect(deps.generate).toHaveBeenCalledTimes(1);
    engine.stop();
    engine.play();
    deps.advance(100);
    expect(deps.generate).toHaveBeenCalledTimes(1); // still cached
    engine.stop();
    deps.advance(EVICT_AFTER_MS + 2000);
    engine.play();
    deps.advance(100);
    expect(deps.generate).toHaveBeenCalledTimes(2);
  });

  it('caches per sample rate', () => {
    const { deps } = playing(['white'], { sampleRate: 44_100 });
    expect(deps.generate).toHaveBeenCalledWith('white', 44_100);
    expect(deps.context.buffers).toEqual([{ length: 44_100, sampleRate: 44_100 }]);
  });

  it('getSnapshot returns the same object until something changes, and notifies subscribers once per change', () => {
    const { engine, deps } = playing();
    let notified = 0;
    const unsubscribe = engine.subscribe(() => {
      notified += 1;
    });
    const before = engine.getSnapshot();
    engine.setLevel('rain', 0.5); // not a layer: nothing changes
    engine.setCap(DEFAULT_CAP);
    deps.advance(10_000);
    expect(engine.getSnapshot()).toBe(before);
    expect(notified).toBe(0);
    engine.setMaster(0.5);
    expect(engine.getSnapshot()).not.toBe(before);
    expect(notified).toBe(1);
    unsubscribe();
    engine.setMaster(0.6);
    expect(notified).toBe(1);
  });
});
