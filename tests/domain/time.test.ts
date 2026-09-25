import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE, elapsedParts, fromLocalInputValue, toLocalInputValue } from '../../src/domain/time';

describe('elapsedParts', () => {
  it.each([
    [0, 0, 0],
    [59_999, 0, 0],
    [MINUTE, 0, 1],
    [HOUR + MINUTE, 1, 1],
    [25 * HOUR, 25, 0],
    [-5 * MINUTE, 0, 0],
  ])('%i ms → %i h %i min', (ms, hours, minutes) => {
    expect(elapsedParts(ms)).toEqual({ hours, minutes });
  });
});

describe('datetime-local helpers', () => {
  const at = new Date(2026, 8, 25, 7, 5).getTime();

  it('formats local time for <input type="datetime-local">', () => {
    expect(toLocalInputValue(at)).toBe('2026-09-25T07:05');
  });

  it('parses minutes and optional seconds', () => {
    expect(fromLocalInputValue('2026-09-25T07:05')).toBe(at);
    expect(fromLocalInputValue('2026-09-25T07:05:30')).toBe(at + 30_000);
  });

  it('round-trips', () => {
    expect(fromLocalInputValue(toLocalInputValue(at))).toBe(at);
  });

  it('rejects anything else', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('yesterday')).toBeNull();
    expect(fromLocalInputValue('2026-13-45T99:99')).toBeNull();
  });
});
