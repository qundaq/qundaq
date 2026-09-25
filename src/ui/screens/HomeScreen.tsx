import { useRef, useState } from 'react';
import { listBabies } from '../../db/babies';
import { listRecentEvents, stopEvent, switchBreastSide } from '../../db/events';
import { db } from '../../db/instance';
import type { Settings } from '../../db/settings';
import { forgottenTimer } from '../../domain/health';
import { babyStatus } from '../../domain/status';
import { DAY } from '../../domain/time';
import type { Id, TrackerEvent } from '../../domain/types';
import { BabyFormDialog } from '../babies/BabyFormDialog';
import { useReportError, useReportLoadError } from '../ErrorBanner';
import { EditSheet } from '../history/EditSheet';
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
  const tick = useNow();
  const report = useReportError();
  const reportLoadError = useReportLoadError();
  const babies = useLiveQuery(() => listBabies(db), [], reportLoadError);
  const events = useLiveQuery(() => listRecentEvents(db, Date.now() - RECENT_WINDOW), [], reportLoadError);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TrackerEvent | null>(null);
  // Timer buttons already in flight, per event: a double tap must not run the same action twice.
  const busy = useRef<Set<Id>>(new Set());

  if (babies === undefined || events === undefined) return <section aria-busy="true"><h1>{t('tab.home')}</h1></section>;

  // The tick can be up to 30 s old; data written since then must never look like it is in the future.
  const now = Math.max(tick, Date.now());
  const byId = new Map(events.map((event) => [event.id, event]));

  const act = (eventId: Id, action: () => Promise<unknown>) => {
    if (busy.current.has(eventId)) return;
    busy.current.add(eventId);
    action()
      .catch((error: unknown) => report(error))
      .finally(() => busy.current.delete(eventId));
  };

  /** Under a timer that has run suspiciously long: opens it in the edit sheet to end it at the right time. */
  const forgotHint = (babyName: string, eventId: Id) => {
    const event = byId.get(eventId);
    if (!event || !forgottenTimer(event, now)) return null;
    return (
      <button type="button" className="btn btn-link" aria-label={`${babyName}: ${t('timer.forgot')}`} onClick={() => setEditing(event)}>
        {t('timer.forgot')}
      </button>
    );
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
                        <div className="timer-row">
                          <button
                            type="button"
                            className="btn"
                            aria-label={`${baby.name}: ${t('timer.switchSide')}`}
                            onClick={() => act(running.eventId, () => switchBreastSide(db, running.eventId))}
                          >
                            {t('timer.switchSide')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            aria-label={`${baby.name}: ${t('timer.stopFeed')}`}
                            onClick={() => act(running.eventId, () => stopEvent(db, running.eventId))}
                          >
                            {t('timer.stopFeed')}
                          </button>
                        </div>
                        {forgotHint(baby.name, running.eventId)}
                      </>
                    )}
                    {asleep && (
                      <>
                        <div className="timer-row">
                          <button
                            type="button"
                            className="btn btn-primary"
                            aria-label={`${baby.name}: ${t('timer.wakeUp')}`}
                            onClick={() => act(asleep.eventId, () => stopEvent(db, asleep.eventId))}
                          >
                            {t('timer.wakeUp')}
                          </button>
                        </div>
                        {forgotHint(baby.name, asleep.eventId)}
                      </>
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
      <EditSheet event={editing} babies={babies} onClose={() => setEditing(null)} />
    </section>
  );
}
