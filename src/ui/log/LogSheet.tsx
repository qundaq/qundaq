import { useEffect, useState, type FormEvent } from 'react';
import { logEvents } from '../../db/events';
import { db } from '../../db/instance';
import { fromLocalInputValue, toLocalInputValue } from '../../domain/time';
import type { Baby, Id } from '../../domain/types';
import { messageFor } from '../ErrorBanner';
import { useT } from '../I18nProvider';
import { Sheet } from '../Sheet';
import { BabyPicker } from './BabyPicker';
import { DEFAULT_INPUTS, buildDrafts, type SheetInput, type SheetKind } from './drafts';
import { BottleForm, BreastfeedForm, DiaperForm, SleepForm } from './forms';
import { TimeField } from './TimeField';

interface Props {
  kind: SheetKind | null;
  babies: readonly Baby[];
  defaultBabyIds: readonly Id[];
  onClose: () => void;
  onLogged: (babyIds: Id[]) => void;
}

function initialInput(kind: SheetKind): SheetInput {
  return { kind, value: DEFAULT_INPUTS[kind] } as SheetInput;
}

export function LogSheet({ kind, babies, defaultBabyIds, onClose, onLogged }: Props) {
  const t = useT();
  return (
    <Sheet open={kind !== null} title={kind ? t(`sheet.${kind}.title`) : ''} onClose={onClose}>
      {kind && <LogForm key={kind} kind={kind} babies={babies} defaultBabyIds={defaultBabyIds} onClose={onClose} onLogged={onLogged} />}
    </Sheet>
  );
}

function LogForm({ kind, babies, defaultBabyIds, onClose, onLogged }: Props & { kind: SheetKind }) {
  const t = useT();
  const known = defaultBabyIds.filter((id) => babies.some((b) => b.id === id));
  const [selected, setSelected] = useState<Id[]>(known.length > 0 ? known : babies[0] ? [babies[0].id] : []);
  const [time, setTime] = useState(() => toLocalInputValue(Date.now()));
  const [input, setInput] = useState<SheetInput>(() => initialInput(kind));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setError(null), [input, selected, time]);

  const isTimer = (input.kind === 'breastfeed' || input.kind === 'sleep') && input.value.durationMin === null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const at = fromLocalInputValue(time) ?? Date.now();
    try {
      await logEvents(db, buildDrafts(input, selected, at));
      onLogged(selected);
      onClose();
    } catch (failure) {
      setError(messageFor(t, failure));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <BabyPicker babies={babies} selected={selected} onChange={setSelected} />
      <TimeField value={time} onChange={setTime} />
      {input.kind === 'breastfeed' && (
        <BreastfeedForm value={input.value} onChange={(value) => setInput({ kind: 'breastfeed', value })} />
      )}
      {input.kind === 'bottle' && <BottleForm value={input.value} onChange={(value) => setInput({ kind: 'bottle', value })} />}
      {input.kind === 'sleep' && <SleepForm value={input.value} onChange={(value) => setInput({ kind: 'sleep', value })} />}
      {input.kind === 'diaper' && <DiaperForm value={input.value} onChange={(value) => setInput({ kind: 'diaper', value })} />}
      {error && (
        <p role="alert" className="status-warn">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {t(isTimer ? 'sheet.start' : 'common.save')}
        </button>
      </div>
    </form>
  );
}
