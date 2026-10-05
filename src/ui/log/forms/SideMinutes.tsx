import { useId } from 'react';
import type { Side } from '../../../domain/types';
import { useT } from '../../app/I18nProvider';
import { Button } from '../../shared/Button';
import { Chip } from '../../shared/Chip';
import { cx } from '../../shared/cx';
import { radioKeyTarget } from '../../shared/radio';
import styles from './SideMinutes.module.css';

/** Whole minutes per side; null means the side was not used. */
export interface SideValues {
  left: number | null;
  right: number | null;
}

/** The stepper's step, and the first value a "+" gives an empty side. */
export const MINUTES_STEP = 5;
export const MINUTE_CHIPS: readonly number[] = [5, 10, 15, 20];

const SIDES: readonly Side[] = ['L', 'R'];
const KEY: Record<Side, keyof SideValues> = { L: 'left', R: 'right' };

/**
 * The most one side may take: its own `max`, and with a `maxTotal` for both sides together, what the
 * other side leaves of it (so 240 + 240 cannot be entered when a feed may last 240 minutes).
 */
export function sideMax(max: number, maxTotal: number | undefined, other: number | null): number {
  return Math.max(0, Math.min(max, maxTotal === undefined ? max : maxTotal - (other ?? 0)));
}

/** A stepper tap: "+" on an empty side gives one step, "−" down to 0 or below empties it; never above `max`. */
export function stepMinutes(value: number | null, direction: 1 | -1, max: number): number | null {
  if (direction === 1) {
    const next = Math.min(max, (value ?? 0) + MINUTES_STEP);
    return next > 0 ? next : null;
  }
  if (value === null) return null;
  const next = value - MINUTES_STEP;
  return next > 0 ? next : null;
}

/** A quick chip sets its minutes (never above `max`); tapping the chip already chosen empties the side. */
export function chipMinutes(value: number | null, chip: number, max: number): number | null {
  if (value === chip) return null;
  const next = Math.min(max, chip);
  return next > 0 ? next : null;
}

/**
 * A chip tap in the measured state (a timer's minutes, not chosen yet): it always sets the chip's minutes,
 * so tapping the chip that matches the timer to "confirm" it never empties the side.
 */
export function chipTap(
  value: number | null,
  chip: number,
  max: number,
  measured: boolean,
): number | null {
  return chipMinutes(measured ? null : value, chip, max);
}

/** Typed minutes: whole positive numbers, capped at `max`; anything else empties the side. */
export function typedMinutes(raw: string, max: number): number | null {
  const n = Number.parseInt(raw, 10);
  const next = Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
  return next > 0 ? next : null;
}

/**
 * The chip an arrow key (or Home/End) moves to, skipping the chips that are off; null when the key does
 * not move or no other chip is on. `index` is the chip the key was pressed on.
 */
export function nextEnabledChip(
  key: string,
  index: number,
  enabled: readonly boolean[],
): number | null {
  const on = enabled.flatMap((ok, i) => (ok ? [i] : []));
  if (on.length === 0) return null;
  const at = on.indexOf(index);
  const target = radioKeyTarget(key, at === -1 ? 0 : at, on.length);
  return target === null ? null : on[target]!;
}

/**
 * Minutes per side (the left and right rows): each a −/+ stepper around the typed value and quick chips
 * (MINUTE_CHIPS). An empty row is a side that was not used, shown as an outlined, muted box; a measured
 * value (the pump stop sheet's, from the timer) is muted too until changed. Shared by the feed and the
 * pumping sheets. `max` bounds each side; `maxTotal`, when given, bounds both together.
 */
export function SideMinutes({
  values,
  onChange,
  max,
  maxTotal,
  measured = false,
  describedBy,
}: {
  values: SideValues;
  onChange: (next: SideValues) => void;
  max: number;
  maxTotal?: number;
  /** The values were measured (a running timer's), not typed: shown muted until changed. */
  measured?: boolean;
  /** The id of a caption that explains the values, for the number fields' accessible description. */
  describedBy?: string;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className={styles.sides}>
      {SIDES.map((side) => {
        const key = KEY[side];
        const value = values[key];
        const limit = sideMax(max, maxTotal, values[side === 'L' ? 'right' : 'left']);
        const name = t(`side.${side}.button`);
        const fieldName = t('sideMinutes.value', { side: name });
        const labelId = `${id}-${side}`;
        const set = (next: number | null) => onChange({ ...values, [key]: next });
        // A measured value is not a choice: no chip shows as chosen until the parent picks one.
        const chosen = value === null || measured ? -1 : MINUTE_CHIPS.indexOf(value);
        // A chip the other side leaves no room for is off, unless it is the one chosen.
        const enabled = MINUTE_CHIPS.map((minutes) => minutes <= limit || value === minutes);
        const focusable = chosen === -1 ? Math.max(0, enabled.indexOf(true)) : chosen;
        return (
          <div key={side} role="group" aria-labelledby={labelId} className={styles.row}>
            <span id={labelId} className={styles.label}>
              {name}
            </span>
            <div className={styles.stepper}>
              <Button
                icon="minus"
                aria-label={t('sideMinutes.less', { side: name, m: MINUTES_STEP })}
                disabled={value === null}
                onClick={() => set(stepMinutes(value, -1, limit))}
              />
              <label
                className={cx(
                  styles.value,
                  value === null ? styles.empty : measured ? styles.measured : styles.filled,
                )}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={limit}
                  placeholder="0"
                  aria-label={fieldName}
                  aria-describedby={describedBy}
                  className={styles.input}
                  value={value ?? ''}
                  onChange={(event) => set(typedMinutes(event.target.value, limit))}
                />
                <span aria-hidden="true" className={styles.unit}>
                  {t('sideMinutes.unit')}
                </span>
              </label>
              <Button
                icon="plus"
                aria-label={t('sideMinutes.more', { side: name, m: MINUTES_STEP })}
                disabled={(value ?? 0) >= limit}
                onClick={() => set(stepMinutes(value, 1, limit))}
              />
            </div>
            <div role="radiogroup" aria-label={fieldName} className={styles.chips}>
              {MINUTE_CHIPS.map((minutes, i) => (
                <Chip
                  key={minutes}
                  mode="radio"
                  selected={i === chosen}
                  disabled={!enabled[i]}
                  tabIndex={i === focusable ? 0 : -1}
                  onClick={() => set(chipTap(value, minutes, limit, measured))}
                  onKeyDown={(event) => {
                    const target = nextEnabledChip(event.key, i, enabled);
                    if (target === null) return;
                    event.preventDefault();
                    set(MINUTE_CHIPS[target]!);
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLElement>('[role="radio"]')
                      [target]?.focus();
                  }}
                >
                  {t('time.minutes', { m: minutes })}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
