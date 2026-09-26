/**
 * A record of one AudioParam's scheduled values that can say what the value is at any time, following the
 * Web Audio rules for the calls the engine makes. The engine keeps one next to every param it automates:
 * where `cancelAndHoldAtTime` is missing, holding the current value means reading it from here. Tests use
 * the same record inside their fake AudioParam.
 */
export type AutomationEvent =
  | { type: 'set'; value: number; time: number }
  | { type: 'linear'; value: number; time: number }
  | { type: 'target'; value: number; time: number; timeConstant: number };

export class Automation {
  private list: AutomationEvent[] = [];
  private initial: number;

  constructor(initial: number) {
    this.initial = initial;
  }

  get events(): readonly AutomationEvent[] {
    return this.list;
  }

  /** Web Audio keeps events in time order; an event at the time of others goes after them. */
  private insert(event: AutomationEvent): void {
    const at = this.list.findIndex((other) => other.time > event.time);
    if (at === -1) this.list.push(event);
    else this.list.splice(at, 0, event);
  }

  setValueAtTime(value: number, time: number): void {
    this.insert({ type: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.insert({ type: 'linear', value, time });
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    this.insert({ type: 'target', value, time, timeConstant });
  }

  /** Drops every event at or after `time` (a ramp is dropped whole when it ends then). */
  cancelScheduledValues(time: number): void {
    this.list = this.list.filter((event) => event.time < time);
  }

  /**
   * Freezes the value at `time`: everything scheduled is dropped and the value the param had reached then
   * is held from `time` on, so nothing jumps. Returns that value. The past is not kept: a night of slider
   * moves would otherwise pile up thousands of events, and every later call only needs the value at `time`.
   */
  cancelAndHoldAtTime(time: number): number {
    const value = this.valueAt(time);
    this.initial = value;
    this.list = [{ type: 'set', value, time }];
    return value;
  }

  /**
   * The value at `time`. A linear ramp runs from the event before it; a target curve runs from the value
   * it started at until the next event. (A ramp right after a target replaces the target, as Web Audio
   * does for a target that has not started; the engine always holds the value before ramping, so it never
   * relies on that case.)
   */
  valueAt(time: number): number {
    let value = this.initial; // the value reached at `from`
    let from = 0;
    let target: Extract<AutomationEvent, { type: 'target' }> | null = null;
    const onTarget = (at: number) =>
      target === null
        ? value
        : target.value +
          (value - target.value) * Math.exp(-(at - target.time) / target.timeConstant);

    for (const event of this.list) {
      if (event.type === 'linear') {
        if (target !== null) {
          from = target.time;
          target = null;
        }
        if (time < event.time) {
          if (time <= from) return value;
          return value + ((event.value - value) * (time - from)) / (event.time - from);
        }
        value = event.value;
        from = event.time;
        continue;
      }
      if (time < event.time) return onTarget(time);
      if (target !== null) {
        value = onTarget(event.time);
        target = null;
      }
      from = event.time;
      if (event.type === 'set') value = event.value;
      else target = event;
    }

    return onTarget(time);
  }
}
