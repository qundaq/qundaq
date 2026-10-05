import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { deleteEvent, stopEvent, updateEvent } from '../../db/events';
import { db } from '../../db/instance';
import { isOpen } from '../../domain/rules';
import type { Baby, TrackerEvent } from '../../domain/types';
import { messageFor } from '../shared/ErrorBanner';
import { useLocale, useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { SingleBabyPicker } from '../log/BabyPicker';
import { decimalSeparatorFor, eventToInput, inputToDraft, type EditInput } from '../log/edits';
import { BottleForm, DiaperForm } from '../log/forms/care';
import { NoteField } from '../log/forms/fields';
import { GrowthForm, MedicationForm, PumpForm, TemperatureForm } from '../log/forms/other';
import { EditTimeField, OptionalTimeField } from '../log/TimeField';
import { Sheet, useSheetSession } from '../shared/Sheet';
import { DELETE_CONFIRM_MAX_MS, deleteTap } from '../shared/confirm';
import styles from './Log.module.css';
import { SegmentsEditor } from './SegmentsEditor';

interface Props {
  event: TrackerEvent | null;
  babies: readonly Baby[];
  onClose: () => void;
}

/** Edits or deletes one stored entry. Opened from a log (history) row, or from Home's "forgot to stop?" hint. */
export function EditSheet({ event, babies, onClose }: Props) {
  const t = useT();
  const session = useSheetSession(event);
  const title = session ? `${t('edit.title')} · ${t(`sheet.${session.value.type}.title`)}` : '';
  return (
    <Sheet open={event !== null} title={title} onClose={onClose}>
      {session && (
        <EditForm key={session.id} event={session.value} babies={babies} onDone={onClose} />
      )}
    </Sheet>
  );
}

function EditForm({
  event,
  babies,
  onDone,
}: {
  event: TrackerEvent;
  babies: readonly Baby[];
  onDone: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [initial] = useState<EditInput>(() => eventToInput(event, decimalSeparatorFor(locale)));
  const [input, setInput] = useState<EditInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false); // only for `disabled`; the ref below is the real guard
  const busy = useRef(false); // set synchronously, so a second action before the next render is refused
  const form = useRef<HTMLFormElement>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const saveFirstId = useId();
  const running = isOpen(event);
  const dirty = JSON.stringify(input) !== JSON.stringify(initial);

  // A stale error is cleared the moment the form changes; moving this into every field handler would
  // scatter the rule, so the cascading extra render is accepted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setError(null), [input]);
  useEffect(() => {
    // Esc while a save, stop or delete is in flight would unmount the form and lose its outcome (a failure
    // shown nowhere, or a "cancelled" save that lands anyway). The dialog's cancel event does not bubble, so
    // listen on the dialog itself.
    const dialog = form.current?.closest('dialog');
    if (!dialog) return;
    const holdWhileBusy = (cancel: Event) => {
      if (busy.current) cancel.preventDefault();
    };
    dialog.addEventListener('cancel', holdWhileBusy);
    return () => dialog.removeEventListener('cancel', holdWhileBusy);
  }, []);
  useEffect(() => {
    if (armedAt === null) return;
    const timer = window.setTimeout(() => setArmedAt(null), DELETE_CONFIRM_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [armedAt]);

  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await action();
      onDone(); // the guard stays set: the form is done and only waits for its dialog to close
    } catch (failure) {
      setError(messageFor(t, failure, babies));
      busy.current = false;
      setPending(false);
    }
  };

  const save = (submitted: FormEvent) => {
    submitted.preventDefault();
    void run(() => updateEvent(db, event.id, inputToDraft(input)));
  };

  const tapDelete = () => {
    const tap = deleteTap(armedAt, Date.now());
    setArmedAt(tap.armedAt);
    if (tap.confirmed) void run(() => deleteEvent(db, event.id));
  };

  return (
    <form ref={form} onSubmit={save} noValidate>
      {input.type !== 'pump' && babies.length > 1 && (
        <SingleBabyPicker
          babies={babies}
          selected={input.babyId}
          onChange={(babyId) => setInput({ ...input, babyId })}
        />
      )}
      {input.type === 'sleep' || input.type === 'breastfeed' ? (
        <>
          <EditTimeField
            label={t('edit.start')}
            value={input.startAt}
            stored={event.startAt}
            onChange={(startAt) => setInput({ ...input, startAt })}
          />
          {input.type === 'sleep' && input.endAt !== null && !running && (
            <EditTimeField
              label={t('edit.end')}
              value={input.endAt}
              stored={event.endAt}
              onChange={(endAt) => setInput({ ...input, endAt })}
            />
          )}
          {input.type === 'breastfeed' && (
            <SegmentsEditor value={input} running={running} onChange={setInput} />
          )}
          {running && (
            <OptionalTimeField
              label={t('edit.endOptional')}
              value={input.endAt}
              onChange={(endAt) => setInput({ ...input, endAt })}
            />
          )}
        </>
      ) : input.type === 'pump' ? (
        // A finished pump is edited by its end (its start follows from the minutes), a running one by its start.
        input.endAt === null ? (
          <EditTimeField
            label={t('sheet.time')}
            value={input.startAt}
            stored={event.startAt}
            onChange={(startAt) => setInput({ ...input, startAt })}
          />
        ) : (
          <EditTimeField
            label={t('sheet.time')}
            value={input.endAt}
            stored={event.endAt}
            onChange={(endAt) => setInput({ ...input, endAt })}
          />
        )
      ) : (
        <EditTimeField
          label={t('sheet.time')}
          value={input.startAt}
          stored={event.startAt}
          onChange={(startAt) => setInput({ ...input, startAt })}
        />
      )}
      {input.type === 'bottle' && (
        // Editing an existing bottle: no "last time" caption (this record is that last time).
        <BottleForm
          value={input.value}
          last={null}
          onChange={(value) => setInput({ ...input, value })}
        />
      )}
      {input.type === 'diaper' && (
        <DiaperForm value={input.value} onChange={(value) => setInput({ ...input, value })} />
      )}
      {input.type === 'pump' && (
        <PumpForm value={input.value} onChange={(value) => setInput({ ...input, value })} />
      )}
      {input.type === 'growth' && (
        <GrowthForm value={input.value} onChange={(value) => setInput({ ...input, value })} />
      )}
      {input.type === 'temperature' && (
        <TemperatureForm value={input.value} onChange={(value) => setInput({ ...input, value })} />
      )}
      {input.type === 'medication' && (
        <MedicationForm
          value={input.value}
          recent={[]}
          onChange={(value) => setInput({ ...input, value })}
        />
      )}
      <NoteField
        value={input.note}
        required={input.type === 'healthNote'}
        onChange={(note) => setInput({ ...input, note })}
      />
      {running && (
        <div className={styles.editStop}>
          <Button
            variant="secondary"
            size="lg"
            block
            disabled={dirty || pending}
            aria-describedby={dirty ? saveFirstId : undefined}
            onClick={() => void run(() => stopEvent(db, event.id))}
          >
            {t(
              event.type === 'sleep'
                ? 'timer.wakeUp'
                : event.type === 'pump'
                  ? 'timer.stop'
                  : 'timer.stopFeed',
            )}
          </Button>
          {dirty && (
            <p id={saveFirstId} className={[styles.muted, styles.small].filter(Boolean).join(' ')}>
              {t('edit.saveFirst')}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button disabled={pending} onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t('common.save')}
        </Button>
      </div>
      <div className={styles.editDelete}>
        <Button
          variant="danger"
          block
          armed={armedAt !== null}
          disabled={pending}
          onClick={tapDelete}
        >
          {t(armedAt === null ? 'edit.delete' : 'edit.deleteConfirm')}
        </Button>
      </div>
    </form>
  );
}
