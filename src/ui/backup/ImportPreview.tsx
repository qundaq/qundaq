import type { StaleTimer, StoppedTimer } from '../../backup/running';
import type { ParsedBackup, SkippedRow } from '../../backup/validate';
import type { Id } from '../../domain/types';
import { useLocale, useT } from '../app/I18nProvider';
import { clockTime, formatNumber, longDate, shortDate, typeLabel } from '../history/describe';
import styles from './Backup.module.css';
import type { ImportChoices } from './importFile';

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

/** When the backup was made, by which version, which babies and how many entries over which days. */
export function FileSummary({ backup }: { backup: ParsedBackup }) {
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
    <div>
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

/** import.skipped ("3 records could not be read and will be skipped"), with the first five named by date, time and type. */
export function SkippedList({ skipped }: { skipped: readonly SkippedRow[] }) {
  const t = useT();
  const locale = useLocale();
  if (skipped.length === 0) return null;
  const label = (row: SkippedRow) => {
    if (row.list === 'babies') return `${t('import.skippedBaby')}${row.name ? ` ${row.name}` : ''}`;
    if (row.type === undefined) return t('import.unknownRow');
    const type = typeLabel(t, row.type);
    return row.startAt === undefined
      ? type
      : `${shortDate(locale, row.startAt)} ${clockTime(locale, row.startAt)} · ${type}`;
  };
  return (
    <>
      <p className={styles.warn}>
        {t('import.skipped', { n: formatNumber(locale, skipped.length) })}
      </p>
      <details className={styles.skipped}>
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
export function Timers({
  stale,
  stopped,
  nameOf,
  when,
  choices,
  disabled,
  onChoicesChange,
}: TimersProps) {
  const t = useT();
  const others = stopped.filter((timer) => timer.reason !== 'stale');
  if (stale.length === 0 && others.length === 0) return null;
  return (
    <div className={styles.timers}>
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
          <label className={styles.toggle}>
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
