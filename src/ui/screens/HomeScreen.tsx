import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { db } from '../../db/instance';
import type { Settings } from '../../db/settings';
import { BabyFormDialog } from '../babies/BabyFormDialog';
import { useT } from '../I18nProvider';
import { useLiveQuery } from '../useLiveQuery';

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => Promise<void>;
}

export function HomeScreen(_props: Props) {
  const t = useT();
  const babies = useLiveQuery(() => listBabies(db), []);
  const [adding, setAdding] = useState(false);

  if (babies === undefined) return <section aria-busy="true"><h1>{t('tab.home')}</h1></section>;

  return (
    <section>
      <h1>{t('tab.home')}</h1>
      {babies.length === 0 ? (
        <div className="card">
          <p>{t('home.empty')}</p>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            {t('babies.add')}
          </button>
        </div>
      ) : (
        babies.map((baby) => (
          <article key={baby.id} className="card baby-card" aria-label={baby.name} style={{ borderLeftColor: baby.color }}>
            <h2>{baby.name}</h2>
          </article>
        ))
      )}
      <BabyFormDialog open={adding} usedColors={babies.map((b) => b.color)} onClose={() => setAdding(false)} />
    </section>
  );
}
