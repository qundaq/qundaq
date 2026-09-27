import { startOfDay } from './days';
import { DAY } from './time';

export type AgeUnit = 'days' | 'weeks' | 'months' | 'years';
export interface BabyAge {
  unit: AgeUnit;
  n: number;
}

/**
 * The age shown on a baby's card: whole days under two weeks, whole weeks under twelve, whole months under
 * two years, then whole years. Null without a readable YYYY-MM-DD birth date, or with one after today.
 */
export function babyAge(birthDate: string | undefined, now: number): BabyAge | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const birth = new Date(year, month - 1, day);
  if (birth.getMonth() !== month - 1 || birth.getDate() !== day) return null;
  // Rounded, not floored: a day with a daylight-saving change is 23 or 25 hours long.
  const days = Math.round((startOfDay(now) - birth.getTime()) / DAY);
  if (days < 0) return null;
  if (days < 14) return { unit: 'days', n: days };
  if (days < 84) return { unit: 'weeks', n: Math.floor(days / 7) };
  const today = new Date(now);
  let months = (today.getFullYear() - year) * 12 + today.getMonth() - (month - 1);
  if (today.getDate() < day) months -= 1;
  return months < 24
    ? { unit: 'months', n: months }
    : { unit: 'years', n: Math.floor(months / 12) };
}
