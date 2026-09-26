import { useRef, useState, type FormEvent } from 'react';
import { db } from '../../db/instance';
import { renameMix, saveMix } from '../../db/mixes';
import { MIX_NAME_MAX, ValidationError } from '../../domain/rules';
import type { Mix, MixLayer } from '../../domain/types';
import { messageFor } from '../ErrorBanner';
import { useT } from '../I18nProvider';
import { Sheet, useSheetSession } from '../Sheet';

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
      <label className="field">
        {t('sounds.mix.name')}
        <input
          value={name}
          maxLength={MIX_NAME_MAX}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="status-warn">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
