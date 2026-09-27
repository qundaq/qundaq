import type { ImportMode } from '../../backup/merge';
import {
  checkFileSize,
  parseBackup,
  type FatalCode,
  type ParseResult,
} from '../../backup/validate';
import type { Id } from '../../domain/types';

export type ImportError = FatalCode | 'too-large' | 'unreadable';
export type ImportResult = Extract<ParseResult, { ok: true }> | { ok: false; error: ImportError };

/** A picked file and, once read and checked, its result (null while it is read). Its identity marks one opening of the sheet. */
export interface ImportSource {
  fileName: string;
  result: ImportResult | null;
}

/** What the user chose in the preview. Kept in Shell, so a detour through the export sheet keeps it. */
export interface ImportChoices {
  mode: ImportMode;
  /**
   * Device babies the user said are NOT the same child as the other baby of that name: a same-baby pair
   * left unpaired, or a baby the backup deletes whose entries stay with it (ImportOptions.keepApart).
   */
  notSame: Id[];
  stopStale: boolean;
}

export const DEFAULT_CHOICES: ImportChoices = { mode: 'merge', notSame: [], stopStale: true };

/** Refuses a file over 20 MB before reading it, then parses it. Never throws. */
export async function readImportFile(file: File, now: number): Promise<ImportResult> {
  if (checkFileSize(file.size) === 'too-large') return { ok: false, error: 'too-large' };
  try {
    return parseBackup(await file.text(), now);
  } catch (error) {
    console.error('Could not read the backup file', error);
    return { ok: false, error: 'unreadable' };
  }
}
