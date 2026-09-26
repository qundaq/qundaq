import { useRef, useState } from 'react';
import { backupReminder, snoozeUntil } from '../../backup/reminder';
import { listBabies } from '../../db/babies';
import { hasLiveEvents, listRecentEvents, stopEvent, switchBreastSide } from '../../db/events';
import { db } from '../../db/instance';
import type { Settings } from '../../db/settings';
import { forgottenTimer } from '../../domain/health';
import { babyStatus } from '../../domain/status';
import { DAY } from '../../domain/time';
import type { Id, TrackerEvent } from '../../domain/types';
import { BabyFormDialog } from '../babies/BabyFormDialog';
import { BackupBanner } from '../backup/BackupBanner';
import { RestoreButton } from '../backup/RestoreButton';
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
  /** Opens the import sheet with a picked backup file (owned by Shell). */
  onImportFile: (file: File) => void;
  /** Opens the export sheet (owned by Shell). */
  onBackup: () => void;
}

export function HomeScreen({ settings, onSettingsChange, onImportFile, onBackup }: Props) {
  const t = useT();
  const tick = useNow();
  const report = useReportError();
  const reportLoadError = useReportLoadError();
  const babies = useLiveQuery(() => listBabies(db), [], reportLoadError);
  const events = useLiveQuery(
    () => listRecentEvents(db, Date.now() - RECENT_WINDOW),
    [],
    reportLoadError,
  );
  const hasEvents = useLiveQuery(() => hasLiveEvents(db), [], reportLoadError);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TrackerEvent | null>(null);
  // Timer buttons already in flight, per event: a double tap must not run the same action twice.
  const busy = useRef<Set<Id>>(new Set());

  // Nothing shows until the banner decision is known too, so the cards never appear without it first.
  if (babies === undefined || events === undefined || hasEvents === undefined)
    return (
      <section aria-busy="true">
        <h1>{t('tab.home')}</h1>
      </section>
    );

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
      <button
        type="button"
        className="btn btn-link"
        aria-label={`${babyName}: ${t('timer.forgot')}`}
        onClick={() => setEditing(event)}
      >
        {t('timer.forgot')}
      </button>
    );
  };

  const reminder = backupReminder(settings, hasEvents, now);

  return (
    <section>
      <h1>{t('tab.home')}</h1>
      {reminder.show && (
        <BackupBanner
          daysSince={reminder.daysSince}
          onBackup={onBackup}
          onSnooze={() =>
            void onSettingsChange({ backupReminderSnoozedUntil: snoozeUntil(Date.now()) })
          }
        />
      )}
      {babies.length === 0 ? (
        <div className="card">
          <p>{t('home.empty')}</p>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            {t('babies.add')}
          </button>
          {/* After a wipe, restoring first avoids adding the babies again as new ones. */}
          <p className="muted small home-restore">{t('home.restoreHint')}</p>
          <div className="backup-actions">
            <RestoreButton onFile={onImportFile} />
          </div>
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
                            onClick={() =>
                              act(running.eventId, () => switchBreastSide(db, running.eventId))
                            }
                          >
                            {t('timer.switchSide')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            aria-label={`${baby.name}: ${t('timer.stopFeed')}`}
                            onClick={() =>
                              act(running.eventId, () => stopEvent(db, running.eventId))
                            }
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
      <BabyFormDialog
        open={adding}
        usedColors={babies.map((b) => b.color)}
        onClose={() => setAdding(false)}
      />
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
