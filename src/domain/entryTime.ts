import { MINUTE } from './time';

/**
 * The log sheet's time chips. Resolved at the moment of saving, so "now" is the save instant and
 * "15 minutes ago" counts back from it; a picked date and time is absolute.
 */
export type TimeChoice =
  { kind: 'now' } | { kind: 'ago'; minutes: number } | { kind: 'picked'; at: number };

export const NOW_CHOICE: TimeChoice = { kind: 'now' };
export const AGO_MINUTES = [5, 15, 30] as const;

export function resolveTimeChoice(choice: TimeChoice, now: number): number {
  switch (choice.kind) {
    case 'now':
      return now;
    case 'ago':
      return now - choice.minutes * MINUTE;
    case 'picked':
      return choice.at;
  }
}
