import { useRef, useState } from 'react';
import { backupReminder, snoozeUntil } from '../../backup/reminder';
import { listBabies } from '../../db/babies';
import { hasLiveEvents, listRecentEvents, stopTimer, switchBreastSide } from '../../db/events';
import { db } from '../../db/instance';
import type { Settings } from '../../db/settings';
import { dayWindow } from '../../domain/days';
import { forgottenTimer } from '../../domain/health';
import { babyStatus } from '../../domain/status';
import { dailyTotals } from '../../domain/summary';
import { DAY } from '../../domain/time';
import type { Id, TrackerEvent } from '../../domain/types';
import { BabyFormDialog } from '../babies/BabyFormDialog';
import { BackupBanner } from '../backup/BackupBanner';
import { RestoreButton } from '../backup/RestoreButton';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { VisuallyHidden } from '../shared/VisuallyHidden';
import { useReportError, useReportLoadError } from '../shared/ErrorBanner';
import { EditSheet } from '../history/EditSheet';
import { BabyCard } from './BabyCard';
import { LiveStrip } from './LiveStrip';
import { PumpButton } from './PumpButton';
import { useT } from '../app/I18nProvider';
import type { LogRequest } from '../log/drafts';
import { LogSheet } from '../log/LogSheet';
import { useUndoToast } from '../log/useUndoToast';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useNow } from '../shared/useNow';
import styles from './Home.module.css';

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
  const [request, setRequest] = useState<LogRequest | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TrackerEvent | null>(null);
  // Timer buttons already in flight, per event: a double tap must not run the same action twice.
  const busy = useRef<Set<Id>>(new Set());
  const nameOf = (id: Id) => babies?.find((b) => b.id === id)?.name ?? '';
  const undoToast = useUndoToast(nameOf);

  // Nothing shows until the banner decision is known too, so the cards never appear without it first.
  if (babies === undefined || events === undefined || hasEvents === undefined)
    return (
      <section aria-busy="true">
        <VisuallyHidden as="h1">{t('tab.home')}</VisuallyHidden>
      </section>
    );

  // The tick can be up to 30 s old; data written since then must never look like it is in the future.
  // eslint-disable-next-line react-hooks/purity
  const now = Math.max(tick, Date.now());
  const byId = new Map(events.map((event) => [event.id, event]));
  const { from, to } = dayWindow(now);

  const act = (eventId: Id, action: () => Promise<unknown>) => {
    if (busy.current.has(eventId)) return;
    busy.current.add(eventId);
    action()
      .catch((error: unknown) => report(error))
      .finally(() => busy.current.delete(eventId));
  };

  const stop = (eventId: Id) =>
    act(eventId, () => stopTimer(db, eventId).then((change) => change && undoToast([change])));

  /** Under a timer that has run suspiciously long: opens it in the edit sheet to end it at the right time. */
  const forgotHint = (babyName: string, eventId: Id) => {
    const event = byId.get(eventId);
    if (!event || !forgottenTimer(event, now)) return null;
    return (
      <Button
        variant="tertiary"
        aria-label={`${babyName}: ${t('timer.forgot')}`}
        onClick={() => setEditing(event)}
      >
        {t('timer.forgot')}
      </Button>
    );
  };

  const reminder = backupReminder(settings, hasEvents, now);

  return (
    <section>
      <VisuallyHidden as="h1">{t('tab.home')}</VisuallyHidden>
      <PumpButton onOpen={setRequest} />
      {babies.length === 0 ? (
        <Card className={styles.empty}>
          <p>{t('home.empty')}</p>
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('babies.add')}
          </Button>
          {/* After a wipe, restoring first avoids adding the babies again as new ones. */}
          <p className={styles.restoreHint}>{t('home.restoreHint')}</p>
          <RestoreButton onFile={onImportFile} />
        </Card>
      ) : (
        babies.map((baby) => {
          const status = babyStatus(events, baby.id);
          const today = dailyTotals(events, baby.id, from, to, now);
          const running = status.runningFeed;
          const asleep = status.sleep.state === 'asleep' ? status.sleep : null;
          const live = (
            <>
              {asleep && (
                <LiveStrip
                  kind="sleep"
                  name={baby.name}
                  since={asleep.since}
                  onStop={() => stop(asleep.eventId)}
                  hint={forgotHint(baby.name, asleep.eventId)}
                />
              )}
              {running && (
                <LiveStrip
                  kind="breastfeed"
                  name={baby.name}
                  since={running.startAt}
                  side={running.side}
                  onSwitch={() => act(running.eventId, () => switchBreastSide(db, running.eventId))}
                  onStop={() => stop(running.eventId)}
                  hint={forgotHint(baby.name, running.eventId)}
                />
              )}
            </>
          );
          return (
            <BabyCard
              key={baby.id}
              baby={baby}
              status={status}
              today={today}
              now={now}
              live={live}
              onPick={(kind) => setRequest({ kind, babyId: baby.id })}
            />
          );
        })
      )}
      {babies.length > 0 && reminder.show && (
        <BackupBanner
          daysSince={reminder.daysSince}
          onBackup={onBackup}
          onSnooze={() =>
            void onSettingsChange({ backupReminderSnoozedUntil: snoozeUntil(Date.now()) })
          }
        />
      )}
      <BabyFormDialog
        open={adding}
        usedColors={babies.map((b) => b.color)}
        onClose={() => setAdding(false)}
      />
      <LogSheet
        request={request}
        babies={babies}
        events={events}
        onClose={() => setRequest(null)}
      />
      <EditSheet event={editing} babies={babies} onClose={() => setEditing(null)} />
    </section>
  );
}
