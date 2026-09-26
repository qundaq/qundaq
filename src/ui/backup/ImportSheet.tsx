import { useEffect, useMemo, useRef, useState } from 'react';
import { countLive } from '../../backup/export';
import {
  findSameBabies,
  planImport,
  planSignature,
  type ImportOptions,
  type ImportPlan,
  type TableStats,
} from '../../backup/merge';
import type { StaleTimer, StoppedTimer } from '../../backup/running';
import type { ParsedBackup, SkippedRow } from '../../backup/validate';
import { applyImport, readSnapshot, type ApplyResult, type LocalData } from '../../db/backup';
import { db } from '../../db/instance';
import { loadSettings, type Settings } from '../../db/settings';
import type { Id } from '../../domain/types';
import { useReportError } from '../ErrorBanner';
import { ErrorBoundary } from '../ErrorBoundary';
import { useLocale, useT } from '../I18nProvider';
import { clockTime, formatNumber, longDate, shortDate, typeLabel } from '../history/describe';
import { Sheet, useSheetSession } from '../Sheet';
import type { ImportChoices, ImportSource } from './importFile';
import { SheetMessage } from './SheetMessage';

interface Props {
  source: ImportSource | null; // null: closed
  choices: ImportChoices;
  onChoicesChange: (next: ImportChoices) => void;
  /** "Önce bu cihazın yedeğini al": Shell swaps to the export sheet and comes back here afterwards. */
  onBackupFirst: () => void;
  onSettingsReplaced: (next: Settings) => void;
  /** The import was written (before the settings are read back), so Shell can start a crashed screen over. */
  onImported: () => void;
  onClose: () => void;
}

export function ImportSheet({ source, onClose, onImported, ...rest }: Props) {
  const t = useT();
  const session = useSheetSession(source);
  // The session whose import was written: a failure after that must not say that nothing changed.
  const committed = useRef<number | null>(null);
  return (
    <Sheet open={source !== null} title={t('import.title')} onClose={onClose}>
      {/* The sheet sits outside the screens' boundary: a render error here shows its failure, not a blank app. */}
      {session && (
        <ErrorBoundary
          key={session.id}
          fallback={() => (
            <SheetMessage
              message={t(committed.current === session.id ? 'import.failedAfter' : 'import.failed')}
              onClose={onClose}
            />
          )}
        >
          <ImportForm
            source={session.value}
            onClose={onClose}
            onCommitted={() => {
              committed.current = session.id;
              onImported();
            }}
            {...rest}
          />
        </ErrorBoundary>
      )}
    </Sheet>
  );
}

type Phase = 'preview' | 'applying' | 'done' | 'failed';

/** Smallest and largest of many numbers, without spreading them into Math.min/max (JavaScriptCore caps arguments). */
function range(values: readonly number[]): { min: number; max: number } | null {
  if (values.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

type FormProps = Omit<Props, 'source' | 'onImported'> & {
  source: ImportSource;
  onCommitted: () => void;
};

function ImportForm({
  source,
  choices,
  onChoicesChange,
  onBackupFirst,
  onSettingsReplaced,
  onCommitted,
  onClose,
}: FormProps) {
  const t = useT();
  const locale = useLocale();
  const report = useReportError();
  // The device as read for the preview, and the time the preview was planned at. applyImport plans again
  // with the same time, so a timer that crosses the "forgot to stop?" limit meanwhile changes nothing.
  const [device, setDevice] = useState<{ local: LocalData; now: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('preview');
  const [applied, setApplied] = useState<ImportPlan | null>(null);
  const [changed, setChanged] = useState(false); // the device's data changed between preview and apply
  const [confirmed, setConfirmed] = useState(false); // the replace checkbox
  const busy = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    readSnapshot(db, locale)
      .then((local) => {
        if (!cancelled) setDevice({ local, now: Date.now() });
      })
      .catch((error: unknown) => {
        console.error('Could not read the device data', error);
        if (!cancelled) setPhase('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  useEffect(() => {
    // Esc must not close the sheet while the import is being written.
    const dialog = root.current?.closest('dialog');
    if (!dialog) return;
    const hold = (cancel: Event) => {
      if (busy.current) cancel.preventDefault();
    };
    dialog.addEventListener('cancel', hold);
    return () => dialog.removeEventListener('cancel', hold);
  }, []);

  const result = source.result;
  const backup = result?.ok ? result.backup : null;
  const local = device?.local ?? null;
  const deviceEmpty = local !== null && local.babies.length === 0 && local.events.length === 0;
  // An empty device gives the same result either way, so it only merges.
  const mode = deviceEmpty ? 'merge' : choices.mode;
  const pairs = useMemo(
    () => (local && backup && mode === 'merge' ? findSameBabies(local.babies, backup.babies) : []),
    [local, backup, mode],
  );
  const options: ImportOptions = useMemo(
    () => ({
      mode,
      sameBabies: pairs.filter((pair) => !choices.notSame.includes(pair.localId)),
      stopStale: choices.stopStale,
      keepApart: choices.notSame,
    }),
    [mode, pairs, choices.notSame, choices.stopStale],
  );
  const plan = useMemo(() => {
    if (!device || !backup) return null;
    try {
      return planImport(device.local, backup, options, device.now);
    } catch (error) {
      console.error('Could not plan the import', error);
      return 'failed' as const;
    }
  }, [device, backup, options]);

  if (result === null) {
    return (
      <div ref={root}>
        <p aria-busy="true">{t('import.loading')}</p>
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div ref={root}>
        <SheetMessage message={t(`import.error.${result.error}`)} onClose={onClose} />
      </div>
    );
  }
  if (phase === 'failed' || plan === 'failed') {
    return (
      <div ref={root}>
        <SheetMessage message={t('import.failed')} onClose={onClose} />
      </div>
    );
  }

  const apply = async () => {
    if (busy.current || !plan || !backup || !device) return;
    busy.current = true;
    setPhase('applying');
    let outcome: ApplyResult;
    try {
      outcome = await applyImport(db, {
        backup,
        options,
        expected: planSignature(plan),
        fallbackLocale: locale,
        now: device.now,
      });
      if (!outcome.applied) {
        setDevice({ local: await readSnapshot(db, locale), now: Date.now() });
        setChanged(true);
        setConfirmed(false);
        setPhase('preview');
        return;
      }
    } catch (error) {
      console.error('Import failed', error);
      setPhase('failed'); // the transaction rolled back: nothing changed
      return;
    } finally {
      busy.current = false;
    }
    // Written. The result is shown first; reading the settings back is separate, so its failure is
    // reported as such and never as "nothing changed".
    onCommitted();
    setApplied(outcome.plan);
    setPhase('done');
    try {
      onSettingsReplaced(await loadSettings(db, locale));
    } catch (error) {
      report(error, { messageKey: 'error.loadFailed' });
    }
  };

  if (phase === 'done' && applied) {
    const n = (value: number) => formatNumber(locale, value);
    const message =
      applied.mode === 'merge'
        ? t('import.done.merge', {
            added: n(applied.stats.events.add),
            updated: n(applied.stats.events.update),
            removed: n(applied.stats.events.remove),
            moved: n(applied.moves.reduce((sum, move) => sum + move.events, 0)),
          })
        : t('import.done.replace', {
            babies: n(applied.stats.babies.add),
            events: n(applied.stats.events.add),
          });
    const mixesChanged =
      applied.mode === 'merge' &&
      applied.stats.mixes.add + applied.stats.mixes.update + applied.stats.mixes.remove > 0;
    return (
      <div ref={root}>
        <p role="status" className="status-ok">
          {message}
        </p>
        {mixesChanged && (
          <p className="status-ok">
            {t('import.done.mergeMixes', {
              added: n(applied.stats.mixes.add),
              updated: n(applied.stats.mixes.update),
              removed: n(applied.stats.mixes.remove),
            })}
          </p>
        )}
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('common.ok')}
          </button>
        </div>
      </div>
    );
  }
  if (!local || !plan || !backup) {
    return (
      <div ref={root}>
        <p aria-busy="true">{t('import.loading')}</p>
      </div>
    );
  }

  const applying = phase === 'applying';
  const names = new Map<Id, string>(
    [...local.babies, ...backup.babies].map((baby) => [baby.id, baby.name]),
  );
  const nameOf = (babyId: Id | null) =>
    babyId === null ? t('log.mother') : (names.get(babyId) ?? '?');
  const when = (ms: number) => `${shortDate(locale, ms)} ${clockTime(locale, ms)}`;
  const counts = (stats: TableStats) =>
    t('import.counts', {
      add: formatNumber(locale, stats.add),
      update: formatNumber(locale, stats.update),
      remove: formatNumber(locale, stats.remove),
      same: formatNumber(locale, stats.same),
      keep: formatNumber(locale, stats.keep),
    });
  const backupFirstPrimary = mode === 'replace' && (plan.loss.events > 0 || plan.loss.mixes > 0);

  return (
    <div ref={root}>
      {changed && (
        <p role="alert" className="status-warn">
          {t('import.changed')}
        </p>
      )}
      <FileSummary backup={backup} />
      <SkippedList skipped={result.skipped} />
      {result.warnings.outOfRange > 0 && (
        <p className="muted small">
          {t('import.outOfRange', { n: formatNumber(locale, result.warnings.outOfRange) })}
        </p>
      )}
      {result.warnings.badBirthDate > 0 && (
        <p className="muted small">
          {t('import.badBirthDate', { n: formatNumber(locale, result.warnings.badBirthDate) })}
        </p>
      )}
      {result.warnings.settings && <p className="muted small">{t('import.settingsWarning')}</p>}

      {!deviceEmpty && (
        <fieldset>
          <legend>{t('import.mode')}</legend>
          <div className="segmented">
            {(['merge', 'replace'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                disabled={applying}
                onClick={() => {
                  setConfirmed(false);
                  onChoicesChange({ ...choices, mode: option });
                }}
              >
                {t(`import.mode.${option}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {mode === 'merge' ? (
        <>
          {(pairs.length > 0 || plan.follows.length > 0) && (
            <fieldset>
              <legend>{t('import.sameBabyTitle')}</legend>
              <p className="muted small">{t('import.sameBabyHint')}</p>
              {[
                ...pairs.map((pair) => ({
                  id: pair.localId,
                  label: t('import.sameBaby', { fileName: pair.name, localName: pair.localName }),
                })),
                ...plan.follows.map((follow) => ({
                  id: follow.localId,
                  label: t('import.follow', { localName: follow.name, name: follow.survivorName }),
                })),
              ].map((item) => (
                <label key={item.id} className="toggle">
                  <input
                    type="checkbox"
                    checked={!choices.notSame.includes(item.id)}
                    disabled={applying}
                    onChange={(event) =>
                      onChoicesChange({
                        ...choices,
                        notSame: event.target.checked
                          ? choices.notSame.filter((id) => id !== item.id)
                          : [...choices.notSame, item.id],
                      })
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
          )}
          <dl className="import-counts">
            <div>
              <dt>{t('import.babies')}</dt>
              <dd>{counts(plan.stats.babies)}</dd>
            </div>
            <div>
              <dt>{t('import.events')}</dt>
              <dd>
                {counts(plan.stats.events)}
                {plan.stats.events.deleted > 0 && (
                  <span className="muted">
                    {' '}
                    · {t('import.deleted', { n: formatNumber(locale, plan.stats.events.deleted) })}
                  </span>
                )}
              </dd>
            </div>
            {(countLive(backup.mixes) > 0 || countLive(local.mixes) > 0) && (
              <div>
                <dt>{t('import.mixes')}</dt>
                <dd>{counts(plan.stats.mixes)}</dd>
              </div>
            )}
          </dl>
          {plan.removedBabies.length > 0 && (
            <p className="status-warn">
              {t('import.removedBabies', { names: plan.removedBabies.join(', ') })}
            </p>
          )}
          {plan.hidden.map((baby, i) => (
            <p key={i} className="status-warn">
              {t('import.hidden', { name: baby.name, n: formatNumber(locale, baby.events) })}
            </p>
          ))}
          {plan.moves.map((move) => (
            <p key={move.name}>
              {t('import.moved', { n: formatNumber(locale, move.events), name: move.name })}
            </p>
          ))}
        </>
      ) : (
        <>
          <p>
            {t('import.replaceSummary', {
              babies: formatNumber(locale, plan.stats.localBabies),
              events: formatNumber(locale, plan.stats.localEvents),
            })}
          </p>
          {plan.stats.localMixes > 0 && (
            <p className="status-warn">
              {t('import.replaceMixes', { n: formatNumber(locale, plan.stats.localMixes) })}
            </p>
          )}
          {plan.loss.events > 0 && plan.loss.newestAt !== null && (
            <p className="status-warn">
              {t('import.loss', {
                n: formatNumber(locale, plan.loss.events),
                newest: when(plan.loss.newestAt),
              })}
            </p>
          )}
        </>
      )}

      <Timers
        stale={plan.stale}
        stopped={plan.stopped}
        nameOf={nameOf}
        when={when}
        choices={choices}
        disabled={applying}
        onChoicesChange={onChoicesChange}
      />

      <div className="export-actions">
        {!deviceEmpty && (
          <button
            type="button"
            className={backupFirstPrimary ? 'btn btn-primary' : 'btn'}
            disabled={applying}
            onClick={onBackupFirst}
          >
            {t('import.backupFirst')}
          </button>
        )}
        {mode === 'replace' && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={applying}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{t('import.confirmReplace')}</span>
          </label>
        )}
        {applying && <p aria-busy="true">{t('import.applying')}</p>}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" disabled={applying} onClick={onClose}>
          {t('common.cancel')}
        </button>
        {mode === 'merge' ? (
          <button
            type="button"
            className={backupFirstPrimary ? 'btn' : 'btn btn-primary'}
            disabled={applying}
            onClick={() => void apply()}
          >
            {t('import.applyMerge')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-danger"
            disabled={applying || !confirmed}
            onClick={() => void apply()}
          >
            {t('import.applyReplace')}
          </button>
        )}
      </div>
    </div>
  );
}

/** When the backup was made, by which version, which babies and how many entries over which days. */
function FileSummary({ backup }: { backup: ParsedBackup }) {
  const t = useT();
  const locale = useLocale();
  const at = `${longDate(locale, backup.exportedAt)} ${clockTime(locale, backup.exportedAt)}`;
  const babies = backup.babies
    .filter((baby) => baby.deletedAt === undefined)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((baby) => baby.name);
  const events = backup.events.filter((event) => event.deletedAt === undefined);
  const span = range(events.map((event) => event.startAt));
  return (
    <div className="import-file">
      <p>
        {backup.appVersion
          ? t('import.fileInfo', { date: at, version: backup.appVersion })
          : t('import.fileInfoNoVersion', { date: at })}
      </p>
      <p>
        {babies.length > 0
          ? t('import.fileBabies', { names: babies.join(', ') })
          : t('import.fileNoBabies')}
      </p>
      <p>
        {span
          ? t('import.fileEvents', {
              n: formatNumber(locale, events.length),
              from: shortDate(locale, span.min),
              to: shortDate(locale, span.max),
            })
          : t('import.fileNoEvents')}
      </p>
    </div>
  );
}

const SHOWN_SKIPPED = 5;

/** "3 kayıt okunamadı ve atlanacak", with the first five named by date, time and type. */
function SkippedList({ skipped }: { skipped: readonly SkippedRow[] }) {
  const t = useT();
  const locale = useLocale();
  if (skipped.length === 0) return null;
  const label = (row: SkippedRow) => {
    if (row.list === 'babies') return `${t('import.skippedBaby')}${row.name ? ` ${row.name}` : ''}`;
    if (row.list === 'mixes') return `${t('import.skippedMix')}${row.name ? ` ${row.name}` : ''}`;
    if (row.type === undefined) return t('import.unknownRow');
    const type = typeLabel(t, row.type);
    return row.startAt === undefined
      ? type
      : `${shortDate(locale, row.startAt)} ${clockTime(locale, row.startAt)} · ${type}`;
  };
  return (
    <>
      <p className="status-warn">
        {t('import.skipped', { n: formatNumber(locale, skipped.length) })}
      </p>
      <details className="import-skipped">
        <summary>{t('import.skippedDetails')}</summary>
        <ul>
          {skipped.slice(0, SHOWN_SKIPPED).map((row) => (
            <li key={`${row.list}-${row.index}`}>
              {label(row)}: {t(`backup.problem.${row.code}`)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

interface TimersProps {
  stale: readonly StaleTimer[];
  stopped: readonly StoppedTimer[];
  nameOf: (babyId: Id | null) => string;
  when: (ms: number) => string;
  choices: ImportChoices;
  disabled: boolean;
  onChoicesChange: (next: ImportChoices) => void;
}

/** Old running timers from the file (with the option to stop them), and the timers the import stops anyway. */
function Timers({ stale, stopped, nameOf, when, choices, disabled, onChoicesChange }: TimersProps) {
  const t = useT();
  const others = stopped.filter((timer) => timer.reason !== 'stale');
  if (stale.length === 0 && others.length === 0) return null;
  return (
    <div className="import-timers">
      {stale.length > 0 && (
        <fieldset>
          <legend>{t('import.staleTitle')}</legend>
          <ul>
            {stale.map((timer) => (
              <li key={timer.id}>
                {t('import.staleItem', {
                  name: nameOf(timer.babyId),
                  type: typeLabel(t, timer.type),
                  since: when(timer.startAt),
                })}
              </li>
            ))}
          </ul>
          <label className="toggle">
            <input
              type="checkbox"
              checked={choices.stopStale}
              disabled={disabled}
              onChange={(event) => onChoicesChange({ ...choices, stopStale: event.target.checked })}
            />
            <span>{t('import.stopStale')}</span>
          </label>
        </fieldset>
      )}
      {others.length > 0 && (
        <ul>
          {others.map((timer) => (
            <li key={timer.id}>
              {t('import.stoppedItem', {
                name: nameOf(timer.babyId),
                type: typeLabel(t, timer.type),
                at: when(timer.stopAt),
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
