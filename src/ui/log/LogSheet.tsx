import { useEffect, useRef, useState, type FormEvent } from 'react';
import { recordEvents, recentMedicationNames, type EventChange } from '../../db/events';
import { db } from '../../db/instance';
import { lastBottle, nextSide } from '../../domain/defaults';
import { NOW_CHOICE, resolveTimeChoice, type TimeChoice } from '../../domain/entryTime';
import type { Baby, BottleContents, Id, Side, TrackerEvent } from '../../domain/types';
import { messageFor, useReportError, useReportLoadError } from '../shared/ErrorBanner';
import { useT } from '../app/I18nProvider';
import { Sheet, SheetFooter, useSheetSession } from '../shared/Sheet';
import { Button } from '../shared/Button';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useMounted } from '../shared/useMounted';
import { BabyChips } from './BabyChips';
import { TimeChips } from './TimeChips';
import { useUndoToast } from './useUndoToast';
import {
  buildDrafts,
  initialInput,
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

/** A measurement belongs to one child: these types take exactly one baby. */
const SINGLE_BABY: ReadonlySet<InputKind> = new Set<InputKind>(['growth', 'temperature']);

export function LogSheet({ request, babies, events, onClose }: Props) {
  const t = useT();
  const session = useSheetSession(request);
  // The "Other" sheet (quick.other, other.title) opens on a list of its five types; picking one shows
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
  const nameOf = (id: Id) => babies.find((baby) => baby.id === id)?.name ?? '';
  const undoToast = useUndoToast(nameOf);
  // A feed or sleep sheet opened for a baby whose timer of that kind runs stops it instead; "other" never
  // runs (runningTimer returns null for it), so the list step never reaches this.
  const running =
    session && !otherPending
      ? runningTimer(events, session.value.kind, session.value.babyId)
      : null;
  // With one baby, or a stop (one baby's timer), the title names them too (sheet.diaper.title · their
  // name); with more, the chips below say who. Pumping is the parent's record: no name. The "Other"
  // sheet's own title (other.title) is always just its list title or the type's name (its form) — never a baby's.
  const named = running !== null || (babies.length === 1 && inputKind !== 'pump');
  const title = !session
    ? ''
    : otherPending
      ? t('other.title')
      : inputKind === null
        ? ''
        : session.value.kind === 'other'
          ? t(`sheet.${inputKind}.title`)
          : named
            ? `${t(`sheet.${inputKind}.title`)} · ${nameOf(session.value.babyId)}`
            : t(`sheet.${inputKind}.title`);
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
        ) : (
          <LogForm
            key={session.value.kind === 'other' ? `${session.id}-${current?.pick}` : session.id}
            kind={session.value.kind}
            babyId={session.value.babyId}
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
  babyId: Id;
  inputKind: InputKind;
  babies: readonly Baby[];
  events: readonly TrackerEvent[];
  nameOf: (id: Id) => string;
  onClose: () => void;
  undoToast: (changes: readonly EventChange[]) => void;
}

/** The first input of a sheet: a feed starts on the side due next; a bottle starts from the baby's last one. */
function firstInput(
  kind: InputKind,
  dueSide: Side,
  last: { ml: number; contents: BottleContents } | null,
): SheetInput {
  if (kind === 'breastfeed') return { kind, value: { side: dueSide, durationMin: null } };
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
  const [selected, setSelected] = useState<Id[]>([babyId]);
  const [time, setTime] = useState<TimeChoice>(NOW_CHOICE);
  // The side due next, and the baby's last bottle, are the opening baby's, taken once, so neither moves
  // while the sheet is open.
  const [dueSide] = useState(() => nextSide(events, babyId));
  const [lastBottleInput] = useState(() =>
    inputKind === 'bottle' ? lastBottle(events, babyId) : null,
  );
  const [input, setInput] = useState<SheetInput>(() =>
    firstInput(inputKind, dueSide, lastBottleInput),
  );
  const [mode, setMode] = useState<TimerMode>('start');
  const [note, setNote] = useState('');
  // The Other sheet's own tertiary note.add button: once revealed, the note field stays up for the
  // rest of this form's life. A health note shows it from the start instead (never toggled).
  const [noteOpen, setNoteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false); // only for `disabled`; the ref below is the real guard
  const submitting = useRef(false); // set synchronously, so a second submit before the next render is refused
  const mounted = useMounted();
  const report = useReportError();
  // A stale error is cleared the moment the form changes; moving this into every field handler would
  // scatter the rule, so the cascading extra render is accepted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setError(null), [input, selected, time, note, mode]);

  const single = SINGLE_BABY.has(input.kind);
  const timer = input.kind === 'breastfeed' || input.kind === 'sleep' ? input : null;
  const starting = timer !== null && mode === 'start';

  const save = async (next: SheetInput) => {
    if (submitting.current) return;
    if (
      (next.kind === 'breastfeed' || next.kind === 'sleep') &&
      mode === 'done' &&
      next.value.durationMin === null
    ) {
      setError(t('sheet.durationRequired'));
      return;
    }
    submitting.current = true;
    setPending(true);
    const now = Date.now();
    const babyIds = single ? selected.slice(0, 1) : selected;
    try {
      const changes = await recordEvents(
        db,
        buildDrafts(next, babyIds, resolveTimeChoice(time, now), kind === 'other' ? note : ''),
        now,
        // A started timer ends each baby's other running timer at its start (the one-timer note says so).
        { endRunning: starting },
      );
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Feed start mode has no submit button; the side buttons are the only way to start, so an implicit
    // submit (e.g. Enter in the time field) must not start a feed on a possibly stale side.
    if (starting && input.kind === 'breastfeed') return;
    void save(input);
  };

  return (
    <form onSubmit={submit} noValidate>
      {input.kind !== 'pump' && (
        <BabyChips babies={babies} selected={selected} single={single} onChange={setSelected} />
      )}
      {timer && (
        <TimerFields input={timer} mode={mode} onModeChange={setMode} onChange={setInput} />
      )}
      {timer && starting && (
        <OneTimerNote kind={timer.kind} babyIds={selected} events={events} nameOf={nameOf} />
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
        label={t(timer ? (starting ? 'time.start' : 'time.end') : 'time.when')}
        value={time}
        onChange={setTime}
      />
      {kind === 'other' &&
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
      {starting && input.kind === 'breastfeed' ? (
        // The side buttons are this mode's action, where the footer would be.
        <SidePicker
          events={events}
          babyId={babyId}
          next={dueSide}
          disabled={pending}
          onPick={(side) => void save({ kind: 'breastfeed', value: { side, durationMin: null } })}
        />
      ) : (
        <SheetFooter>
          <Button type="submit" variant="primary" size="lg" block disabled={pending}>
            {t(starting ? 'sheet.startSleep' : 'common.save')}
          </Button>
        </SheetFooter>
      )}
    </form>
  );
}

/** The medicine form with chips for the medicines used lately (name and last dose). */
function RecentMedicationForm(props: FormProps<MedicationInput>) {
  const recent =
    useLiveQuery(() => recentMedicationNames(db, Date.now()), [], useReportLoadError()) ?? [];
  return <MedicationForm {...props} recent={recent} />;
}
