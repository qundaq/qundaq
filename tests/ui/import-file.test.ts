import { describe, expect, it } from 'vitest';
import { MAX_BACKUP_BYTES } from '../../src/backup/validate';
import { readImportFile } from '../../src/ui/backup/importFile';

describe('readImportFile', () => {
  it('refuses a file over 20 MB without reading it', async () => {
    const big = new File([new Uint8Array(MAX_BACKUP_BYTES + 1)], 'big.json');
    expect(await readImportFile(big, Date.now())).toEqual({ ok: false, error: 'too-large' });
  });

  it('reports a file that cannot be read, instead of throwing', async () => {
    const broken = { name: 'x.json', size: 10, text: () => Promise.reject(new DOMException('gone', 'NotReadableError')) } as unknown as File;
    expect(await readImportFile(broken, Date.now())).toEqual({ ok: false, error: 'unreadable' });
  });

  it('parses a readable file', async () => {
    expect(await readImportFile(new File(['not json'], 'x.json'), Date.now())).toEqual({ ok: false, error: 'not-backup' });
  });
});
