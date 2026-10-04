import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { db } from '../../db/instance';
import type { Baby } from '../../domain/types';
import { useReportLoadError } from '../shared/ErrorBanner';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Card, CardTitle } from '../shared/Card';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useSheetSession } from '../shared/Sheet';
import { BabyFormDialog } from './BabyFormDialog';
import { resolveBabyColor } from './colors';
import styles from './Babies.module.css';

export function BabiesCard() {
  const t = useT();
  const babies = useLiveQuery(() => listBabies(db), [], useReportLoadError()) ?? [];
  const [editing, setEditing] = useState<Baby | 'new' | null>(null);
  // While the dialog closes it keeps showing the baby that was being edited.
  const shown = useSheetSession(editing);

  return (
    <Card>
      <CardTitle>{t('babies.title')}</CardTitle>
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
