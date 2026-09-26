import { dayOffset, startOfDay } from '../domain/days';

/** A stored time later than `latest` was written while the clock was wrong: it is treated as missing. */
export function believable(time: number | undefined, latest: number): number | undefined {
  return time !== undefined && Number.isFinite(time) && time <= latest ? time : undefined;
}

/** Calendar days from the day of the last backup to the day of `now`: 0 today, 1 yesterday. Never negative. */
export function daysSinceBackup(lastBackupAt: number, now: number): number {
  return Math.max(0, dayOffset(startOfDay(lastBackupAt), now));
}
