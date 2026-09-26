import { useState } from 'react';
import { deleteBaby, listBabies } from '../../db/babies';
import { db } from '../../db/instance';
import type { Baby } from '../../domain/types';
import { useReportError, useReportLoadError } from '../shared/ErrorBanner';
import { useT } from '../app/I18nProvider';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useSheetSession } from '../shared/Sheet';
import { BabyFormDialog } from './BabyFormDialog';

export function BabiesCard() {
  const t = useT();
  const report = useReportError();
  const babies = useLiveQuery(() => listBabies(db), [], useReportLoadError()) ?? [];
  const [editing, setEditing] = useState<Baby | 'new' | null>(null);
  // While the dialog closes it keeps showing the baby that was being edited.
  const shown = useSheetSession(editing);

  const remove = async (baby: Baby) => {
    if (!window.confirm(t('babies.deleteConfirm', { name: baby.name }))) return;
    try {
      await deleteBaby(db, baby.id);
    } catch (error) {
      report(error);
    }
  };

  return (
    <div className="card">
      <h2>{t('babies.title')}</h2>
      <ul className="baby-list">
        {babies.map((baby) => (
          <li key={baby.id}>
            <span className="dot" style={{ background: baby.color }} aria-hidden="true" />
            <span className="name">{baby.name}</span>
            <button type="button" className="btn" onClick={() => setEditing(baby)}>
              {t('babies.edit')}
            </button>
            <button type="button" className="btn" onClick={() => void remove(baby)}>
              {t('babies.delete')}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
        {t('babies.add')}
      </button>
      <BabyFormDialog
        open={editing !== null}
        baby={shown === null || shown.value === 'new' ? undefined : shown.value}
        usedColors={babies.map((b) => b.color)}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
