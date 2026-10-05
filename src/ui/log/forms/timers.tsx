import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  stopTimer,
  switchBreastSide,
  switchRestsUntil,
  type EventChange,
} from '../../../db/events';
import { db } from '../../../db/instance';
import { lastSideUse } from '../../../domain/defaults';
import { NOW_CHOICE, resolveTimeChoice, type TimeChoice } from '../../../domain/entryTime';
import { babyStatus } from '../../../domain/status';
import type { Baby, BreastSegment, Id, Side, TrackerEvent } from '../../../domain/types';
import { useLocale, useT, type TranslateFn } from '../../app/I18nProvider';
import { clockTime, formatNumber, sideTotals } from '../../history/describe';
import { Button } from '../../shared/Button';
import { Chip } from '../../shared/Chip';
import { cx } from '../../shared/cx';
import { messageFor, useReportError } from '../../shared/ErrorBanner';
import { formatAgo } from '../../shared/format';
import { Icon } from '../../shared/Icon';
import { LiveDuration } from '../../shared/LiveDuration';
import { onRadioKeyDown } from '../../shared/radio';
import { Segmented } from '../../shared/Segmented';
import { SheetFooter } from '../../shared/Sheet';
import { useMounted } from '../../shared/useMounted';
import { whenReached } from '../../shared/whenReached';
import { useNow } from '../../shared/useNow';
import { TimeChips } from '../TimeChips';
import type { SheetInput, SheetKind } from '../drafts';
import styles from '../LogSheet.module.css';
import { DurationField } from './fields';

export type TimerKind = 'breastfeed' | 'sleep';

/** A sleep sheet either starts a timer now or records a sleep that has already finished. */
export type TimerMode = 'start' | 'done';

/** The duration chips of a finished sleep, in minutes. */
export const DURATION_CHIPS: readonly number[] = [20, 40, 60, 90, 120];

const SIDES: readonly Side[] = ['L', 'R'];

export type SleepInput = Extract<SheetInput, { kind: 'sleep' }>;

/**
 * A sleep sheet's own fields: "Start now" or a finished one (sheet.mode), and for a finished one its
 * duration. The mode is form state; a timer is still `durationMin: null`.
 */
export function TimerFields({
  input,
  mode,
  onModeChange,
  onChange,
}: {
  input: SleepInput;
  mode: TimerMode;
  onModeChange: (mode: TimerMode) => void;
  onChange: (input: SleepInput) => void;
}) {
  const t = useT();
  return (
    <>
      <Segmented
        label={t('sheet.mode')}
        hideLabel
        options={[
          { value: 'start', label: t('sheet.mode.start') },
          { value: 'done', label: t('sheet.mode.doneSleep') },
        ]}
        value={mode}
        onChange={(next) => {
          if (next === mode) return;
          onModeChange(next);
          // Either way the duration starts empty: a started timer has none, a finished one must be chosen.
          onChange({ kind: 'sleep', value: { durationMin: null } });
        }}
      />
      {mode === 'done' && (
        <DurationChips
          value={input.value.durationMin}
          onChange={(durationMin) => onChange({ kind: 'sleep', value: { durationMin } })}
        />
      )}
    </>
  );
}

/** The chips' durations and "Other…" (sheet.durationOther), which reveals the minutes field. */
export function DurationChips({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const labelId = useId();
  // "Other…" stays chosen while its field is empty, so clearing the field does not hide it.
  const [otherPicked, setOtherPicked] = useState(false);
  const other = otherPicked || (value !== null && !DURATION_CHIPS.includes(value));
  const choices: readonly (number | 'other')[] = [...DURATION_CHIPS, 'other'];
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
 * The two big side buttons at the top of the feed sheet (feed.start): a tap starts the feed on that side.
 * The side to offer next is highlighted and says so; the other says when it was last used.
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
            <span className={styles.sideName}>
              <Icon name="play" size={16} />
              {t(`side.${side}.button`)}
            </span>
            {/* Always one caption line, empty for a side never used, so both names sit level. */}
            <span id={`${captionId}-${side}`} className={styles.sideCaption}>
              {text ?? '\u00a0'}
            </span>
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
  | {
      kind: 'breastfeed';
      eventId: Id;
      since: number;
      side: Side;
      segments: readonly BreastSegment[];
    };

/** The baby's own running timer of this kind: a feed or sleep sheet opened for it stops that timer. */
export function runningTimer(
  events: readonly TrackerEvent[],
  kind: SheetKind,
  babyId: Id,
): RunningTimer | null {
  const status = babyStatus(events, babyId);
  if (kind === 'sleep' && status.sleep.state === 'asleep')
    return { kind: 'sleep', eventId: status.sleep.eventId, since: status.sleep.since };
  if (kind === 'breastfeed' && status.runningFeed) {
    const { eventId } = status.runningFeed;
    const feed = events.find((event) => event.id === eventId);
    return {
      kind: 'breastfeed',
      eventId,
      since: status.runningFeed.startAt,
      side: status.runningFeed.side,
      segments: feed?.type === 'breastfeed' ? feed.segments : [],
    };
  }
  return null;
}

/** How long a "switch side" button stays disabled after a tap that was still refused. */
export const SWITCH_REFUSED_MS = 1000;

/**
 * A "switch side" button's state, read from the feed's data: after a switch it rests (disabled) until
 * switchRestsUntil, exactly while switchBreastSide would ignore a tap, wherever it shows (Home's strip,
 * the stop sheet) and across remounts. The first tap of a feed always switches and the new side shows at
 * once. A tap that is refused all the same (switchBreastSide returns false) disables the button briefly
 * too, so no tap is ever silently inert.
 */
export function useSideSwitch(segments: readonly BreastSegment[]): {
  disabled: boolean;
  run: (action: () => Promise<boolean>) => Promise<void>;
} {
  const restsUntil = switchRestsUntil(segments);
  // One render once the window has passed, rather than a clock ticking for the whole feed (useNow ticks
  // on a fixed interval, which would end the rest up to that interval late). whenReached waits again if
  // its timer fires early, so the rest always ends.
  const [now, setNow] = useState(() => Date.now());
  useEffect(
    () => (restsUntil === null ? undefined : whenReached(restsUntil, setNow)),
    [restsUntil],
  );
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!refused) return;
    const timer = window.setTimeout(() => setRefused(false), SWITCH_REFUSED_MS);
    return () => window.clearTimeout(timer);
  }, [refused]);
  const busy = useRef(false); // set synchronously: a double tap before the next render runs once
  const disabled = (restsUntil !== null && now < restsUntil) || refused;
  const run = async (action: () => Promise<boolean>) => {
    if (busy.current || disabled) return;
    busy.current = true;
    try {
      if (!(await action())) setRefused(true);
    } finally {
      busy.current = false;
    }
  };
  return { disabled, run };
}

/** The minutes per side of a running feed so far ("Left 8 min · Right 3 min"); the open side counts up to `now`. */
export function runningSplit(
  t: TranslateFn,
  segments: readonly BreastSegment[],
  now: number,
): string {
  return sideTotals(
    t,
    segments.map((segment) =>
      segment.end === undefined ? { ...segment, end: Math.max(now, segment.start) } : segment,
    ),
  );
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
  const now = useNow();
  const sideSwitch = useSideSwitch(timer.kind === 'breastfeed' ? timer.segments : []);

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
    sideSwitch
      .run(() => switchBreastSide(db, timer.eventId))
      .catch((failure: unknown) => setError(messageFor(t, failure, babies)));
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
      {timer.kind === 'breastfeed' && timer.segments.length > 1 && (
        <p className={styles.split}>{runningSplit(t, timer.segments, now)}</p>
      )}
      {timer.kind === 'breastfeed' && (
        <div className={styles.group}>
          <Button icon="arrow-left-right" disabled={sideSwitch.disabled} onClick={switchSide}>
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
