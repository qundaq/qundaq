import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupReminder,
  believable,
  daysSinceBackup,
  snoozeUntil,
} from '../../src/backup/reminder';

let previousTz: string | undefined;
beforeEach(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Europe/Istanbul';
});
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();

describe('daysSinceBackup', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(daysSinceBackup(at(26, 7), at(26, 23))).toBe(0);
    expect(daysSinceBackup(at(25, 23, 50), at(26, 0, 10))).toBe(1);
    expect(daysSinceBackup(at(17, 21), at(26, 9))).toBe(9);
  });

  it('is never negative, even for a backup time in the future', () => {
    expect(daysSinceBackup(at(28, 9), at(26, 9))).toBe(0);
  });
});

describe('believable', () => {
  it('drops a time later than the limit, or one that is not finite', () => {
    expect(believable(5, 10)).toBe(5);
    expect(believable(10, 10)).toBe(10);
    expect(believable(11, 10)).toBeUndefined();
    expect(believable(Number.NaN, 10)).toBeUndefined();
    expect(believable(undefined, 10)).toBeUndefined();
  });
});

describe('backupReminder', () => {
  // Built in beforeEach, after the time zone is set: a describe-time Date would use the machine's zone.
  let NOW: number;
  beforeEach(() => {
    NOW = at(26, 21);
  });

  it('shows with entries and no backup; never without entries', () => {
    expect(backupReminder({}, true, NOW)).toEqual({ show: true, daysSince: null });
    expect(backupReminder({}, false, NOW)).toEqual({ show: false, daysSince: null });
  });

  it('shows once the last backup is more than seven days old', () => {
    expect(backupReminder({ lastBackupAt: at(19, 21, 1) }, true, NOW)).toEqual({
      show: false,
      daysSince: 7,
    });
    expect(backupReminder({ lastBackupAt: at(19, 20, 59) }, true, NOW)).toEqual({
      show: true,
      daysSince: 7,
    });
    expect(backupReminder({ lastBackupAt: at(17, 9) }, true, NOW)).toEqual({
      show: true,
      daysSince: 9,
    });
  });

  it('stays hidden while snoozed', () => {
    expect(backupReminder({ backupReminderSnoozedUntil: NOW + 1 }, true, NOW).show).toBe(false);
    expect(backupReminder({ backupReminderSnoozedUntil: NOW }, true, NOW).show).toBe(true);
  });

  it('ignores times from a clock that was far ahead', () => {
    expect(backupReminder({ lastBackupAt: at(28, 22) }, true, NOW)).toEqual({
      show: true,
      daysSince: null,
    });
    expect(backupReminder({ backupReminderSnoozedUntil: at(29, 22) }, true, NOW).show).toBe(true);
  });
});

describe('snoozeUntil', () => {
  it('is 09:00 the next day, or 12 hours from now when that is later', () => {
    expect(snoozeUntil(at(26, 3))).toBe(at(27, 9));
    expect(snoozeUntil(at(26, 20))).toBe(at(27, 9));
    expect(snoozeUntil(at(26, 23))).toBe(at(27, 11));
  });
});
