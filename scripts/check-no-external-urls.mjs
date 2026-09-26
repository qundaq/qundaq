// Fails the build if the build output references any URL outside the allow-list.
// Usage: node scripts/check-no-external-urls.mjs [dir]   (default: dist)
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findDisallowedUrls } from './lib/external-urls.mjs';

const DIST = process.argv[2] ?? 'dist';
const SCANNED = /\.(js|mjs|css|html|webmanifest|json|svg)$/;

const files = (await readdir(DIST, { recursive: true })).filter((file) => SCANNED.test(file));
let failures = 0;
for (const file of files) {
  for (const url of findDisallowedUrls(await readFile(join(DIST, file), 'utf8'))) {
    console.error(`${join(DIST, file)}: ${url}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} external URL(s) found in ${DIST}/. See scripts/lib/external-urls.mjs.`,
  );
  process.exit(1);
}

console.log(`No external URLs in ${DIST}/ (${files.length} files scanned).`);
