import { useEffect, useMemo, useRef, useState } from 'react';
import {
  planImport,
  planSignature,
  type ImportOptions,
  type ImportPlan,
  type TableStats,
} from '../../backup/merge';
import { findSameBabies } from '../../backup/sameBaby';
import { applyImport, readSnapshot, type ApplyResult, type LocalData } from '../../db/backup';
import { db } from '../../db/instance';
import { loadSettings } from '../../db/settings';
import type { Id } from '../../domain/types';
import { useReportError } from '../shared/ErrorBanner';
import { useLocale, useT } from '../app/I18nProvider';
import { clockTime, formatNumber, shortDate } from '../history/describe';
import { Button } from '../shared/Button';
import { Chip } from '../shared/Chip';
import styles from './Backup.module.css';
import type { ImportSource } from './importFile';
import { FileSummary, SkippedList, Timers } from './ImportPreview';
import type { Phase, Props } from './ImportSheet';
import { SheetMessage } from './SheetMessage';

type ImportFormProps = Omit<Props, 'source' | 'onImported'> & {
  source: ImportSource;
  onCommitted: () => void;
};

export function ImportForm({
  source,
  choices,
  onChoicesChange,
  onBackupFirst,
  onSettingsReplaced,
  onCommitted,
  onClose,
}: ImportFormProps) {
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
        <SheetMessage message={t(`import.error.${result.error}`)} />
      </div>
    );
  }
  if (phase === 'failed' || plan === 'failed') {
    return (
      <div ref={root}>
        <SheetMessage message={t('import.failed')} />
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
    return (
      <div ref={root}>
        <p role="status" className={styles.ok}>
          {message}
        </p>
        <div className={styles.sheetActions}>
          <Button variant="primary" onClick={onClose}>
            {t('common.ok')}
          </Button>
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
  return (
    <div ref={root}>
      {changed && (
        <p role="alert" className={styles.warn}>
          {t('import.changed')}
        </p>
      )}
      <FileSummary backup={backup} />
      <SkippedList skipped={result.skipped} />
      {result.warnings.outOfRange > 0 && (
        <p className={styles.hint}>
          {t('import.outOfRange', { n: formatNumber(locale, result.warnings.outOfRange) })}
        </p>
      )}
      {result.warnings.badBirthDate > 0 && (
        <p className={styles.hint}>
          {t('import.badBirthDate', { n: formatNumber(locale, result.warnings.badBirthDate) })}
        </p>
      )}
      {result.warnings.settings && <p className={styles.hint}>{t('import.settingsWarning')}</p>}

      {!deviceEmpty && (
        <fieldset>
          <legend>{t('import.mode')}</legend>
          <div className={styles.segmented}>
            {(['merge', 'replace'] as const).map((option) => (
              <Chip
                key={option}
                selected={mode === option}
                disabled={applying}
                onClick={() => {
                  setConfirmed(false);
                  onChoicesChange({ ...choices, mode: option });
                }}
              >
                {t(`import.mode.${option}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      {mode === 'merge' ? (
        <>
          {(pairs.length > 0 || plan.follows.length > 0) && (
            <fieldset>
              <legend>{t('import.sameBabyTitle')}</legend>
              <p className={styles.hint}>{t('import.sameBabyHint')}</p>
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
                <label key={item.id} className={styles.toggle}>
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
          <dl className={styles.counts} data-testid="import-counts">
            <div>
              <dt>{t('import.babies')}</dt>
              <dd>{counts(plan.stats.babies)}</dd>
            </div>
            <div>
              <dt>{t('import.events')}</dt>
              <dd>
                {counts(plan.stats.events)}
                {plan.stats.events.deleted > 0 && (
                  <span className={styles.muted}>
                    {' '}
                    · {t('import.deleted', { n: formatNumber(locale, plan.stats.events.deleted) })}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {plan.removedBabies.length > 0 && (
            <p className={styles.warn}>
              {t('import.removedBabies', { names: plan.removedBabies.join(', ') })}
            </p>
          )}
          {plan.hidden.map((baby, i) => (
            <p key={i} className={styles.warn}>
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
          {plan.loss.events > 0 && plan.loss.newestAt !== null && (
            <p className={styles.warn}>
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

      <div className={styles.formActions}>
        {!deviceEmpty && (
          <Button variant="tertiary" disabled={applying} onClick={onBackupFirst}>
            {t('import.backupFirst')}
          </Button>
        )}
        {mode === 'replace' && (
          <label className={styles.toggle}>
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
      <div className={styles.sheetActions}>
        <Button disabled={applying} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {mode === 'merge' ? (
          <Button variant="primary" disabled={applying} onClick={() => void apply()}>
            {t('import.applyMerge')}
          </Button>
        ) : (
          <Button variant="danger" disabled={applying || !confirmed} onClick={() => void apply()}>
            {t('import.applyReplace')}
          </Button>
        )}
      </div>
    </div>
  );
}
