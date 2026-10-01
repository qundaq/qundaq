import { describe, expect, it } from 'vitest';
import { compareIds, newId } from '../../src/domain/ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const getRandomValues = <T extends ArrayBufferView>(array: T): T =>
  globalThis.crypto.getRandomValues(array as unknown as Uint8Array<ArrayBuffer>) as unknown as T;

describe('newId', () => {
  it('uses crypto.randomUUID when it exists', () => {
    expect(newId({ getRandomValues, randomUUID: () => 'from-random-uuid' })).toBe(
      'from-random-uuid',
    );
  });

  it('falls back to a v4 UUID built from getRandomValues (insecure contexts lack randomUUID)', () => {
    expect(newId({ getRandomValues })).toMatch(UUID_V4);
  });

  it('fallback ids are unique', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId({ getRandomValues })));
    expect(ids.size).toBe(200);
  });

  it('defaults to the global crypto', () => {
    expect(newId()).toMatch(UUID_V4);
  });
});

describe('compareIds', () => {
  it('is a total, stable order: equal, less, greater', () => {
    expect(compareIds('a', 'a')).toBe(0);
    expect(compareIds('a', 'b')).toBeLessThan(0);
    expect(compareIds('b', 'a')).toBeGreaterThan(0);
  });
});
