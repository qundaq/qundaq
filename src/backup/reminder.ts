import { dayOffset, startOfDay } from '../domain/days';
import { DAY, HOUR } from '../domain/time';

/** A stored time later than `latest` was written while the clock was wrong: it is treated as missing. */
export function believable(time: number | undefined, latest: number): number | undefined {
  return time !== undefined && Number.isFinite(time) && time <= latest ? time : undefined;
}

/** Calendar days from the day of the last backup to the day of `now`: 0 today, 1 yesterday. Never negative. */
export function daysSinceBackup(lastBackupAt: number, now: number): number {
  return Math.max(0, dayOffset(startOfDay(lastBackupAt), now));
}

/** Home asks for a backup once the last one is older than this. */
export const REMIND_AFTER_MS = 7 * DAY;
/** "Yarın hatırlat" snoozes until this hour the next day… */
export const SNOOZE_HOUR = 9;
/** …and for at least this long, so a tap at 23:00 does not come back at 09:00. */
export const MIN_SNOOZE_MS = 12 * HOUR;
/** A snooze reaches at most 33 h ahead (a tap at midnight); anything later comes from a wrong clock. */
const MAX_SNOOZE_MS = 2 * DAY;

export interface ReminderSettings {
  lastBackupAt?: number;
  backupReminderSnoozedUntil?: number;
}

export interface Reminder {
  show: boolean;
  daysSince: number | null; // null: never backed up
}

/**
 * Home's banner: shown when there is at least one live entry and no backup, or the last one is older than
 * seven days, unless the user snoozed it.
 */
export function backupReminder(
  settings: ReminderSettings,
  hasEvents: boolean,
  now: number,
): Reminder {
  const last = believable(settings.lastBackupAt, now + DAY);
  const snoozedUntil = believable(settings.backupReminderSnoozedUntil, now + MAX_SNOOZE_MS);
  const daysSince = last === undefined ? null : daysSinceBackup(last, now);
  if (!hasEvents || (snoozedUntil !== undefined && now < snoozedUntil))
    return { show: false, daysSince };
  return { show: last === undefined || now - last > REMIND_AFTER_MS, daysSince };
}

/** "Yarın hatırlat": 09:00 local on the next calendar day, and at least 12 hours from now. */
export function snoozeUntil(now: number): number {
  const today = new Date(now);
  const nextMorning = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
    SNOOZE_HOUR,
  ).getTime();
  return Math.max(nextMorning, now + MIN_SNOOZE_MS);
}
