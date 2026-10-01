import { describe, expect, it } from 'vitest';
import {
  DELETE_CONFIRM_MAX_MS,
  DELETE_CONFIRM_MIN_MS,
  deleteTap,
} from '../../src/ui/shared/confirm';

describe('deleteTap', () => {
  it('the first tap arms the button', () => {
    expect(deleteTap(null, 1000)).toEqual({ armedAt: 1000, confirmed: false });
  });

  it('a second tap between 600 ms and 4 s after the first deletes', () => {
    expect(deleteTap(1000, 1000 + DELETE_CONFIRM_MIN_MS)).toEqual({
      armedAt: null,
      confirmed: true,
    });
    expect(deleteTap(1000, 1000 + DELETE_CONFIRM_MAX_MS)).toEqual({
      armedAt: null,
      confirmed: true,
    });
  });

  it('a double tap does not delete and re-arms from the fast tap', () => {
    expect(deleteTap(1000, 1300)).toEqual({ armedAt: 1300, confirmed: false });
  });

  it('a fast triple tap at 0 / 300 / 650 ms does not delete', () => {
    const first = deleteTap(null, 0);
    const second = deleteTap(first.armedAt, 300);
    expect(second).toEqual({ armedAt: 300, confirmed: false });
    expect(deleteTap(second.armedAt, 650)).toEqual({ armedAt: 650, confirmed: false });
  });

  it('a tap after the window arms again instead of deleting', () => {
    const late = 1000 + DELETE_CONFIRM_MAX_MS + 1;
    expect(deleteTap(1000, late)).toEqual({ armedAt: late, confirmed: false });
  });

  it('a clock that went backwards arms again', () => {
    expect(deleteTap(5000, 4000)).toEqual({ armedAt: 4000, confirmed: false });
  });
});
