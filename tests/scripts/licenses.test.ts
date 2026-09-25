import { describe, expect, it } from 'vitest';
import {
  DEV_ONLY_LICENSES,
  RUNTIME_LICENSES,
  findLicenseViolations,
  isLicenseAllowed,
} from '../../scripts/lib/licenses.mjs';

describe('isLicenseAllowed', () => {
  it('accepts simple identifiers in the list', () => {
    expect(isLicenseAllowed('MIT', RUNTIME_LICENSES)).toBe(true);
    expect(isLicenseAllowed('GPL-3.0', RUNTIME_LICENSES)).toBe(false);
  });

  it('handles OR (any) and AND (all) expressions', () => {
    expect(isLicenseAllowed('(MIT OR GPL-3.0)', RUNTIME_LICENSES)).toBe(true);
    expect(isLicenseAllowed('MIT AND GPL-3.0', RUNTIME_LICENSES)).toBe(false);
    expect(isLicenseAllowed('(MIT AND Apache-2.0)', RUNTIME_LICENSES)).toBe(true);
  });

  it('rejects a missing license', () => {
    expect(isLicenseAllowed(undefined, RUNTIME_LICENSES)).toBe(false);
  });
});

describe('isLicenseAllowed — SPDX operator precedence', () => {
  it('AND binds tighter than OR: (MIT OR GPL-3.0) AND GPL-3.0 is false (GPL-3.0 mandatory)', () => {
    expect(isLicenseAllowed('(MIT OR GPL-3.0) AND GPL-3.0', RUNTIME_LICENSES)).toBe(false);
  });

  it('(MIT OR GPL-3.0) AND Apache-2.0 is true', () => {
    expect(isLicenseAllowed('(MIT OR GPL-3.0) AND Apache-2.0', RUNTIME_LICENSES)).toBe(true);
  });

  it('MIT OR (GPL-3.0 AND Apache-2.0) is true', () => {
    expect(isLicenseAllowed('MIT OR (GPL-3.0 AND Apache-2.0)', RUNTIME_LICENSES)).toBe(true);
  });

  it('GPL-3.0 OR (MIT AND GPL-2.0) is false', () => {
    expect(isLicenseAllowed('GPL-3.0 OR (MIT AND GPL-2.0)', RUNTIME_LICENSES)).toBe(false);
  });

  it('MIT AND Apache-2.0 OR GPL-3.0 is true (AND binds tighter, no parens needed)', () => {
    expect(isLicenseAllowed('MIT AND Apache-2.0 OR GPL-3.0', RUNTIME_LICENSES)).toBe(true);
  });

  it('treats "X WITH Y" as a single identifier, not split by WITH', () => {
    expect(isLicenseAllowed('Apache-2.0 WITH LLVM-exception', RUNTIME_LICENSES)).toBe(false);
  });

  it('rejects malformed expressions', () => {
    expect(isLicenseAllowed('(MIT OR', RUNTIME_LICENSES)).toBe(false);
    expect(isLicenseAllowed('MIT AND', RUNTIME_LICENSES)).toBe(false);
    expect(isLicenseAllowed('', RUNTIME_LICENSES)).toBe(false);
  });
});

describe('findLicenseViolations', () => {
  const lock = {
    packages: {
      '': { name: 'qundaq', license: 'MIT' },
      'node_modules/react': { license: 'MIT' },
      'node_modules/bad-runtime': { license: 'MPL-2.0' },
      'node_modules/ok-dev': { license: 'MPL-2.0', dev: true },
      'node_modules/opt-dev': { license: 'CC-BY-4.0', devOptional: true },
      'node_modules/a/node_modules/nolicense': { dev: true },
    },
  };

  it('applies the stricter list to runtime packages and skips the root', () => {
    expect(findLicenseViolations(lock)).toEqual([
      { name: 'bad-runtime', license: 'MPL-2.0', dev: false },
      { name: 'nolicense', license: '(none)', dev: true },
    ]);
  });

  it('dev list is a superset of runtime list', () => {
    for (const id of RUNTIME_LICENSES) expect(DEV_ONLY_LICENSES).toContain(id);
  });
});
