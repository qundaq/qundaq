import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { listRecentEvents, stopEvent, switchBreastSide } from '../../db/events';
import { db } from '../../db/instance';
import type { Settings } from '../../db/settings';
import { babyStatus } from '../../domain/status';
import { DAY } from '../../domain/time';
import { BabyFormDialog } from '../babies/BabyFormDialog';
import { useReportError } from '../ErrorBanner';
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
  const report = useReportError();
  const babies = useLiveQuery(() => listBabies(db), []);
  const events = useLiveQuery(() => listRecentEvents(db, Date.now() - RECENT_WINDOW), []);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [adding, setAdding] = useState(false);

  if (babies === undefined || events === undefined) return <section aria-busy="true"><h1>{t('tab.home')}</h1></section>;

  const act = (action: () => Promise<void>) => {
    action().catch(report);
  };

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
          {babies.map((baby) => {
            const status = babyStatus(events, baby.id);
            const running = status.runningFeed;
            const asleep = status.sleep.state === 'asleep' ? status.sleep : null;
            return (
              <BabyCard key={baby.id} baby={baby} status={status} now={now}>
                {(running || asleep) && (
                  <div className="timer-actions">
                    {running && (
                      <>
                        <button type="button" className="btn" onClick={() => act(() => switchBreastSide(db, running.eventId))}>
                          {t('timer.switchSide')}
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => act(() => stopEvent(db, running.eventId))}>
                          {t('timer.stopFeed')}
                        </button>
                      </>
                    )}
                    {asleep && (
                      <button type="button" className="btn btn-primary" onClick={() => act(() => stopEvent(db, asleep.eventId))}>
                        {t('timer.wakeUp')}
                      </button>
                    )}
                  </div>
                )}
              </BabyCard>
            );
          })}
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
