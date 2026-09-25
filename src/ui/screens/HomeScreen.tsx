import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { listRecentEvents } from '../../db/events';
import { db } from '../../db/instance';
import type { Settings } from '../../db/settings';
import { babyStatus } from '../../domain/status';
import { DAY } from '../../domain/time';
import { BabyFormDialog } from '../babies/BabyFormDialog';
import { BabyCard } from '../home/BabyCard';
import { QuickActions } from '../home/QuickActions';
import { useT } from '../I18nProvider';
import type { SheetKind } from '../log/drafts';
import { LogSheet } from '../log/LogSheet';
import { useLiveQuery } from '../useLiveQuery';
import { useNow } from '../useNow';

/** How far back Home looks for "last feed / diaper / wake-up". Running timers are always included. */
const RECENT_WINDOW = 7 * DAY;

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => Promise<void>;
}

export function HomeScreen({ settings, onSettingsChange }: Props) {
  const t = useT();
  const now = useNow();
  const babies = useLiveQuery(() => listBabies(db), []);
  const events = useLiveQuery(() => listRecentEvents(db, Date.now() - RECENT_WINDOW), []);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [adding, setAdding] = useState(false);

  if (babies === undefined || events === undefined) return <section aria-busy="true"><h1>{t('tab.home')}</h1></section>;

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
        <>
          {babies.map((baby) => (
            <BabyCard key={baby.id} baby={baby} status={babyStatus(events, baby.id)} now={now} />
          ))}
          <QuickActions onPick={setSheet} />
        </>
      )}
      <BabyFormDialog open={adding} usedColors={babies.map((b) => b.color)} onClose={() => setAdding(false)} />
      <LogSheet
        kind={sheet}
        babies={babies}
        defaultBabyIds={settings.lastBabyIds}
        onClose={() => setSheet(null)}
        onLogged={(ids) => void onSettingsChange({ lastBabyIds: ids })}
      />
    </section>
  );
}
