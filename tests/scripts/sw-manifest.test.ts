import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderServiceWorker } from '../../scripts/lib/sw-manifest.mjs';

const TEMPLATE = "const VERSION = '__VERSION__';\nconst PRECACHE = __PRECACHE__;\n";
const files = [
  { path: 'index.html', content: '<html>' },
  { path: 'assets/app-abc.js', content: 'js' },
  { path: 'sw.js', content: 'old' },
  { path: 'assets/app-abc.js.map', content: 'map' },
];
const sha256 = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const EXPECTED_PRECACHE = [
  { url: './assets/app-abc.js', sha256: sha256('js') },
  { url: './index.html', sha256: sha256('<html>') },
];

describe('renderServiceWorker', () => {
  it('precaches every file except sw.js and source maps, sorted and ./-prefixed, with its SHA-256', () => {
    expect(renderServiceWorker(TEMPLATE, files).precache).toEqual(EXPECTED_PRECACHE);
  });

  it('hashes the exact bytes of binary files as lowercase hex', () => {
    const bytes = new Uint8Array([0, 255, 16, 128]);
    const [entry] = renderServiceWorker(TEMPLATE, [{ path: 'icon.png', content: bytes }]).precache;
    expect(entry).toEqual({ url: './icon.png', sha256: sha256(bytes) });
    expect(entry?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stamps version and list into the template', () => {
    const { source, version } = renderServiceWorker(TEMPLATE, files);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(source).toBe(`const VERSION = "${version}";\nconst PRECACHE = ${JSON.stringify(EXPECTED_PRECACHE)};\n`);
  });

  it('version is stable for identical input and ignores file order', () => {
    const a = renderServiceWorker(TEMPLATE, files).version;
    const b = renderServiceWorker(TEMPLATE, [...files].reverse()).version;
    expect(a).toBe(b);
  });

  it('version changes when any content changes', () => {
    const changed = files.map((f) => (f.path === 'index.html' ? { ...f, content: '<html lang="en">' } : f));
    expect(renderServiceWorker(TEMPLATE, changed).version).not.toBe(renderServiceWorker(TEMPLATE, files).version);
  });

  it('version changes when only the service worker template changes', () => {
    const otherTemplate = `${TEMPLATE}// new service worker logic\n`;
    expect(renderServiceWorker(otherTemplate, files).version).not.toBe(renderServiceWorker(TEMPLATE, files).version);
  });

  it('inserts file names containing $ replacement patterns literally', () => {
    const tricky = [{ path: "a$&b$'c$`d$$e.js", content: 'x' }];
    const { source, precache } = renderServiceWorker(TEMPLATE, tricky);
    expect(source).not.toContain('__PRECACHE__');
    expect(source).toContain(`const PRECACHE = ${JSON.stringify(precache)};\n`);
    expect(precache.map((entry: { url: string }) => entry.url)).toEqual(["./a$&b$'c$`d$$e.js"]);
  });

  it('normalizes Windows path separators', () => {
    const { precache } = renderServiceWorker(TEMPLATE, [{ path: 'assets\\x.js', content: '' }]);
    expect(precache.map((entry: { url: string }) => entry.url)).toEqual(['./assets/x.js']);
  });

  it('throws if the template lacks placeholders', () => {
    expect(() => renderServiceWorker('const x = 1;', files)).toThrow(/placeholder/);
  });
});
