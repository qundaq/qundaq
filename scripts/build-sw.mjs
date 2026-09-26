// Writes <dir>/sw.js from src/sw/sw.js with a content-hash version and the precache list
// (every file with its SHA-256). Usage: node scripts/build-sw.mjs [dir]   (default: dist)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { SW_FILE, renderServiceWorker } from './lib/sw-manifest.mjs';

const DIST = process.argv[2] ?? 'dist';
const paths = (await readdir(DIST, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => relative(DIST, join(entry.parentPath, entry.name)));
const files = await Promise.all(
  paths.map(async (path) => ({ path, content: await readFile(join(DIST, path)) })),
);

const template = await readFile('src/sw/sw.js', 'utf8');
const { source, version, precache } = renderServiceWorker(template, files);
await writeFile(join(DIST, SW_FILE), source);
console.log(
  `${join(DIST, SW_FILE)} ${version}: ${precache.length} files precached, each verified by SHA-256 on install`,
);
