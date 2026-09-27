import { useState } from 'react';
import { deleteBaby, listBabies } from '../../db/babies';
import { db } from '../../db/instance';
import type { Baby } from '../../domain/types';
import { useReportError, useReportLoadError } from '../shared/ErrorBanner';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useSheetSession } from '../shared/Sheet';
import { BabyFormDialog } from './BabyFormDialog';
import { resolveBabyColor } from './colors';
import styles from './Babies.module.css';

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
    <Card>
      <h2>{t('babies.title')}</h2>
      <ul className={styles.list}>
        {babies.map((baby) => (
          <li key={baby.id}>
            <span
              className={styles.dot}
              style={{ background: resolveBabyColor(baby.color) }}
              aria-hidden="true"
            />
            <span className={styles.name}>{baby.name}</span>
            <Button icon="pencil" onClick={() => setEditing(baby)}>
              {t('babies.edit')}
            </Button>
            <Button variant="danger" icon="trash-2" onClick={() => void remove(baby)}>
              {t('babies.delete')}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={() => setEditing('new')}>
        {t('babies.add')}
      </Button>
      <BabyFormDialog
        open={editing !== null}
        baby={shown === null || shown.value === 'new' ? undefined : shown.value}
        usedColors={babies.map((b) => b.color)}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}
