import { describe, expect, it } from 'vitest';
import { foldCase } from '../../src/domain/text';

describe('foldCase', () => {
  it('treats the Turkish dotted and dotless i alike, in both cases', () => {
    // \u0130 is the Turkish dotted capital I; \u0131 is the dotless lowercase i; \u015e/\u015f are
    // the Turkish S-cedilla pair, used here only to build a realistic word.
    expect(foldCase('\u0130buprofen')).toBe(foldCase('ibuprofen'));
    expect(foldCase('I\u015eIK')).toBe(foldCase('\u0131\u015f\u0131k'));
    expect(foldCase('Ada')).toBe('ada');
    expect(foldCase('Ada')).not.toBe(foldCase('Cal'));
  });
});
