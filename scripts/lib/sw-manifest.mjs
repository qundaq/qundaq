import { createHash } from 'node:crypto';

export const SW_FILE = 'sw.js';
const VERSION_TOKEN = "'__VERSION__'";
const PRECACHE_TOKEN = '__PRECACHE__';

/**
 * @typedef {{ url: string, sha256: string }} PrecacheEntry
 *   url: ./-prefixed path relative to the service worker; sha256: lowercase hex digest of the file's bytes
 */

/**
 * @param {string} template service worker source containing the two placeholder tokens
 * @param {{ path: string, content: string | Uint8Array }[]} files every file in the build output, paths relative to it
 * @returns {{ source: string, version: string, precache: PrecacheEntry[] }}
 */
export function renderServiceWorker(template, files) {
  if (!template.includes(VERSION_TOKEN) || !template.includes(PRECACHE_TOKEN)) {
    throw new Error('service worker template is missing a placeholder');
  }
  const entries = files
    .map((f) => ({ ...f, path: f.path.split('\\').join('/') }))
    .filter((f) => f.path !== SW_FILE && !f.path.endsWith('.map'))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // The template is hashed first so a change to the service worker logic alone still yields a new version.
  const hash = createHash('sha256');
  hash.update(template);
  hash.update('\0');
  for (const f of entries) {
    hash.update(f.path);
    hash.update('\0');
    hash.update(f.content);
    hash.update('\0');
  }
  const version = hash.digest('hex').slice(0, 12);
  /** @type {PrecacheEntry[]} */
  const precache = entries.map((f) => ({
    url: `./${f.path}`,
    sha256: createHash('sha256').update(f.content).digest('hex'),
  }));
  // Function replacers: a string replacement would expand "$&", "$'", "$`" and "$$" found in file names.
  const source = template
    .replace(VERSION_TOKEN, () => JSON.stringify(version))
    .replace(PRECACHE_TOKEN, () => JSON.stringify(precache));
  return { source, version, precache };
}
