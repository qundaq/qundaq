import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOUND_EXTENSION, soundUrl } from '../../src/audio/catalog';
import { SOUND_IDS } from '../../src/domain/sounds';

const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const sources = readFileSync('public/sounds/SOURCES.md', 'utf8');

describe('the bundled recordings', () => {
  it.each(SOUND_IDS)('%s has a file within the size limit and a SOURCES.md row', (id) => {
    const size = statSync(`public/${soundUrl(id)}`).size;
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(MAX_FILE_BYTES);
    const row = sources.split('\n').find((line) => line.startsWith(`| ${id}.${SOUND_EXTENSION} |`));
    expect(row, `a SOURCES.md row for ${id}.${SOUND_EXTENSION}`).toBeDefined();
    expect(row).toMatch(/CC0|Public domain|MIT|AI-generated/);
  });

  it('stay within the total budget', () => {
    const total = SOUND_IDS.reduce((sum, id) => sum + statSync(`public/${soundUrl(id)}`).size, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  });
});
