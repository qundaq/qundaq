import { describe, expect, it } from 'vitest';
import { foldCase } from '../../src/domain/text';

describe('foldCase', () => {
  it('treats the Turkish dotted and dotless i alike, in both cases', () => {
    expect(foldCase('İbuprofen')).toBe(foldCase('ibuprofen'));
    expect(foldCase('IŞIK')).toBe(foldCase('ışık'));
    expect(foldCase('Ada')).toBe('ada');
    expect(foldCase('Ada')).not.toBe(foldCase('Can'));
  });
});
