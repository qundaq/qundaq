import { useEffect, useId, useState, type FormEvent } from 'react';
import { startPump, stopPump, type EventChange, type PumpPatch } from '../../../db/events';
import { db } from '../../../db/instance';
import { NOW_CHOICE, resolveTimeChoice, type TimeChoice } from '../../../domain/entryTime';
import { pumpMinutes, type PumpEvent } from '../../../domain/pump';
import { MAX_DURATION_MS, MAX_PUMP_MIN } from '../../../domain/rules';
import { MINUTE } from '../../../domain/time';
import type { Baby, PumpSide, Side } from '../../../domain/types';
import { useT } from '../../app/I18nProvider';
import { Button } from '../../shared/Button';
import { Icon } from '../../shared/Icon';
import { LiveDuration } from '../../shared/LiveDuration';
import { SheetFooter } from '../../shared/Sheet';
import { useNow } from '../../shared/useNow';
import { FoldedTimeChips } from '../TimeChips';
import {
  DEFAULT_INPUTS,
  buildDrafts,
  hasPumpAmounts,
  pumpAmounts,
  type PumpInput,
} from '../drafts';
import { useEntrySave } from '../useEntrySave';
import styles from '../LogSheet.module.css';
import { NoteField } from './fields';
import { SideMinutes, type SideValues } from './SideMinutes';

const PUMP_SIDES: readonly PumpSide[] = ['L', 'R', 'B'];
const ML_SIDES: readonly Side[] = ['L', 'R'];

/** The most a pump logged afterwards may take, both sides together (one after the other): the too-long rule. */
export const PUMP_TOTAL_MIN = MAX_DURATION_MS.pump / MINUTE;

/** The typed ml per side, as text (parsed on save, so a typo is reported rather than dropped). */
export interface MlValues {
  mlLeft: string;
  mlRight: string;
}

/** The pumping sheet's top buttons: a tap starts the pump timer on the left, the right or both at once. */
export function PumpSidePicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (side: PumpSide) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t('sheet.side')} className={styles.pumpSides}>
      {PUMP_SIDES.map((side) => (
        <button
          key={side}
          type="button"
          className={styles.side}
          disabled={disabled}
          onClick={() => onPick(side)}
        >
          <Icon name="play" size={16} />
          <span className={styles.pumpSideName}>{t(`side.${side}.button`)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Two compact ml fields side by side under their own "Amount (ml)" heading, so they never read as more
 * minute rows; each labelled by side. They fit a 320 px screen.
 */
export function PumpMlFields({
  value,
  onChange,
  autoFocus,
}: {
  value: MlValues;
  onChange: (next: MlValues) => void;
  autoFocus?: boolean;
}) {
  const t = useT();
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} className={styles.mlGroup}>
      <span id={titleId} className={styles.mlTitle}>
        {t('sheet.amount')}
      </span>
      <div className={styles.mlRow}>
        {ML_SIDES.map((side) => {
          const key = side === 'L' ? 'mlLeft' : 'mlRight';
          const name = t(`side.${side}.button`);
          return (
            <label key={side} className={styles.mlField}>
              <span className={styles.mlLabel}>{name}</span>
              <span className={styles.mlBox}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  aria-label={t('pump.ml', { side: name })}
                  // Only the left field takes the focus when the fields are revealed.
                  autoFocus={autoFocus === true && side === 'L'}
                  className={styles.mlInput}
                  value={value[key]}
                  onChange={(event) => onChange({ ...value, [key]: event.target.value })}
                />
                <span aria-hidden="true" className={styles.mlUnit}>
                  {t('pump.mlUnit')}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** The ml fields once revealed, otherwise the small "Add ml" button that reveals them. */
function OptionalMl({
  value,
  onChange,
  open,
  onOpen,
}: {
  value: MlValues;
  onChange: (next: MlValues) => void;
  open: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  // Focus moves into the fields only when a tap revealed them, never when they show from the start.
  const [revealed, setRevealed] = useState(false);
  if (open) return <PumpMlFields value={value} onChange={onChange} autoFocus={revealed} />;
  return (
    <Button
      variant="tertiary"
      icon="plus"
      onClick={() => {
        setRevealed(true);
        onOpen();
      }}
    >
      {t('pump.addMl')}
    </Button>
  );
}

/** The edit sheet's ml fields: shown at once when the pump has ml, behind "Add ml" otherwise. */
export function PumpMlEdit({
  value,
  onChange,
}: {
  value: MlValues;
  onChange: (next: MlValues) => void;
}) {
  const [open, setOpen] = useState(() => value.mlLeft !== '' || value.mlRight !== '');
  return (
    <div className={styles.extras}>
      <OptionalMl value={value} onChange={onChange} open={open} onOpen={() => setOpen(true)} />
    </div>
  );
}

/**
 * The pumping sheet, one screen like the feed sheet: on top the three buttons start the pump timer at
 * once; below, set apart, "log afterwards" records a finished pump from minutes per side (and ml when
 * added), ending at the chosen time.
 */
export function PumpForm({
  babies,
  onClose,
  undoToast,
}: {
  babies: readonly Baby[];
  onClose: () => void;
  undoToast: (changes: readonly EventChange[]) => void;
}) {
  const t = useT();
  const ids = useId();
  const [value, setValue] = useState<PumpInput>(DEFAULT_INPUTS.pump);
  const [mlOpen, setMlOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [endTime, setEndTime] = useState<TimeChoice>(NOW_CHOICE);
  const [errorAt, setErrorAt] = useState<'start' | 'later'>('start');
  const { error, setError, pending, save, run } = useEntrySave(babies, onClose, undoToast);
  // As in the other sheets: a stale error goes the moment the form changes.
  useEffect(() => setError(null), [value, endTime, note, setError]);

  const ready = hasPumpAmounts(value);
  const start = (side: PumpSide) => {
    setErrorAt('start');
    // A pump already running ends at this start (one pump at a time).
    void run((now) => startPump(db, side, now));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // An implicit submit (Enter in a field) with nothing filled does nothing, as the disabled button.
    if (!ready) return;
    setErrorAt('later');
    void save(
      (now) => buildDrafts({ kind: 'pump', value }, [], resolveTimeChoice(endTime, now), note),
      false,
    );
  };
  const errorLine = (at: 'start' | 'later') =>
    error &&
    errorAt === at && (
      <p role="alert" className={styles.error}>
        {error}
      </p>
    );
  const minutes: SideValues = { left: value.minLeft, right: value.minRight };

  return (
    <form onSubmit={submit} noValidate>
      <section aria-labelledby={`${ids}-start`}>
        <h3 id={`${ids}-start`} className={styles.sectionTitle}>
          {t('pump.start')}
        </h3>
        <PumpSidePicker disabled={pending} onPick={start} />
        {errorLine('start')}
      </section>
      <section aria-labelledby={`${ids}-later`} className={styles.later}>
        <h3 id={`${ids}-later`} className={styles.sectionTitle}>
          {t('entry.later')}
        </h3>
        <SideMinutes
          values={minutes}
          onChange={(next) => setValue({ ...value, minLeft: next.left, minRight: next.right })}
          max={MAX_PUMP_MIN}
          maxTotal={PUMP_TOTAL_MIN}
        />
        {mlOpen && (
          <PumpMlFields value={value} onChange={(ml) => setValue({ ...value, ...ml })} autoFocus />
        )}
        {(!mlOpen || !noteOpen) && (
          <div className={styles.extras}>
            {!mlOpen && (
              <Button variant="tertiary" icon="plus" onClick={() => setMlOpen(true)}>
                {t('pump.addMl')}
              </Button>
            )}
            {!noteOpen && (
              <Button variant="tertiary" icon="plus" onClick={() => setNoteOpen(true)}>
                {t('note.add')}
              </Button>
            )}
          </div>
        )}
        {noteOpen && <NoteField value={note} required={false} autoFocus onChange={setNote} />}
        <FoldedTimeChips
          button={(when) => t('entry.endAt', { when })}
          label={t('time.ended')}
          value={endTime}
          onChange={setEndTime}
        />
        {errorLine('later')}
        {!ready && (
          <p id={`${ids}-hint`} className={styles.hint}>
            {t('pump.required')}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={!ready || pending}
          aria-describedby={ready ? undefined : `${ids}-hint`}
        >
          {t('common.save')}
        </Button>
      </section>
    </form>
  );
}

/** The minutes a running pump would get if it ended at `endAt`: the elapsed minutes on the side(s) it runs on. */
export function measuredMinutes(pump: PumpEvent, endAt: number): SideValues {
  const minutes = pumpMinutes(Math.max(0, endAt - pump.startAt));
  return {
    left: pump.side === 'L' || pump.side === 'B' ? minutes : null,
    right: pump.side === 'R' || pump.side === 'B' ? minutes : null,
  };
}

/**
 * What the stop sheet changes before finishing: the minutes only once the parent has touched them (until
 * then the stop measures them itself, up to the moment it ends), and the ml typed (text that does not
 * parse becomes NaN, so the rules report it).
 */
export function pumpStopPatch(edited: SideValues | null, ml: MlValues): PumpPatch {
  const amounts = pumpAmounts({ minLeft: null, minRight: null, ...ml });
  return {
    ...(edited === null ? {} : { minLeft: edited.left, minRight: edited.right }),
    ...(amounts.mlLeft === undefined ? {} : { mlLeft: amounts.mlLeft }),
    ...(amounts.mlRight === undefined ? {} : { mlRight: amounts.mlRight }),
  };
}

/**
 * The pumping sheet while the pump runs (opened from Home's strip): how long it has run, the minutes it
 * would record (from the timer, until corrected), ml to add, the end time, and the stop.
 */
export function PumpStopForm({
  pump,
  babies,
  onClose,
  undoToast,
}: {
  pump: PumpEvent;
  babies: readonly Baby[];
  onClose: () => void;
  undoToast: (changes: readonly EventChange[]) => void;
}) {
  const t = useT();
  const ids = useId();
  const now = useNow(1000);
  const [end, setEnd] = useState<TimeChoice>(NOW_CHOICE);
  const [edited, setEdited] = useState<SideValues | null>(null);
  const [ml, setMl] = useState<MlValues>({ mlLeft: '', mlRight: '' });
  const [mlOpen, setMlOpen] = useState(false);
  const { error, setError, pending, run } = useEntrySave(babies, onClose, undoToast);
  // As in the other sheets: a stale error goes the moment the form changes.
  useEffect(() => setError(null), [end, edited, ml, setError]);

  const measured = edited === null;
  const shown = edited ?? measuredMinutes(pump, resolveTimeChoice(end, now));
  const side = pump.side === undefined ? null : t(`side.${pump.side}.button`);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async (at) => {
      const change = await stopPump(
        db,
        pump.id,
        at,
        pumpStopPatch(edited, ml),
        end.kind === 'now' ? undefined : resolveTimeChoice(end, at),
      );
      // Already stopped elsewhere: the sheet just closes, with nothing to undo.
      return change ? [change] : [];
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <p className={styles.running}>
        <span>{side === null ? t('home.pump') : t('strip.pumping', { side })}</span>
        <LiveDuration since={pump.startAt} />
      </p>
      <SideMinutes
        values={shown}
        onChange={setEdited}
        max={MAX_PUMP_MIN}
        // Corrected minutes set the session's start (one side after the other unless both at once), so
        // both sides together stay within the longest session, as in the other pump sheets.
        maxTotal={pump.side === 'B' ? undefined : PUMP_TOTAL_MIN}
        // From the timer until the parent changes them: muted, and the caption says where they come from.
        measured={measured}
        describedBy={measured ? `${ids}-measured` : undefined}
      />
      {measured && (
        <p id={`${ids}-measured`} className={styles.hint}>
          {t('pump.measured')}
        </p>
      )}
      <div className={styles.extras}>
        <OptionalMl value={ml} onChange={setMl} open={mlOpen} onOpen={() => setMlOpen(true)} />
      </div>
      <FoldedTimeChips
        button={(when) => t('entry.endAt', { when })}
        label={t('time.end')}
        value={end}
        onChange={setEnd}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <SheetFooter>
        <Button type="submit" variant="primary" size="lg" block disabled={pending}>
          {t('timer.stop')}
        </Button>
      </SheetFooter>
    </form>
  );
}
