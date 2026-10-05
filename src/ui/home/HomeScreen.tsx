import { useEffect, useRef, useState } from 'react';
import { backupReminder, snoozeUntil } from '../../backup/reminder';
import { listBabies } from '../../db/babies';
import {
  hasLiveEvents,
  listRecentEvents,
  stopPump,
  stopTimer,
  switchBreastSide,
} from '../../db/events';
import { db } from '../../db/instance';
import type { Settings } from '../../db/settings';
import { dayWindow } from '../../domain/days';
import { forgottenTimer } from '../../domain/health';
import { runningPump } from '../../domain/pump';
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
import { PumpStrip } from './PumpStrip';
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
  // Stopping the pump here (the strip's Stop or its sheet) removes the control that had the focus; the
  // pumping button that comes back takes it, once the sheet has closed and the strip is gone.
  const pumpButton = useRef<HTMLButtonElement>(null);
  const refocusPump = useRef(false);
  const runningPumpId = events === undefined ? null : (runningPump(events)?.id ?? null);
  useEffect(() => {
    if (!refocusPump.current || runningPumpId !== null || request !== null) return;
    refocusPump.current = false;
    // Only focus that was lost with the strip or its sheet (WebKit can leave it on the closed sheet's
    // button for a moment): never taken from a control the parent moved to since.
    const active = document.activeElement;
    if (
      active === null ||
      active === document.body ||
      !active.isConnected ||
      active.closest('dialog:not([open])') !== null
    )
      pumpButton.current?.focus();
  }, [runningPumpId, request]);

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

  const runningSegments = (eventId: Id) => {
    const event = byId.get(eventId);
    return event?.type === 'breastfeed' ? event.segments : [];
  };

  const stop = (eventId: Id) =>
    act(eventId, () => stopTimer(db, eventId).then((change) => change && undoToast([change])));

  /**
   * Under a timer that has run suspiciously long: opens it to end it at the right time (a baby's timer in
   * the edit sheet, the pump in its stop sheet, where the minutes can be corrected too).
   */
  const forgotHint = (who: string, eventId: Id, open?: () => void) => {
    const event = byId.get(eventId);
    if (!event || !forgottenTimer(event, now)) return null;
    return (
      <Button
        variant="tertiary"
        aria-label={`${who}: ${t('timer.forgot')}`}
        onClick={open ?? (() => setEditing(event))}
      >
        {t('timer.forgot')}
      </Button>
    );
  };
  const pump = runningPump(events);
  const openPump = () => setRequest({ kind: 'pump' });

  const reminder = backupReminder(settings, hasEvents, now);

  return (
    <section>
      <VisuallyHidden as="h1">{t('tab.home')}</VisuallyHidden>
      {pump ? (
        <PumpStrip
          pump={pump}
          onOpen={openPump}
          onStop={() => {
            refocusPump.current = true;
            act(pump.id, () =>
              stopPump(db, pump.id)
                .then((change) => change && undoToast([change]))
                .catch((error: unknown) => {
                  refocusPump.current = false;
                  throw error;
                }),
            );
          }}
          hint={forgotHint(t('home.pump'), pump.id, openPump)}
        />
      ) : (
        <PumpButton ref={pumpButton} onOpen={setRequest} />
      )}
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
                  segments={runningSegments(running.eventId)}
                  onSwitch={() => switchBreastSide(db, running.eventId)}
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
        onPumpStopped={() => {
          refocusPump.current = true;
        }}
      />
      <EditSheet event={editing} babies={babies} onClose={() => setEditing(null)} />
    </section>
  );
}
