import type { Side } from '../../domain/types';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Chip } from '../shared/Chip';
import { Field } from '../shared/Field';
import {
  addSegment,
  removeSegment,
  setSegmentMinutes,
  setSegmentSide,
  type BreastfeedEdit,
} from '../log/edits';
import styles from './Log.module.css';

const SIDES: readonly Side[] = ['L', 'R'];

/** Whole minutes only. Anything else ("7.5", "") becomes 0, which saving refuses with segments-invalid. */
function parseMinutes(raw: string): number {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : 0;
}

/**
 * The sides of a breastfeed. Finished: each side and its minutes can change, and sides can be added or
 * removed (one always stays). Running: only the side of the current (last) part can change.
 */
export function SegmentsEditor({
  value,
  running,
  onChange,
}: {
  value: BreastfeedEdit;
  running: boolean;
  onChange: (next: BreastfeedEdit) => void;
}) {
  const t = useT();
  const last = value.segments.length - 1;
  return (
    <div className={styles.segments}>
      {value.segments.map((segment, index) => (
        <fieldset key={index}>
          <legend>{t('edit.segment', { n: index + 1 })}</legend>
          <div className={styles.segmentRow}>
            <div className={styles.chips}>
              {SIDES.map((side) => (
                <Chip
                  key={side}
                  selected={segment.side === side}
                  disabled={running && index !== last}
                  onClick={() => onChange(setSegmentSide(value, index, side))}
                >
                  {t(`side.${side}.button`)}
                </Chip>
              ))}
            </div>
            {running ? (
              <span className={styles.muted}>
                {index === last ? t('log.ongoing') : t('time.minutes', { m: segment.minutes })}
              </span>
            ) : (
              <Field label={t('edit.minutes')}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  value={segment.minutes > 0 ? segment.minutes : ''}
                  onChange={(e) =>
                    onChange(setSegmentMinutes(value, index, parseMinutes(e.target.value)))
                  }
                />
              </Field>
            )}
            {!running && value.segments.length > 1 && (
              <Button
                aria-label={t('edit.removeSegment', { n: index + 1 })}
                onClick={() => onChange(removeSegment(value, index))}
              >
                ✕︎
              </Button>
            )}
          </div>
        </fieldset>
      ))}
      {!running && (
        <Button onClick={() => onChange(addSegment(value))}>{t('edit.addSegment')}</Button>
      )}
    </div>
  );
}
