import { describe, expect, it, vi } from 'vitest';
import {
  CAP_LOWER_SECONDS,
  EVICT_AFTER_MS,
  LIMITER,
  PAUSE_FADE_SECONDS,
  RISE_SECONDS,
  START_FADE_SECONDS,
  SWITCH_FADE_SECONDS,
  createSoundEngine,
  type SoundEngine,
} from '../../src/audio/engine';
import type { BufferLike } from '../../src/audio/graph';
import {
  DEFAULT_TIMER,
  FADE_SECONDS,
  RECOVER_SECONDS,
  type TimerChoice,
} from '../../src/audio/timer';
import {
  DEFAULT_CAP,
  DEFAULT_MASTER,
  VOICE_LEVEL,
  capGain,
  sliderGain,
} from '../../src/audio/volume';
import type { SoundId } from '../../src/domain/sounds';
import { MINUTE } from '../../src/domain/time';
import {
  FakeDeps,
  FakeParam,
  WALL_START,
  flush,
  type FakeContext,
  type FakeContextOptions,
} from '../support/fake-audio';

function setup(options: FakeContextOptions = {}): {
  engine: SoundEngine;
  deps: FakeDeps;
  context: FakeContext;
} {
  const deps = new FakeDeps(options);
  return { engine: createSoundEngine(deps), deps, context: deps.context };
}

/** A playing engine with `id` selected and its file loaded (one microtask flush), its source started. */
async function playing(id: SoundId = 'white', options: FakeContextOptions = {}) {
  const { engine, deps, context } = setup(options);
  engine.select(id);
  await flush();
  return { engine, deps, context };
}

/** Makes every load wait until the test resolves or rejects it, in call order. */
function deferLoads(deps: FakeDeps) {
  const waiting: {
    id: SoundId;
    resolve: (buffer: BufferLike) => void;
    reject: (error: unknown) => void;
  }[] = [];
  deps.load.mockImplementation(
    (_context, id) =>
      new Promise<BufferLike>((resolve, reject) => waiting.push({ id, resolve, reject })),
  );
  return waiting;
}

/** The largest value of `param` over [from, to], sampled every 50 ms: no gain may rise above what the parent asked for. */
function peakBetween(param: FakeParam, from: number, to: number): number {
  let max = -Infinity;
  for (let t = from; t <= to + 1e-9; t += 0.05) max = Math.max(max, param.valueAt(t));
  return max;
}

/**
 * The engine's actual output at audio-clock time `at`: master × transport × sleep × cap × Σ voice gains.
 * Every source contributes, a fading-out one included, since the engine itself has already forgotten it.
 * With at most two voices (a switch's overlap), the plain sum is what must stay at or below one voice.
 */
function totalPower(context: FakeContext, at: number): number {
  const voices = context.sources.reduce(
    (total, source) => total + (context.voiceGain(source)?.gain.valueAt(at) ?? 0),
    0,
  );
  const { master, transport, sleep, cap } = context.graph;
  const chain =
    master.gain.valueAt(at) *
    transport.gain.valueAt(at) *
    sleep.gain.valueAt(at) *
    cap.gain.valueAt(at);
  return chain * voices;
}

const END_OF_15 = 15 * 60; // seconds on the audio clock when a 15-minute timer set at 0 ends

describe('the first tap (R6)', () => {
  it('a tile tap while stopped sets the session, creates and resumes the context synchronously, then loads and plays', async () => {
    const { engine, deps } = setup();
    engine.select('white');
    // Before any await: session, context, resume, then the load request.
    expect(deps.prepareSession).toHaveBeenCalledTimes(1);
    expect(deps.createContext).toHaveBeenCalledTimes(1);
    expect(deps.context.calls).toEqual(['resume']);
    expect(deps.load).toHaveBeenCalledWith(deps.context, 'white');
    expect(engine.getSnapshot()).toMatchObject({
      status: 'playing',
      current: 'white',
      loading: 'white',
    });

    await flush();
    expect(engine.getSnapshot().loading).toBeNull();
    const [source] = deps.context.sources;
    expect(source?.loop).toBe(true);
    expect(source?.starts).toEqual([undefined]);
    expect(source?.stops).toEqual([]);
    const t = deps.context.currentTime;
    // The voice fades in to its fixed level (R3) while the transport brings the sound in from silence.
    expect(deps.context.voiceGain(source!)?.gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(
      sliderGain(VOICE_LEVEL),
      9,
    );
    const { transport } = deps.context.graph;
    expect(transport.gain.valueAt(0)).toBe(0);
    expect(transport.gain.valueAt(START_FADE_SECONDS)).toBe(1);
    expect(transport.gain.valueAt(START_FADE_SECONDS / 2)).toBeCloseTo(0.5, 9);
  });

  it('builds one gain per job in order, with the limiter before the speaker', async () => {
    const { context } = await playing();
    const { master, transport, sleep, cap } = context.graph;
    expect(master.outputs).toEqual([transport]);
    expect(transport.outputs).toEqual([sleep]);
    expect(sleep.outputs).toEqual([cap]);
    const [limiter] = context.compressors;
    expect(cap.outputs).toEqual([limiter]);
    expect(limiter?.outputs).toEqual([context.destination]);
    expect(limiter).toMatchObject({
      threshold: { value: LIMITER.threshold },
      ratio: { value: LIMITER.ratio },
      attack: { value: LIMITER.attack },
    });
    expect(context.voiceGain(context.sources[0]!)?.outputs).toEqual([master]);
    expect(cap.gain.value).toBe(capGain(DEFAULT_CAP));
    expect(master.gain.value).toBe(sliderGain(DEFAULT_MASTER));
    expect(sleep.gain.value).toBe(1);
  });
});

describe('one sound at a time (R4, R7)', () => {
  it('selecting another sound crossfades: the old voice fades out as the new one fades in, never louder than one', async () => {
    const { engine, deps, context } = await playing('white');
    deps.advance(5000);
    const t = context.currentTime;
    engine.select('train');
    expect(engine.getSnapshot()).toMatchObject({ current: 'train', status: 'playing' });
    await flush();

    expect(context.sources).toHaveLength(2);
    const [oldSource, newSource] = context.sources;
    expect(oldSource?.stops).toEqual([t + SWITCH_FADE_SECONDS + 0.05]);
    const oldGain = context.voiceGain(oldSource!)!.gain;
    const newGain = context.voiceGain(newSource!)!.gain;
    const level = sliderGain(VOICE_LEVEL);
    expect(newSource?.starts).toEqual([undefined]);
    for (let s = 0; s <= SWITCH_FADE_SECONDS + 1e-9; s += 0.25) {
      expect(oldGain.valueAt(t + s) + newGain.valueAt(t + s)).toBeLessThanOrEqual(level + 1e-9);
    }
    expect(oldGain.valueAt(t + SWITCH_FADE_SECONDS)).toBeCloseTo(0, 9);
    expect(newGain.valueAt(t + SWITCH_FADE_SECONDS)).toBeCloseTo(level, 9);
  });

  it('a tap on the playing sound pauses it, a tap on it again resumes it', async () => {
    const { engine } = await playing('white');
    engine.select('white');
    expect(engine.getSnapshot().status).toBe('paused');
    engine.select('white');
    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().current).toBe('white');
  });

  it('a tap on another sound while paused switches to it and plays', async () => {
    const { engine, deps, context } = await playing('white');
    engine.pause();
    deps.advance(1000);
    engine.select('waves');
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', current: 'waves' });
    expect(context.sources[0]?.stops).toEqual([undefined]); // the paused voice goes at once: the transport is silent
    await flush();
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1]?.starts).toEqual([undefined]);
  });

  it('a tap on the current sound after a stop plays it again with the same chip', async () => {
    const { engine, deps } = await playing('white');
    engine.stop();
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', current: 'white' });
    engine.select('white');
    expect(engine.getSnapshot().status).toBe('playing');
    deps.advance(100);
    expect(deps.load).toHaveBeenCalledTimes(1); // still cached
  });

  it('while interrupted with an expired timer, selecting another sound moves the selection but stays stopped (R2)', async () => {
    const { engine, deps, context } = await playing('white');
    engine.setTimer(15);
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    deps.wall += 16 * MINUTE; // iOS freezes JS timers during an interruption: the wall clock moves, no timeout fires
    engine.select('train');
    expect(engine.getSnapshot()).toMatchObject({
      status: 'stopped',
      current: 'train',
      endsAt: null,
    });
    expect(context.calls.filter((call) => call === 'resume')).toHaveLength(1);
  });

  it('selecting another sound while playing unlocks the context again, even though sound already plays', async () => {
    const { engine, deps, context } = await playing('white');
    const resumesBefore = context.calls.filter((call) => call === 'resume').length;
    const prepareBefore = deps.prepareSession.mock.calls.length;
    engine.select('train');
    expect(deps.prepareSession.mock.calls.length).toBe(prepareBefore + 1);
    expect(context.calls.filter((call) => call === 'resume').length).toBe(resumesBefore + 1);
  });

  it('switching back to a cached sound while playing ramps it in over START_FADE_SECONDS, not an instant jump', async () => {
    const { engine, deps, context } = await playing('white');
    engine.select('train');
    await flush();
    deps.advance(3000);
    const t = context.currentTime;
    engine.select('white'); // cached: it starts in this call
    expect(deps.load).toHaveBeenCalledTimes(2);
    const source = context.sources.at(-1)!;
    const gain = context.voiceGain(source)!.gain;
    expect(gain.valueAt(t)).toBe(0);
    expect(gain.valueAt(t + START_FADE_SECONDS / 2)).toBeCloseTo(sliderGain(VOICE_LEVEL) / 2, 9);
    expect(gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(sliderGain(VOICE_LEVEL), 9);
  });

  it('a switch while playing keeps the total output from overshooting while the old voice fades out', async () => {
    const { engine, deps, context } = await playing('white');
    engine.select('train');
    await flush();
    deps.advance(3000); // both loops cached, the first crossfade and the start fade over
    const t = context.currentTime;
    const before = totalPower(context, t);
    engine.select('white');
    const settled = t + SWITCH_FADE_SECONDS + 0.1;
    for (let at = t; at <= settled; at += 0.02) {
      expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-9);
    }
    expect(totalPower(context, settled)).toBeCloseTo(before, 9);
  });

  it('a switch shortly after pausing starts the new voice only once the transport is truly silent', async () => {
    const { engine, deps, context } = await playing('white');
    engine.select('train'); // caches train's loop
    await flush();
    deps.advance(3000);
    const before = totalPower(context, context.currentTime);
    engine.pause();
    deps.advance(100); // 0.1 s into the 0.3 s pause fade: the transport is still well above 0
    const t = context.currentTime;
    expect(context.graph.transport.gain.valueAt(t)).toBeGreaterThan(0.5);
    const sources = context.sources.length;
    engine.select('white'); // cached: it starts in this call, at its full level
    expect(context.sources).toHaveLength(sources + 1);
    const { transport } = context.graph;
    expect(transport.gain.valueAt(t)).toBe(0);
    for (let at = t; at <= t + START_FADE_SECONDS + 0.5; at += 0.02) {
      expect(transport.gain.valueAt(at)).toBeLessThanOrEqual(
        Math.min(1, (at - t) / START_FADE_SECONDS) + 1e-9,
      );
      expect(totalPower(context, at)).toBeLessThanOrEqual(before + 1e-9);
    }
    deps.advance(2100); // past the transport's own fade-in
    expect(totalPower(context, context.currentTime)).toBeCloseTo(before, 9);
  });
});

describe('loading and unavailable sounds (R8)', () => {
  it('shows loading until the file is ready, then starts the voice with a fade', async () => {
    const { engine, deps, context } = setup();
    const waiting = deferLoads(deps);
    engine.select('white');
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', loading: 'white' });
    expect(context.sources).toHaveLength(0);
    waiting[0]!.resolve(context.createBuffer(1, 100, 48_000));
    await flush();
    expect(engine.getSnapshot().loading).toBeNull();
    expect(context.sources).toHaveLength(1);
  });

  it('ignores a file that arrives after the parent chose another sound, but keeps it cached', async () => {
    const { engine, deps, context } = setup();
    const waiting = deferLoads(deps);
    engine.select('white');
    engine.select('train');
    expect(engine.getSnapshot()).toMatchObject({ current: 'train', loading: 'train' });
    waiting[0]!.resolve(context.createBuffer(1, 100, 48_000));
    await flush();
    expect(context.sources).toHaveLength(0);
    expect(engine.getSnapshot().loading).toBe('train');
    waiting[1]!.resolve(context.createBuffer(1, 100, 48_000));
    await flush();
    expect(context.sources).toHaveLength(1);
    expect(engine.getSnapshot().loading).toBeNull();
    engine.select('white'); // cached: no second load
    expect(deps.load).toHaveBeenCalledTimes(2);
  });

  it('a file that fails to load marks the sound unavailable, clears the selection and stops cleanly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { engine, deps, context } = setup();
    const waiting = deferLoads(deps);
    engine.select('train');
    waiting[0]!.reject(new Error('HTTP 404'));
    await flush();
    expect(engine.getSnapshot()).toMatchObject({
      status: 'stopped',
      current: null,
      loading: null,
      endsAt: null,
      unavailable: ['train'],
    });
    expect(context.sources).toHaveLength(0);
    expect(error).toHaveBeenCalled();
    error.mockRestore();

    engine.select('train'); // does nothing: the tile is unavailable
    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().status).toBe('stopped');
  });

  it('another sound still works after one failed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { engine, deps } = setup();
    deps.load.mockRejectedValueOnce(new Error('HTTP 404'));
    engine.select('train');
    await flush();
    engine.select('waves');
    await flush();
    expect(engine.getSnapshot()).toMatchObject({
      status: 'playing',
      current: 'waves',
      unavailable: ['train'],
    });
    error.mockRestore();
  });

  it('pausing while a file loads keeps the selection; the voice starts on play', async () => {
    const { engine, deps, context } = setup();
    const waiting = deferLoads(deps);
    engine.select('white');
    engine.pause();
    waiting[0]!.resolve(context.createBuffer(1, 100, 48_000));
    await flush();
    expect(context.sources).toHaveLength(0);
    engine.play();
    expect(context.sources).toHaveLength(1);
  });

  it('stop while a file loads clears the loading state; the file that arrives later is only cached', async () => {
    const { engine, deps, context } = setup();
    const waiting = deferLoads(deps);
    engine.setTimer(15);
    engine.select('white');
    engine.stop();
    expect(engine.getSnapshot()).toMatchObject({
      status: 'stopped',
      current: 'white',
      loading: null,
      endsAt: null,
    });
    waiting[0]!.resolve(context.createBuffer(1, 100, 48_000));
    await flush();
    expect(context.sources).toHaveLength(0);
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', loading: null });
    engine.play(); // cached: no second load
    expect(context.sources).toHaveLength(1);
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it('a second load of the same sound does not replace the buffer a playing voice already uses', async () => {
    const { engine, deps, context } = setup();
    const waiting = deferLoads(deps);
    engine.select('white');
    engine.select('train');
    engine.select('white'); // the first white load is still in flight: a second one starts
    expect(waiting.map((entry) => entry.id)).toEqual(['white', 'train', 'white']);
    const first = context.createBuffer(1, 100, 48_000);
    waiting[0]!.resolve(first);
    await flush();
    expect(context.sources[0]?.buffer).toBe(first);
    waiting[2]!.resolve(context.createBuffer(1, 100, 48_000));
    await flush();
    engine.stop();
    engine.play(); // from the cache
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1]?.buffer).toBe(first);
  });
});

describe('the master slider and the cap (R1)', () => {
  it('the master slider moves the master gain only; the cap and the sleep gain stay', async () => {
    const { engine, context } = await playing();
    const { master, sleep, cap } = context.graph;
    const sleepCalls = sleep.gain.calls.length; // the default 60-minute timer was scheduled on play
    engine.setMaster(0.5);
    expect(engine.getSnapshot().master).toBe(0.5);
    expect(master.gain.valueAt(10)).toBeCloseTo(0.25, 6);
    expect(sleep.gain.calls).toHaveLength(sleepCalls);
    expect(cap.gain.calls).toEqual([]);
  });

  it('raising the cap lowers the master so that what plays stays the same, and nothing gets louder meanwhile', async () => {
    const { engine, deps, context } = await playing();
    deps.advance(3000);
    const t = context.currentTime;
    const { master, cap } = context.graph;
    const before = master.gain.valueAt(t) * cap.gain.valueAt(t);
    engine.setCap(1);
    expect(engine.getSnapshot().master).toBeCloseTo(0.3, 9);
    for (let at = t; at <= t + 5; at += 0.05)
      expect(master.gain.valueAt(at) * cap.gain.valueAt(at)).toBeLessThanOrEqual(before + 1e-6);
    expect(master.gain.valueAt(t + 5) * cap.gain.valueAt(t + 5)).toBeCloseTo(before, 4);
    expect(cap.gain.valueAt(t + RISE_SECONDS)).toBe(1);
    expect(cap.gain.valueAt(t + RISE_SECONDS / 2)).toBeLessThan(1);
  });

  it('a second cap raise, long after the first one settled, still shows no rise in what plays', async () => {
    // cancelAndHoldAtTime alone does not anchor the real curve at `time` once the previous ramp has
    // already finished (W3C §1.6.9): without Param.hold also calling setValueAtTime, the next ramp would
    // interpolate from that old, long-past event instead, jumping almost straight to its target.
    const { engine, deps, context } = await playing();
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

  it('lowering the cap ramps it down over half a second and leaves the master where it is', async () => {
    const { engine, context } = await playing();
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
    engine.select('white');
    expect(deps.context.graph.cap.gain.value).toBe(1);
    engine.setCap(0);
    expect(deps.context.graph.cap.gain.valueAt(10)).toBeCloseTo(capGain(0.2), 9);
  });
});

describe('the sleep timer (R1, R2)', () => {
  it('starts with 60 minutes selected; choosing a chip while stopped schedules nothing', () => {
    const { engine, deps } = setup();
    expect(engine.getSnapshot().timer).toBe(60);
    engine.setTimer(15);
    expect(engine.getSnapshot()).toMatchObject({ timer: 15, endsAt: null });
    expect(deps.createContext).not.toHaveBeenCalled();
    expect(deps.pendingTimers).toEqual([]);
  });

  it('on play, schedules the fade on the sleep gain alone, a silent sentinel, and a wall-clock timeout; no source gets a stop time', async () => {
    const { engine, deps, context } = setup();
    engine.setTimer(15);
    engine.select('white');
    await flush();
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
    expect(deps.pendingTimers).toEqual([15 * MINUTE]);
  });

  it("the sentinel's end stops everything: the context is suspended and the sleep gain is ready for the next play", async () => {
    const { engine, deps, context } = setup();
    engine.setTimer(15);
    engine.select('white');
    await flush();
    context.sentinels[0]!.fireEnded();
    expect(engine.getSnapshot()).toMatchObject({
      status: 'stopped',
      endsAt: null,
      timer: 15,
      current: 'white',
    });
    expect(context.calls).toEqual(['resume', 'suspend']);
    expect(context.sources[0]?.stops).toEqual([undefined]);
    expect(context.graph.sleep.gain.valueAt(context.currentTime + 1)).toBe(1);
    expect(deps.pendingTimers).toEqual([EVICT_AFTER_MS + 1000]); // only the loop cache's eviction is left
  });

  it('the wall-clock timeout stops it too, and after it play starts a fresh countdown with the same chip', async () => {
    const { engine, deps, context } = setup();
    engine.setTimer(15);
    engine.select('white');
    await flush();
    deps.advance(15 * MINUTE);
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null, timer: 15 });
    engine.play();
    expect(engine.getSnapshot()).toMatchObject({
      status: 'playing',
      endsAt: WALL_START + 30 * MINUTE,
    });
    expect(context.sentinels).toHaveLength(2);
    expect(context.sentinels[1]?.stops).toEqual([context.currentTime + 15 * 60]);
  });

  it('rescheduling replaces the sentinel and ignores the stale one', async () => {
    const { engine, deps, context } = await playing();
    const before = context.sentinels.length; // one for the default 60-minute timer
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

  it('a slider move during the timer leaves the fade in place and never raises any gain', async () => {
    const { engine, deps, context } = await playing();
    engine.setTimer(15);
    deps.advance(5 * MINUTE);
    const t = context.currentTime;
    const { master, sleep, transport, cap } = context.graph;
    const before = master.gain.valueAt(t);
    engine.setMaster(0.3);
    expect(peakBetween(master.gain, t, t + 60)).toBeLessThanOrEqual(before + 1e-9);
    const end = t + 10 * 60;
    expect(sleep.gain.valueAt(end - FADE_SECONDS)).toBe(1);
    expect(sleep.gain.valueAt(end)).toBe(0);
    for (const param of [sleep, transport, cap])
      expect(peakBetween(param.gain, t, end)).toBeLessThanOrEqual(param.gain.valueAt(t) + 1e-9);
  });

  it('cancelling inside the fade holds the value where it is and comes back over 3 s', async () => {
    const { engine, deps, context } = await playing();
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

  it('without cancelAndHoldAtTime, the engine holds the value it computes itself', async () => {
    const { engine, deps, context } = await playing('white', { holdSupported: false });
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

  it('pausing inside the fade fades the transport, leaves the sleep gain alone, and the countdown still ends on time', async () => {
    const { engine, deps, context } = await playing();
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

  it('paused for 5 minutes with 10 left: after resume the fade still ends at the original endsAt', async () => {
    const { engine, deps, context } = await playing();
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
    const { master, cap } = context.graph;
    for (const param of [master, cap])
      expect(peakBetween(param.gain, t, t + 10)).toBeLessThanOrEqual(param.gain.valueAt(t) + 1e-9);
    expect(peakBetween(sleep.gain, t, t + 10)).toBeLessThanOrEqual(1);
    deps.advance(5 * MINUTE);
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped' });
  });

  it('a sound switched to after the timer gets no stop time, fades in over 2 s, and the fade stays as it was', async () => {
    const { engine, context } = await playing();
    engine.setTimer(15);
    const { sleep } = context.graph;
    const calls = sleep.gain.calls.length;
    const t = context.currentTime;
    engine.select('train');
    await flush(); // the file loads, and the source starts then
    const source = context.sources[1]!;
    expect(source.stops).toEqual([]);
    const gain = context.voiceGain(source)!.gain;
    expect(gain.valueAt(t)).toBe(0);
    expect(gain.valueAt(t + 1)).toBeCloseTo(sliderGain(VOICE_LEVEL) / 2, 9);
    expect(gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(sliderGain(VOICE_LEVEL), 9);
    expect(sleep.gain.calls).toHaveLength(calls);
    expect(context.sentinels).toHaveLength(2); // the default timer's, then this one; nothing new for the switch
  });

  it('an interruption that lasts past endsAt does not resume: stopped wins', async () => {
    const { engine, deps, context } = await playing();
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
  it('pause fades the transport out and suspends afterwards; a play within the fade cancels the suspend', async () => {
    const { engine, deps, context } = await playing();
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

  it('a pause then play inside the pause fade (a double tap) turns back from where the transport is: no cut to 0, no faster rise', async () => {
    const { engine, deps, context } = await playing();
    deps.advance(3000); // the start fade is over
    const { transport } = context.graph;
    engine.pause();
    deps.advance(100); // 0.1 s into the 0.3 s pause fade
    const t = context.currentTime;
    const held = transport.gain.valueAt(t);
    expect(held).toBeGreaterThan(0.5);
    const sources = context.sources.length;
    engine.play();
    expect(context.sources).toHaveLength(sources); // the voice was still there: none starts in this call
    expect(transport.gain.valueAt(t)).toBeCloseTo(held, 9); // no step down: no click, no 2 s dropout
    for (let at = t; at <= t + START_FADE_SECONDS + 0.5; at += 0.02) {
      const value = transport.gain.valueAt(at);
      expect(value).toBeGreaterThanOrEqual(held - 1e-9);
      expect(value).toBeLessThanOrEqual(Math.min(1, held + (at - t) / START_FADE_SECONDS) + 1e-9); // never faster than the start fade
    }
    expect(transport.gain.valueAt(t + START_FADE_SECONDS)).toBeCloseTo(1, 9);
  });

  it('a suspension by the system marks the sound interrupted and silent; becoming visible resumes it with a fade', async () => {
    const { engine, deps, context } = await playing();
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
    const { master, cap, sleep } = context.graph;
    for (const param of [master, cap])
      expect(peakBetween(param.gain, t, t + 10)).toBeLessThanOrEqual(param.gain.valueAt(t) + 1e-9);
    expect(peakBetween(sleep.gain, t, t + 10)).toBeLessThanOrEqual(1);
  });

  it('the session says active while the context already runs: the sound still comes back', async () => {
    const { engine, context } = await playing(); // playing() already drained the first play()'s own resume().then()
    engine.onSessionState('interrupted');
    expect(engine.getSnapshot().status).toBe('interrupted');
    expect(context.state).toBe('running'); // no statechange will ever fire
    engine.onSessionState('active');
    await flush();
    expect(engine.getSnapshot().status).toBe('playing');
  });

  it('play while paused with an expired timer stops without resuming the context (R2)', async () => {
    const { engine, deps, context } = await playing();
    engine.setTimer(15);
    engine.pause();
    deps.advance(1000);
    const resumes = context.calls.filter((call) => call === 'resume').length;
    deps.wall += 20 * MINUTE; // the wall clock jumps (the timer's own timeout has not run)
    engine.play();
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', endsAt: null });
    expect(context.calls.filter((call) => call === 'resume')).toHaveLength(resumes);
  });

  it('a tile tap while paused with an expired timer moves the selection but stays stopped (R2)', async () => {
    const { engine, deps, context } = await playing();
    engine.setTimer(15);
    engine.pause();
    deps.advance(1000);
    const resumes = context.calls.filter((call) => call === 'resume').length;
    deps.wall += 20 * MINUTE; // iOS freezes JS timers: the wall clock jumps, no timeout fires
    engine.select('train');
    expect(engine.getSnapshot()).toMatchObject({
      status: 'stopped',
      endsAt: null,
      current: 'train',
    });
    expect(context.calls.filter((call) => call === 'resume')).toHaveLength(resumes);
    expect(deps.load).toHaveBeenCalledTimes(1); // nothing is fetched for a sound that does not start
  });

  it('the audio session says interrupted, then active', async () => {
    const { engine, context } = await playing(); // playing() already drained the first play()'s own resume().then()
    engine.onSessionState('interrupted');
    expect(engine.getSnapshot().status).toBe('interrupted');
    engine.onSessionState('active');
    expect(context.calls).toEqual(['resume', 'resume']);
    await flush();
    expect(engine.getSnapshot().status).toBe('playing');
  });

  it('the resume action (sounds.resume, play while interrupted) resumes in the tap itself', async () => {
    const { engine, deps, context } = await playing();
    context.interrupt();
    await flush();
    engine.play();
    expect(deps.prepareSession).toHaveBeenCalledTimes(2);
    expect(context.calls).toEqual(['resume', 'resume']);
    expect(engine.getSnapshot().status).toBe('playing');
  });

  it('a tile tap on another sound while interrupted resumes in the tap itself, like the resume action (R6)', async () => {
    const { engine, deps, context } = await playing();
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    engine.select('train');
    expect(deps.prepareSession).toHaveBeenCalledTimes(2);
    expect(context.calls).toEqual(['resume', 'resume']);
    await flush();
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', current: 'train' });
    expect(context.sources).toHaveLength(2);
  });

  it('a tap on the current tile while interrupted resumes in the tap itself (R6)', async () => {
    const { engine, deps, context } = await playing();
    context.interrupt();
    await flush();
    engine.select('white');
    expect(deps.prepareSession).toHaveBeenCalledTimes(2);
    expect(context.calls).toEqual(['resume', 'resume']);
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', current: 'white' });
  });

  it('stop forgets the countdown, stops and disconnects the source, and suspends', async () => {
    const { engine, deps, context } = await playing();
    engine.setTimer(30);
    engine.stop();
    expect(engine.getSnapshot()).toMatchObject({
      status: 'stopped',
      endsAt: null,
      timer: 30,
      current: 'white',
    });
    expect(context.sources).toHaveLength(1);
    for (const source of context.sources) {
      expect(source.stops).toEqual([undefined]);
      expect(source.disconnected).toBe(true);
    }
    expect(context.calls).toEqual(['resume', 'suspend']);
    expect(deps.pendingTimers).toEqual([EVICT_AFTER_MS + 1000]);
  });

  it('stop during a switch cuts both voices at once, the one still fading out included', async () => {
    const { engine, context } = await playing('white');
    engine.select('train');
    await flush();
    const [oldSource, newSource] = context.sources;
    const oldNode = context.voiceGain(oldSource!)!;
    engine.stop();
    expect(newSource?.stops).toEqual([undefined]);
    expect(newSource?.disconnected).toBe(true);
    // Its scheduled end would freeze in the suspended context and play under the next fade-in: cut too.
    expect(oldSource?.stops.at(-1)).toBeUndefined();
    expect(oldSource?.stops).toHaveLength(2);
    expect(oldSource?.disconnected).toBe(true);
    expect(oldNode.disconnected).toBe(true);
    expect(context.graph.transport.gain.valueAt(context.currentTime)).toBe(0);
  });

  it('a switch whose file fails to load stops with the old voice cut too, not left fading (R8)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { engine, deps, context } = await playing('white');
    const waiting = deferLoads(deps);
    engine.select('train');
    const [oldSource] = context.sources;
    const oldNode = context.voiceGain(oldSource!)!;
    expect(oldSource?.stops).toEqual([context.currentTime + SWITCH_FADE_SECONDS + 0.05]);
    waiting[0]!.reject(new Error('HTTP 404'));
    await flush();
    expect(engine.getSnapshot()).toMatchObject({ status: 'stopped', unavailable: ['train'] });
    expect(oldSource?.stops.at(-1)).toBeUndefined();
    expect(oldSource?.disconnected).toBe(true);
    expect(oldNode.disconnected).toBe(true);
    error.mockRestore();
  });

  it('a pause inside a switch, then another tile: no voice from before is left to sound under the new one', async () => {
    const { engine, deps, context } = await playing('white');
    engine.select('train');
    await flush();
    deps.advance(500); // inside the 2 s switch: white is still fading out
    engine.pause();
    deps.advance(1000); // suspended: white's own ramp and scheduled end are frozen
    engine.select('waves');
    await flush();
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', current: 'waves' });
    expect(context.sources).toHaveLength(3);
    const [white, train, waves] = context.sources;
    for (const source of [white, train]) {
      expect(source?.stops.at(-1)).toBeUndefined();
      expect(source?.disconnected).toBe(true);
    }
    expect(waves?.stops).toEqual([]);
  });

  it('a fading voice that already ended is not stopped again', async () => {
    const { engine, context } = await playing('white');
    engine.select('train');
    await flush();
    const [oldSource] = context.sources;
    const oldNode = context.voiceGain(oldSource!)!;
    oldSource!.onended?.(new Event('ended')); // the browser reached its scheduled stop
    expect(oldNode.disconnected).toBe(true);
    engine.stop();
    expect(oldSource?.stops).toHaveLength(1);
  });

  it('the session says active with an expired timer while interrupted: stopped wins, no resume', async () => {
    const { engine, deps, context } = await playing();
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
    const { engine, deps, context } = await playing();
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
    const { engine, deps, context } = await playing();
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
    const { engine, deps, context } = await playing();
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

  it('pausing during an interruption suspends the context once it wakes on its own (no silent awake context)', async () => {
    const { engine, deps, context } = await playing();
    context.interrupt();
    await flush();
    expect(engine.getSnapshot().status).toBe('interrupted');
    engine.pause();
    deps.advance(1000); // the pause's own suspend fires and no-ops: the context is not 'running'
    expect(engine.getSnapshot().status).toBe('paused');
    expect(context.calls).not.toContain('suspend');
    context.endInterruption(); // the call ends; Safari resumes the context by itself, unasked
    await flush();
    expect(engine.getSnapshot().status).toBe('paused');
    expect(context.calls.at(-1)).toBe('suspend');
    expect(context.state).toBe('suspended');
  });

  it("onSessionState('active') while paused suspends a context that reads running with no statechange fired", async () => {
    const { engine, deps, context } = await playing();
    context.interrupt();
    await flush();
    engine.pause();
    deps.advance(1000);
    expect(context.calls).not.toContain('suspend');
    context.state = 'running'; // the audioSession and the AudioContext can disagree: no onstatechange fires from this
    engine.onSessionState('active');
    expect(engine.getSnapshot().status).toBe('paused');
    expect(context.calls.at(-1)).toBe('suspend');
  });
});

describe('restoring the last selection (R9)', () => {
  it('takes up a known sound, the master and the chip without creating the context or playing', () => {
    const { engine, deps } = setup();
    engine.restore({ soundId: 'train', master: 0.3, timer: 15 }, 0.5);
    expect(engine.getSnapshot()).toMatchObject({
      status: 'stopped',
      current: 'train',
      master: 0.3,
      timer: 15,
    });
    expect(deps.createContext).not.toHaveBeenCalled();
  });

  it('reads an unknown or missing sound as nothing selected', () => {
    const { engine } = setup();
    engine.restore({ soundId: 'pink', master: 0.3, timer: null }, 0.5);
    expect(engine.getSnapshot().current).toBeNull();
    const second = setup().engine;
    second.restore({ soundId: null, master: 0.3, timer: null }, 0.5);
    expect(second.getSnapshot().current).toBeNull();
  });

  it('play with nothing selected does nothing', () => {
    const { engine, deps } = setup();
    engine.play();
    expect(engine.getSnapshot().status).toBe('stopped');
    expect(deps.createContext).not.toHaveBeenCalled();
  });

  it('play after a restore builds the graph with the restored master and cap, clamped', () => {
    const { engine, deps } = setup();
    engine.restore({ soundId: 'white', master: 2, timer: null }, 0.8);
    expect(engine.getSnapshot().master).toBe(1);
    engine.restore(undefined, 0.8); // nothing saved: only the cap is taken up
    engine.setMaster(0.4);
    engine.play();
    expect(engine.getSnapshot()).toMatchObject({ status: 'playing', current: 'white' });
    expect(deps.context.graph.cap.gain.value).toBe(capGain(0.8));
    expect(deps.context.graph.master.gain.value).toBe(sliderGain(0.4));
  });

  it('restore does nothing once the graph already exists', async () => {
    const { engine, deps } = await playing(); // builds the graph
    const before = engine.getSnapshot();
    engine.restore({ soundId: 'train', master: 0.1, timer: 30 }, 0.9);
    expect(engine.getSnapshot()).toBe(before);
    expect(deps.context.graph.cap.gain.value).not.toBe(capGain(0.9));
  });

  it('restore falls back to the default timer chip when the saved value is not a valid choice', () => {
    const { engine } = setup();
    engine.restore({ soundId: 'white', master: 0.5, timer: 45 as unknown as TimerChoice }, 0.5);
    expect(engine.getSnapshot().timer).toBe(DEFAULT_TIMER);
  });
});

describe('memory and the store (R13, R19)', () => {
  it('drops a loop idle for five minutes and loads it again when needed', async () => {
    const { engine, deps } = await playing();
    expect(deps.load).toHaveBeenCalledTimes(1);
    engine.stop();
    engine.play();
    await flush();
    expect(deps.load).toHaveBeenCalledTimes(1); // still cached
    engine.stop();
    deps.advance(EVICT_AFTER_MS + 2000);
    engine.play();
    await flush();
    expect(deps.load).toHaveBeenCalledTimes(2);
  });

  it('drops the previous sound five minutes after a switch, and keeps the playing one', async () => {
    const { engine, deps } = await playing('white');
    engine.select('train');
    await flush();
    expect(deps.load).toHaveBeenCalledTimes(2);
    deps.advance(EVICT_AFTER_MS + 2000);
    engine.select('white'); // gone from memory: fetched and decoded again
    expect(deps.load).toHaveBeenCalledTimes(3);
    expect(deps.load).toHaveBeenLastCalledWith(deps.context, 'white');
    await flush();
    engine.select('train'); // it was playing until a moment ago: still cached
    expect(deps.load).toHaveBeenCalledTimes(3);
  });

  it('getSnapshot returns the same object until something changes, and notifies subscribers once per change', async () => {
    const { engine, deps } = await playing();
    let notified = 0;
    const unsubscribe = engine.subscribe(() => {
      notified += 1;
    });
    const before = engine.getSnapshot();
    engine.play(); // already playing: nothing changes
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
