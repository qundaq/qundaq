import { useEffect, useRef, useState, type FormEvent } from 'react';
import { logEvents, recentMedicationNames } from '../../db/events';
import { db } from '../../db/instance';
import type { Baby, Id } from '../../domain/types';
import { messageFor, useReportLoadError } from '../shared/ErrorBanner';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Sheet, useSheetSession } from '../shared/Sheet';
import { useLiveQuery } from '../shared/useLiveQuery';
import { BabyPicker, SingleBabyPicker } from './BabyPicker';
import {
  DEFAULT_OTHER_TYPE,
  buildDrafts,
  initialInput,
  resolveEntryTime,
  type InputKind,
  type MedicationInput,
  type OtherType,
  type SheetInput,
  type SheetKind,
} from './drafts';
import { BottleForm, BreastfeedForm, DiaperForm, SleepForm } from './forms/care';
import { NoteField, OtherTypeChips, type FormProps } from './forms/fields';
import { GrowthForm, MedicationForm, PumpForm, TemperatureForm } from './forms/other';
import { TimeField } from './TimeField';
import styles from './LogSheet.module.css';

interface Props {
  kind: SheetKind | null;
  babies: readonly Baby[];
  defaultBabyIds: readonly Id[];
  onClose: () => void;
  onLogged: (babyIds: Id[]) => void;
}

/** A measurement belongs to one child: these types take exactly one baby. */
const SINGLE_BABY: ReadonlySet<InputKind> = new Set<InputKind>(['growth', 'temperature']);

export function LogSheet({ kind, babies, defaultBabyIds, onClose, onLogged }: Props) {
  const t = useT();
  const session = useSheetSession(kind);
  // The "Diğer" chip lives here because the sheet's title follows it; every opening starts at the default.
  const [picked, setPicked] = useState<{ session: number; type: OtherType } | null>(null);
  const otherType =
    picked !== null && picked.session === session?.id ? picked.type : DEFAULT_OTHER_TYPE;
  const inputKind: InputKind | null =
    session === null ? null : session.value === 'other' ? otherType : session.value;
  return (
    <Sheet
      open={kind !== null}
      title={inputKind ? t(`sheet.${inputKind}.title`) : ''}
      onClose={onClose}
    >
      {session && inputKind && (
        <LogForm
          key={session.id}
          kind={session.value}
          inputKind={inputKind}
          onOtherTypeChange={(type) => setPicked({ session: session.id, type })}
          babies={babies}
          defaultBabyIds={defaultBabyIds}
          onClose={onClose}
          onLogged={onLogged}
        />
      )}
    </Sheet>
  );
}

interface FormArgs extends Omit<Props, 'kind'> {
  kind: SheetKind;
  inputKind: InputKind;
  onOtherTypeChange: (type: OtherType) => void;
}

function LogForm({
  kind,
  inputKind,
  onOtherTypeChange,
  babies,
  defaultBabyIds,
  onClose,
  onLogged,
}: FormArgs) {
  const t = useT();
  const known = defaultBabyIds.filter((id) => babies.some((b) => b.id === id));
  const [selected, setSelected] = useState<Id[]>(
    known.length > 0 ? known : babies[0] ? [babies[0].id] : [],
  );
  const [time, setTime] = useState<number | null>(null); // null = "now"
  const [input, setInput] = useState<SheetInput>(() => initialInput(inputKind));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false); // only for `disabled`; the ref below is the real guard
  const submitting = useRef(false); // set synchronously, so a second submit before the next render is refused
  // Switching the "Diğer" chip resets the type's own fields; the time, the note and the babies stay.
  if (input.kind !== inputKind) setInput(initialInput(inputKind));
  // A stale error is cleared the moment the form changes; moving this into every field handler would
  // scatter the rule, so the cascading extra render is accepted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setError(null), [input, selected, time, note]);

  const single = SINGLE_BABY.has(input.kind);
  const isTimer =
    (input.kind === 'breastfeed' || input.kind === 'sleep') && input.value.durationMin === null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    const at = resolveEntryTime(time, Date.now());
    const babyIds = single ? selected.slice(0, 1) : selected;
    try {
      await logEvents(db, buildDrafts(input, babyIds, at, kind === 'other' ? note : ''));
      // Only multi-baby choices become the next default; a one-baby measurement or a pump does not.
      if (input.kind !== 'pump' && !single) onLogged(selected);
      onClose();
      // The guard stays set: the form is done and only waits for its dialog to close.
    } catch (failure) {
      setError(messageFor(t, failure, babies));
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      {kind === 'other' && (
        <OtherTypeChips value={inputKind as OtherType} onChange={onOtherTypeChange} />
      )}
      {input.kind === 'pump' ? null : single ? (
        <SingleBabyPicker
          babies={babies}
          selected={selected[0] ?? null}
          onChange={(id) => setSelected([id])}
        />
      ) : (
        <BabyPicker babies={babies} selected={selected} onChange={setSelected} />
      )}
      <TimeField value={time} onChange={setTime} />
      {input.kind === 'breastfeed' && (
        <BreastfeedForm
          value={input.value}
          onChange={(value) => setInput({ kind: 'breastfeed', value })}
        />
      )}
      {input.kind === 'bottle' && (
        <BottleForm value={input.value} onChange={(value) => setInput({ kind: 'bottle', value })} />
      )}
      {input.kind === 'sleep' && (
        <SleepForm value={input.value} onChange={(value) => setInput({ kind: 'sleep', value })} />
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
      {kind === 'other' && (
        <NoteField value={note} required={input.kind === 'healthNote'} onChange={setNote} />
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t(isTimer ? 'sheet.start' : 'common.save')}
        </Button>
      </div>
    </form>
  );
}

/** The medicine form with chips for the medicines used lately (name and last dose). */
function RecentMedicationForm(props: FormProps<MedicationInput>) {
  const recent =
    useLiveQuery(() => recentMedicationNames(db, Date.now()), [], useReportLoadError()) ?? [];
  return <MedicationForm {...props} recent={recent} />;
}
