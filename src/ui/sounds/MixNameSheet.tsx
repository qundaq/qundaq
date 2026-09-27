import { useRef, useState, type FormEvent } from 'react';
import { db } from '../../db/instance';
import { renameMix, saveMix } from '../../db/mixes';
import { MIX_NAME_MAX, ValidationError } from '../../domain/rules';
import type { Mix, MixLayer } from '../../domain/types';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { messageFor } from '../shared/ErrorBanner';
import { Field } from '../shared/Field';
import { Sheet, useSheetSession } from '../shared/Sheet';
import styles from './Sounds.module.css';

/** Opened with the layers to save under a new name, or with a mix to rename. */
export type MixNameRequest =
  { kind: 'save'; layers: readonly MixLayer[] } | { kind: 'rename'; mix: Mix };

export function MixNameSheet({
  request,
  onClose,
}: {
  request: MixNameRequest | null;
  onClose: () => void;
}) {
  const t = useT();
  const session = useSheetSession(request);
  return (
    <Sheet
      open={request !== null}
      title={t(session?.value.kind === 'rename' ? 'sounds.mix.renameTitle' : 'sounds.saveMix')}
      onClose={onClose}
    >
      {session && <MixNameForm key={session.id} request={session.value} onDone={onClose} />}
    </Sheet>
  );
}

function MixNameForm({ request, onDone }: { request: MixNameRequest; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(request.kind === 'rename' ? request.mix.name : '');
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      if (request.kind === 'rename') await renameMix(db, request.mix.id, name);
      else await saveMix(db, name, request.layers);
      onDone(); // the guard stays set: the form only waits for its dialog to close
    } catch (failure) {
      // The generic "too long" text names medicines and notes; a mix has its own line.
      const tooLong =
        failure instanceof ValidationError && failure.violations.includes('text-too-long');
      setError(tooLong ? t('sounds.mix.nameTooLong') : messageFor(t, failure));
      submitting.current = false;
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Field label={t('sounds.mix.name')} error={error}>
        <input
          value={name}
          maxLength={MIX_NAME_MAX}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <div className={styles.formActions}>
        <Button onClick={onDone}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary">
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
