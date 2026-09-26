// Fails if any installed package (per package-lock.json) has a license outside policy.
import { readFile } from 'node:fs/promises';
import { findLicenseViolations } from './lib/licenses.mjs';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const violations = findLicenseViolations(lock);
for (const v of violations) console.error(`${v.dev ? 'dev' : 'RUNTIME'}  ${v.name}: ${v.license}`);
if (violations.length > 0) {
  console.error(
    `\n${violations.length} package(s) violate the license policy. See scripts/lib/licenses.mjs.`,
  );
  process.exit(1);
}
console.log(`License policy OK (${Object.keys(lock.packages ?? {}).length - 1} packages).`);
