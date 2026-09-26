import { describe, expect, it } from 'vitest';
import { Automation } from '../../src/audio/automation';

describe('Automation', () => {
  it('holds the initial value until the first event, then follows set values', () => {
    const param = new Automation(0.5);
    param.setValueAtTime(1, 2);
    expect(param.valueAt(0)).toBe(0.5);
    expect(param.valueAt(1.99)).toBe(0.5);
    expect(param.valueAt(2)).toBe(1);
    expect(param.valueAt(10)).toBe(1);
  });

  it('ramps linearly from the event before the ramp', () => {
    const param = new Automation(1);
    param.setValueAtTime(1, 10);
    param.linearRampToValueAtTime(0, 40);
    expect(param.valueAt(5)).toBe(1);
    expect(param.valueAt(25)).toBeCloseTo(0.5, 9);
    expect(param.valueAt(40)).toBe(0);
    expect(param.valueAt(50)).toBe(0);
  });

  it('approaches a target exponentially until the next event', () => {
    const param = new Automation(0);
    param.setTargetAtTime(1, 1, 0.5);
    expect(param.valueAt(1)).toBe(0);
    expect(param.valueAt(1.5)).toBeCloseTo(1 - Math.exp(-1), 9);
    param.setValueAtTime(0.2, 3);
    expect(param.valueAt(2.9)).toBeCloseTo(1 - Math.exp(-3.8), 9);
    expect(param.valueAt(3)).toBe(0.2);
  });

  it('keeps events in time order, a later call at the same time after the earlier one', () => {
    const param = new Automation(0);
    param.linearRampToValueAtTime(1, 10);
    param.setValueAtTime(0.5, 2);
    param.setValueAtTime(0.7, 2);
    expect(param.events.map((event) => [event.type, event.time, event.value])).toEqual([
      ['set', 2, 0.5],
      ['set', 2, 0.7],
      ['linear', 10, 1],
    ]);
    expect(param.valueAt(6)).toBeCloseTo(0.85, 9);
  });

  it('cancelScheduledValues drops a ramp that ends later, so the value falls back', () => {
    const param = new Automation(1);
    param.setValueAtTime(1, 0);
    param.linearRampToValueAtTime(0, 30);
    param.cancelScheduledValues(15);
    expect(param.valueAt(20)).toBe(1);
  });

  it('cancelAndHoldAtTime freezes a running ramp where it is, with nothing jumping, and forgets the past', () => {
    const param = new Automation(1);
    param.setValueAtTime(1, 0);
    param.linearRampToValueAtTime(0, 30);
    expect(param.cancelAndHoldAtTime(15)).toBeCloseTo(0.5, 9);
    expect(param.valueAt(15)).toBeCloseTo(0.5, 9);
    expect(param.valueAt(100)).toBeCloseTo(0.5, 9);
    expect(param.events).toHaveLength(1); // only the held value: nothing to walk through after a night of moves
    param.linearRampToValueAtTime(1, 18);
    expect(param.valueAt(16.5)).toBeCloseTo(0.75, 9);
  });

  it('cancelAndHoldAtTime freezes a target curve too', () => {
    const param = new Automation(0);
    param.setTargetAtTime(1, 0, 1);
    const held = param.cancelAndHoldAtTime(1);
    expect(held).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(param.valueAt(5)).toBeCloseTo(held, 9);
  });
});
