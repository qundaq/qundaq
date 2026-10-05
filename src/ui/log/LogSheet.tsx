import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { recordEvents, recentMedicationNames, type EventChange } from '../../db/events';
import { db } from '../../db/instance';
import { lastBottle, nextSide } from '../../domain/defaults';
import { NOW_CHOICE, resolveTimeChoice, type TimeChoice } from '../../domain/entryTime';
import { MAX_DURATION_MS } from '../../domain/rules';
import { MINUTE } from '../../domain/time';
import type { Baby, BottleContents, EventDraft, Id, Side, TrackerEvent } from '../../domain/types';
import { messageFor, useReportError, useReportLoadError } from '../shared/ErrorBanner';
import { useT } from '../app/I18nProvider';
import { Sheet, SheetFooter, useSheetSession } from '../shared/Sheet';
import { Button } from '../shared/Button';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useMounted } from '../shared/useMounted';
import { FoldedTimeChips, TimeChips } from './TimeChips';
import { useUndoToast } from './useUndoToast';
import {
  buildDrafts,
  hasFeedMinutes,
  initialInput,
  type BreastfeedInput,
  type InputKind,
  type LogRequest,
  type MedicationInput,
  type OtherType,
  type SheetInput,
} from './drafts';
import { BottleForm, DiaperForm } from './forms/care';
import { NoteField, type FormProps } from './forms/fields';
import { OtherList } from './forms/OtherList';
import { GrowthForm, MedicationForm, PumpForm, TemperatureForm } from './forms/other';
import { SideMinutes, type SideValues } from './forms/SideMinutes';
import {
  OneTimerNote,
  SidePicker,
  StopTimerForm,
  TimerFields,
  runningTimer,
  type TimerMode,
} from './forms/timers';
import styles from './LogSheet.module.css';

interface Props {
  request: LogRequest | null;
  babies: readonly Baby[];
  /** Home's recent events with every running timer: the defaults, the one-timer note and the stop form read them. */
  events: readonly TrackerEvent[];
  onClose: () => void;
}

export function LogSheet({ request, babies, events, onClose }: Props) {
  const t = useT();
  const session = useSheetSession(request);
  // The "Other" sheet (quick.other, other.title) opens on a list of its four types; picking one shows
  // its form here. `pick` changes on every choice, so going back (onBack) and picking the same type
  // again always starts that form fresh, per Task 11.
  const [picked, setPicked] = useState<{ session: number; type: OtherType; pick: number } | null>(
    null,
  );
  const pickCounter = useRef(0);
  const current = picked !== null && picked.session === session?.id ? picked : null;
  const otherPending = session !== null && session.value.kind === 'other' && current === null;
  const inputKind: InputKind | null =
    session === null
      ? null
      : session.value.kind === 'other'
        ? (current?.type ?? null)
        : session.value.kind;
  // The standalone pumping request names no baby: the entry is the parent's.
  const requestBabyId = session && session.value.kind !== 'pump' ? session.value.babyId : null;
  const nameOf = (id: Id) => babies.find((baby) => baby.id === id)?.name ?? '';
  const undoToast = useUndoToast(nameOf);
  // A feed or sleep sheet opened for a baby whose timer of that kind runs stops it instead; "other" never
  // runs (runningTimer returns null for it), so the list step never reaches this.
  const running =
    session && !otherPending && session.value.kind !== 'pump' && requestBabyId !== null
      ? runningTimer(events, session.value.kind, requestBabyId)
      : null;
  // A sheet opened from a card is always that baby's: the title names them (sheet.diaper.title · their
  // name), for every care type, the "Other" list (other.title · their name) and each Other form. Pumping
  // is the parent's record, never a baby's, so its title carries no name.
  const babyName = requestBabyId === null ? '' : nameOf(requestBabyId);
  const title = !session
    ? ''
    : otherPending
      ? `${t('other.title')} · ${babyName}`
      : inputKind === null
        ? ''
        : inputKind === 'pump'
          ? t('sheet.pump.title')
          : `${t(`sheet.${inputKind}.title`)} · ${babyName}`;
  const onBack =
    session && session.value.kind === 'other' && !otherPending ? () => setPicked(null) : undefined;

  return (
    <Sheet open={request !== null} title={title} onBack={onBack} onClose={onClose}>
      {session && otherPending && (
        <OtherListStep
          onPick={(type) => {
            pickCounter.current += 1;
            setPicked({ session: session.id, type, pick: pickCounter.current });
          }}
        />
      )}
      {session &&
        inputKind &&
        !otherPending &&
        (running ? (
          <StopTimerForm
            key={session.id}
            timer={running}
            babies={babies}
            onClose={onClose}
            onStopped={(change) => undoToast([change])}
          />
        ) : inputKind === 'breastfeed' && requestBabyId !== null ? (
          <FeedForm
            key={session.id}
            babyId={requestBabyId}
            babies={babies}
            events={events}
            nameOf={nameOf}
            onClose={onClose}
            undoToast={undoToast}
          />
        ) : (
          <LogForm
            key={session.value.kind === 'other' ? `${session.id}-${current?.pick}` : session.id}
            kind={session.value.kind}
            babyId={requestBabyId}
            inputKind={inputKind}
            babies={babies}
            events={events}
            nameOf={nameOf}
            onClose={onClose}
            undoToast={undoToast}
          />
        ))}
    </Sheet>
  );
}

/** The Other list's medicine caption (other.caption.medication) reads the single latest one; the form's own recent chips query separately. */
function OtherListStep({ onPick }: { onPick: (type: OtherType) => void }) {
  const recent =
    useLiveQuery(() => recentMedicationNames(db, Date.now(), 1), [], useReportLoadError()) ?? [];
  return <OtherList recent={recent[0] ?? null} onPick={onPick} />;
}

interface FormArgs {
  kind: LogRequest['kind'];
  /** Null only for the standalone pumping sheet. */
  babyId: Id | null;
  inputKind: InputKind;
  babies: readonly Baby[];
  events: readonly TrackerEvent[];
  nameOf: (id: Id) => string;
  onClose: () => void;
  undoToast: (changes: readonly EventChange[]) => void;
}

/**
 * Saving a sheet's drafts: one save at a time (a second submit before the next render is refused), the
 * error line on a refusal, and the undo toast once saved. `build` runs at the moment of saving, so "now"
 * and "15 min ago" count from it.
 */
function useEntrySave(
  babies: readonly Baby[],
  onClose: () => void,
  undoToast: (changes: readonly EventChange[]) => void,
) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false); // only for `disabled`; the ref below is the real guard
  const submitting = useRef(false); // set synchronously, so a second submit before the next render is refused
  const mounted = useMounted();
  const report = useReportError();
  const save = async (build: (now: number) => EventDraft[], endRunning: boolean) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    const now = Date.now();
    try {
      const changes = await recordEvents(db, build(now), now, { endRunning });
      onClose();
      undoToast(changes);
      // The guard stays set: the form is done and only waits for its dialog to close.
    } catch (failure) {
      // Dismissed while saving: the form and its error line are gone, so the app's banner says it.
      if (!mounted()) {
        report(failure);
        return;
      }
      setError(messageFor(t, failure, babies));
      submitting.current = false;
      setPending(false);
    }
  };
  return { error, setError, pending, save };
}

/** The first input of a sheet: a bottle starts from the baby's last one. */
function firstInput(
  kind: InputKind,
  last: { ml: number; contents: BottleContents } | null,
): SheetInput {
  if (kind === 'bottle')
    return { kind, value: { ml: last?.ml ?? null, contents: last?.contents ?? 'breastmilk' } };
  return initialInput(kind);
}

function LogForm({
  kind,
  babyId,
  inputKind,
  babies,
  events,
  nameOf,
  onClose,
  undoToast,
}: FormArgs) {
  const t = useT();
  const [time, setTime] = useState<TimeChoice>(NOW_CHOICE);
  // The baby's last bottle is the opening baby's, taken once, so it does not move while the sheet is open.
  const [lastBottleInput] = useState(() =>
    inputKind === 'bottle' && babyId !== null ? lastBottle(events, babyId) : null,
  );
  const [input, setInput] = useState<SheetInput>(() => firstInput(inputKind, lastBottleInput));
  const [mode, setMode] = useState<TimerMode>('start');
  const [note, setNote] = useState('');
  // The Other sheet's own tertiary note.add button: once revealed, the note field stays up for the
  // rest of this form's life. A health note shows it from the start instead (never toggled).
  const [noteOpen, setNoteOpen] = useState(false);
  const { error, setError, pending, save } = useEntrySave(babies, onClose, undoToast);
  // A stale error is cleared the moment the form changes; moving this into every field handler would
  // scatter the rule, so the cascading extra render is accepted.
  useEffect(() => setError(null), [input, time, note, mode, setError]);

  // The Other sheet and the pumping sheet take a note; a card's bottle, sleep and diaper sheets do not.
  const noted = kind === 'other' || kind === 'pump';
  const sleep = input.kind === 'sleep' ? input : null;
  const starting = sleep !== null && mode === 'start';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sleep && mode === 'done' && sleep.value.durationMin === null) {
      setError(t('sheet.durationRequired'));
      return;
    }
    void save(
      (now) =>
        buildDrafts(
          input,
          babyId === null ? [] : [babyId],
          resolveTimeChoice(time, now),
          noted ? note : '',
        ),
      // A started timer ends each baby's other running timer at its start (the one-timer note says so).
      starting,
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      {sleep && (
        <TimerFields input={sleep} mode={mode} onModeChange={setMode} onChange={setInput} />
      )}
      {starting && babyId !== null && (
        <OneTimerNote kind="sleep" babyIds={[babyId]} events={events} nameOf={nameOf} />
      )}
      {input.kind === 'bottle' && (
        <BottleForm
          value={input.value}
          last={lastBottleInput}
          onChange={(value) => setInput({ kind: 'bottle', value })}
        />
      )}
      {input.kind === 'diaper' && (
        <DiaperForm value={input.value} onChange={(value) => setInput({ kind: 'diaper', value })} />
      )}
      {input.kind === 'pump' && (
        <PumpForm value={input.value} onChange={(value) => setInput({ kind: 'pump', value })} />
      )}
      {input.kind === 'growth' && (
        <GrowthForm value={input.value} onChange={(value) => setInput({ kind: 'growth', value })} />
      )}
      {input.kind === 'temperature' && (
        <TemperatureForm
          value={input.value}
          onChange={(value) => setInput({ kind: 'temperature', value })}
        />
      )}
      {input.kind === 'medication' && (
        <RecentMedicationForm
          value={input.value}
          onChange={(value) => setInput({ kind: 'medication', value })}
        />
      )}
      <TimeChips
        label={t(sleep ? (starting ? 'time.start' : 'time.end') : 'time.when')}
        value={time}
        onChange={setTime}
      />
      {noted &&
        (input.kind === 'healthNote' ? (
          <NoteField value={note} required onChange={setNote} />
        ) : noteOpen ? (
          <NoteField value={note} required={false} autoFocus onChange={setNote} />
        ) : (
          <Button variant="tertiary" onClick={() => setNoteOpen(true)}>
            {t('note.add')}
          </Button>
        ))}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <SheetFooter>
        <Button type="submit" variant="primary" size="lg" block disabled={pending}>
          {t(starting ? 'sheet.startSleep' : 'common.save')}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** The longest feed in minutes (rule too-long): "log afterwards" lets both sides together reach it, no more. */
const FEED_MAX_MIN = MAX_DURATION_MS.breastfeed / MINUTE;

/**
 * The feed sheet, one screen without modes: on top the two side buttons start the timer at once (the
 * start time stays "now" unless changed under them); below, set apart, "log afterwards" records a
 * finished feed from minutes per side, ending at the chosen time.
 */
function FeedForm({
  babyId,
  babies,
  events,
  nameOf,
  onClose,
  undoToast,
}: Omit<FormArgs, 'kind' | 'inputKind' | 'babyId'> & { babyId: Id }) {
  const t = useT();
  const ids = useId();
  // The side due next is the opening baby's, taken once, so it does not move while the sheet is open.
  const [dueSide] = useState<Side>(() => nextSide(events, babyId));
  const [startTime, setStartTime] = useState<TimeChoice>(NOW_CHOICE);
  const [minutes, setMinutes] = useState<SideValues>({ left: null, right: null });
  const [endTime, setEndTime] = useState<TimeChoice>(NOW_CHOICE);
  // Which action the error line belongs to: it shows next to that action.
  const [errorAt, setErrorAt] = useState<'start' | 'later'>('start');
  const { error, setError, pending, save } = useEntrySave(babies, onClose, undoToast);
  // As in LogForm: a stale error goes the moment the form changes.
  useEffect(() => setError(null), [startTime, minutes, endTime, setError]);

  const later: BreastfeedInput = { minLeft: minutes.left, minRight: minutes.right };
  const ready = hasFeedMinutes(later);

  const start = (side: Side) => {
    setErrorAt('start');
    // A started feed ends the baby's running sleep at its start (the one-timer note says so).
    void save(
      (now) =>
        buildDrafts(
          { kind: 'breastfeed', value: { timer: side } },
          [babyId],
          resolveTimeChoice(startTime, now),
        ),
      true,
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // An implicit submit (Enter in a field) with no minutes does nothing, as the disabled button.
    if (!ready) return;
    setErrorAt('later');
    void save(
      (now) =>
        buildDrafts(
          { kind: 'breastfeed', value: later },
          [babyId],
          resolveTimeChoice(endTime, now),
        ),
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

  return (
    <form onSubmit={submit} noValidate>
      <section aria-labelledby={`${ids}-start`}>
        <h3 id={`${ids}-start`} className={styles.sectionTitle}>
          {t('feed.start')}
        </h3>
        <OneTimerNote kind="breastfeed" babyIds={[babyId]} events={events} nameOf={nameOf} />
        <SidePicker
          events={events}
          babyId={babyId}
          next={dueSide}
          disabled={pending}
          onPick={start}
        />
        <FoldedTimeChips
          button={(when) => t('feed.startAt', { when })}
          label={t('time.start')}
          value={startTime}
          onChange={setStartTime}
        />
        {errorLine('start')}
      </section>
      <section aria-labelledby={`${ids}-later`} className={styles.later}>
        <h3 id={`${ids}-later`} className={styles.sectionTitle}>
          {t('feed.later')}
        </h3>
        <SideMinutes
          values={minutes}
          onChange={setMinutes}
          max={FEED_MAX_MIN}
          maxTotal={FEED_MAX_MIN}
        />
        <FoldedTimeChips
          button={(when) => t('feed.endAt', { when })}
          label={t('time.ended')}
          value={endTime}
          onChange={setEndTime}
        />
        {errorLine('later')}
        {!ready && (
          <p id={`${ids}-hint`} className={styles.hint}>
            {t('sheet.durationRequired')}
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

/** The medicine form with chips for the medicines used lately (name and last dose). */
function RecentMedicationForm(props: FormProps<MedicationInput>) {
  const recent =
    useLiveQuery(() => recentMedicationNames(db, Date.now()), [], useReportLoadError()) ?? [];
  return <MedicationForm {...props} recent={recent} />;
}
