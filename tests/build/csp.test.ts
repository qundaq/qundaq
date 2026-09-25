import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, injectCsp } from '../../build/csp';

describe('CONTENT_SECURITY_POLICY', () => {
  it('matches the spec verbatim', () => {
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  it('never allows unsafe-inline or unsafe-eval', () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-(inline|eval)/);
  });
});

describe('injectCsp', () => {
  it('inserts the meta tag as the first element of <head>', () => {
    const out = injectCsp('<html><head><title>x</title></head></html>');
    expect(out).toMatch(/^<html><head>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'self';[^"]*">\s*<title>/);
  });

  it('refuses html without a <head>', () => {
    expect(() => injectCsp('<html></html>')).toThrow(/<head>/);
  });
});
