import { useId, useRef, useState, type FormEvent } from 'react';
import { stopTimer, switchBreastSide, type EventChange } from '../../../db/events';
import { db } from '../../../db/instance';
import { lastSideUse } from '../../../domain/defaults';
import { NOW_CHOICE, resolveTimeChoice, type TimeChoice } from '../../../domain/entryTime';
import { babyStatus } from '../../../domain/status';
import type { Baby, Id, Side, TrackerEvent } from '../../../domain/types';
import { useLocale, useT } from '../../app/I18nProvider';
import { clockTime, formatNumber } from '../../history/describe';
import { Button } from '../../shared/Button';
import { Chip } from '../../shared/Chip';
import { cx } from '../../shared/cx';
import { messageFor, useReportError } from '../../shared/ErrorBanner';
import { formatAgo } from '../../shared/format';
import { LiveDuration } from '../../shared/LiveDuration';
import { onRadioKeyDown } from '../../shared/radio';
import { Segmented } from '../../shared/Segmented';
import { SheetFooter } from '../../shared/Sheet';
import { useMounted } from '../../shared/useMounted';
import { useNow } from '../../shared/useNow';
import { TimeChips } from '../TimeChips';
import type { SheetInput, SheetKind } from '../drafts';
import styles from '../LogSheet.module.css';
import { DurationField } from './fields';

export type TimerKind = 'breastfeed' | 'sleep';

/** A feed or sleep sheet either starts a timer now or records one that has already finished. */
export type TimerMode = 'start' | 'done';

/** The duration chips of a finished feed or sleep, in minutes. */
export const DURATION_CHIPS: Readonly<Record<TimerKind, readonly number[]>> = {
  breastfeed: [5, 10, 15, 20, 30],
  sleep: [20, 40, 60, 90, 120],
};

const SIDES: readonly Side[] = ['L', 'R'];

export type TimerInput = Extract<SheetInput, { kind: TimerKind }>;

function withDuration(input: TimerInput, durationMin: number | null): TimerInput {
  return input.kind === 'sleep'
    ? { kind: 'sleep', value: { durationMin } }
    : { kind: 'breastfeed', value: { ...input.value, durationMin } };
}

/**
 * A feed or sleep sheet's own fields: "Start now" or a finished one (sheet.mode), and for a finished one
 * its side (a feed) and duration. The mode is form state; a timer is still `durationMin: null`.
 */
export function TimerFields({
  input,
  mode,
  onModeChange,
  onChange,
}: {
  input: TimerInput;
  mode: TimerMode;
  onModeChange: (mode: TimerMode) => void;
  onChange: (input: TimerInput) => void;
}) {
  const t = useT();
  return (
    <>
      <Segmented
        label={t('sheet.mode')}
        hideLabel
        options={[
          { value: 'start', label: t('sheet.mode.start') },
          {
            value: 'done',
            label: t(input.kind === 'sleep' ? 'sheet.mode.doneSleep' : 'sheet.mode.doneFeed'),
          },
        ]}
        value={mode}
        onChange={(next) => {
          if (next === mode) return;
          onModeChange(next);
          // Either way the duration starts empty: a started timer has none, a finished one must be chosen.
          onChange(withDuration(input, null));
        }}
      />
      {mode === 'done' && input.kind === 'breastfeed' && (
        <Segmented
          label={t('sheet.side')}
          options={SIDES.map((side) => ({ value: side, label: t(`side.${side}.button`) }))}
          value={input.value.side}
          onChange={(side) => onChange({ kind: 'breastfeed', value: { ...input.value, side } })}
        />
      )}
      {mode === 'done' && (
        <DurationChips
          kind={input.kind}
          value={input.value.durationMin}
          onChange={(minutes) => onChange(withDuration(input, minutes))}
        />
      )}
    </>
  );
}

/** The chips' durations and "Other…" (sheet.durationOther), which reveals the minutes field. */
export function DurationChips({
  kind,
  value,
  onChange,
}: {
  kind: TimerKind;
  value: number | null;
  onChange: (minutes: number | null) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const labelId = useId();
  // "Other…" stays chosen while its field is empty, so clearing the field does not hide it.
  const [otherPicked, setOtherPicked] = useState(false);
  const chips = DURATION_CHIPS[kind];
  const other = otherPicked || (value !== null && !chips.includes(value));
  const choices: readonly (number | 'other')[] = [...chips, 'other'];
  const isChosen = (choice: number | 'other') =>
    choice === 'other' ? other : !other && value === choice;
  const focusable = choices.some(isChosen) ? choices.findIndex(isChosen) : 0;
  const choose = (choice: number | 'other') => {
    setOtherPicked(choice === 'other');
    if (choice !== 'other') onChange(choice);
  };
  const text = (choice: number | 'other') =>
    choice === 'other'
      ? t('sheet.durationOther')
      : choice < 60
        ? t('duration.minutes', { m: choice })
        : t('duration.hours', { h: formatNumber(locale, choice / 60, 1) });
  return (
    <div className={styles.group}>
      <span id={labelId} className={styles.groupLabel}>
        {t('sheet.duration')}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={styles.chips}>
        {choices.map((choice, i) => (
          <Chip
            key={choice}
            mode="radio"
            selected={isChosen(choice)}
            tabIndex={i === focusable ? 0 : -1}
            onClick={() => choose(choice)}
            onKeyDown={(event) =>
              onRadioKeyDown(event, i, choices.length, (j) => choose(choices[j]!))
            }
          >
            {text(choice)}
          </Chip>
        ))}
      </div>
      {other && <DurationField value={value} onChange={onChange} />}
    </div>
  );
}

/**
 * The two big side buttons of "Start now" (sheet.mode.start): a tap starts the feed on that side. The side
 * to offer next is outlined and says so; the other says when it was last used.
 */
export function SidePicker({
  events,
  babyId,
  next,
  disabled,
  onPick,
}: {
  events: readonly TrackerEvent[];
  babyId: Id;
  next: Side;
  disabled: boolean;
  onPick: (side: Side) => void;
}) {
  const t = useT();
  const now = useNow();
  const captionId = useId();
  const caption = (side: Side) => {
    if (side === next) return t('side.next');
    const at = lastSideUse(events, babyId, side);
    return at === null ? null : t('side.lastUsed', { ago: formatAgo(t, Math.max(0, now - at)) });
  };
  return (
    <div role="group" aria-label={t('sheet.side')} className={styles.sides}>
      {SIDES.map((side) => {
        const text = caption(side);
        return (
          <button
            key={side}
            type="button"
            className={cx(styles.side, side === next && styles.next)}
            aria-label={t(`side.${side}.button`)}
            aria-describedby={text === null ? undefined : `${captionId}-${side}`}
            disabled={disabled}
            onClick={() => onPick(side)}
          >
            {t(`side.${side}.button`)}
            {text !== null && (
              <span id={`${captionId}-${side}`} className={styles.sideCaption}>
                {text}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Before a timer starts: which selected babies have the other timer running, which the start will end
 * (sheet saves then pass endRunning).
 */
export function OneTimerNote({
  kind,
  babyIds,
  events,
  nameOf,
}: {
  kind: TimerKind;
  babyIds: readonly Id[];
  events: readonly TrackerEvent[];
  nameOf: (id: Id) => string;
}) {
  const t = useT();
  const names = babyIds
    .filter((id) => {
      const status = babyStatus(events, id);
      return kind === 'sleep' ? status.runningFeed !== null : status.sleep.state === 'asleep';
    })
    .map(nameOf);
  if (names.length === 0) return null;
  return (
    <p className={styles.note}>
      {t(kind === 'sleep' ? 'conflict.feedEnds' : 'conflict.sleepEnds', {
        names: names.join(', '),
      })}
    </p>
  );
}

export type RunningTimer =
  | { kind: 'sleep'; eventId: Id; since: number }
  | { kind: 'breastfeed'; eventId: Id; since: number; side: Side };

/** The baby's own running timer of this kind: a feed or sleep sheet opened for it stops that timer. */
export function runningTimer(
  events: readonly TrackerEvent[],
  kind: SheetKind,
  babyId: Id,
): RunningTimer | null {
  const status = babyStatus(events, babyId);
  if (kind === 'sleep' && status.sleep.state === 'asleep')
    return { kind: 'sleep', eventId: status.sleep.eventId, since: status.sleep.since };
  if (kind === 'breastfeed' && status.runningFeed)
    return {
      kind: 'breastfeed',
      eventId: status.runningFeed.eventId,
      since: status.runningFeed.startAt,
      side: status.runningFeed.side,
    };
  return null;
}

/**
 * A feed or sleep sheet opened while that timer runs: how long it has run, a side switch for a feed (the
 * sheet stays open), and the stop at a chosen time.
 */
export function StopTimerForm({
  timer,
  babies,
  onClose,
  onStopped,
}: {
  timer: RunningTimer;
  babies: readonly Baby[];
  onClose: () => void;
  onStopped: (change: EventChange) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [time, setTime] = useState<TimeChoice>(NOW_CHOICE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false); // only for `disabled`; the ref below is the real guard
  const submitting = useRef(false);
  const mounted = useMounted();
  const report = useReportError();
  const sleep = timer.kind === 'sleep';

  const changeTime = (next: TimeChoice) => {
    setTime(next);
    setError(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    const now = Date.now();
    try {
      const change = await stopTimer(
        db,
        timer.eventId,
        now,
        time.kind === 'now' ? undefined : resolveTimeChoice(time, now),
      );
      onClose();
      if (change) onStopped(change);
    } catch (failure) {
      // Dismissed while stopping: the form and its error line are gone, so the app's banner says it.
      if (!mounted()) {
        report(failure);
        return;
      }
      setError(messageFor(t, failure, babies));
      submitting.current = false;
      setPending(false);
    }
  };
  const switchSide = () => {
    setError(null);
    switchBreastSide(db, timer.eventId).catch((failure: unknown) =>
      setError(messageFor(t, failure, babies)),
    );
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <p className={styles.running}>
        <span>
          {timer.kind === 'sleep'
            ? t('strip.asleep', { time: clockTime(locale, timer.since) })
            : t('strip.feeding', { side: t(`side.${timer.side}.button`) })}
        </span>
        <LiveDuration since={timer.since} />
      </p>
      {timer.kind === 'breastfeed' && (
        <div className={styles.group}>
          <Button icon="arrow-left-right" onClick={switchSide}>
            {t('timer.switchSide')}
          </Button>
        </div>
      )}
      <TimeChips label={t(sleep ? 'time.woke' : 'time.end')} value={time} onChange={changeTime} />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <SheetFooter>
        <Button type="submit" variant="primary" size="lg" block disabled={pending}>
          {t(sleep ? 'timer.wakeUp' : 'timer.stop')}
        </Button>
      </SheetFooter>
    </form>
  );
}
