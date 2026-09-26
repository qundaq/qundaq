import type { Side } from '../../domain/types';
import { useT } from '../I18nProvider';
import {
  addSegment,
  removeSegment,
  setSegmentMinutes,
  setSegmentSide,
  type BreastfeedEdit,
} from '../log/drafts';

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
    <div className="segments">
      {value.segments.map((segment, index) => (
        <fieldset key={index} className="segment">
          <legend>{t('edit.segment', { n: index + 1 })}</legend>
          <div className="segment-row">
            <div className="chips">
              {SIDES.map((side) => (
                <button
                  key={side}
                  type="button"
                  className="chip"
                  aria-pressed={segment.side === side}
                  disabled={running && index !== last}
                  onClick={() => onChange(setSegmentSide(value, index, side))}
                >
                  {t(`side.${side}.button`)}
                </button>
              ))}
            </div>
            {running ? (
              <span className="muted">
                {index === last ? t('log.ongoing') : t('time.minutes', { m: segment.minutes })}
              </span>
            ) : (
              <label className="field segment-minutes">
                {t('edit.minutes')}
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
              </label>
            )}
            {!running && value.segments.length > 1 && (
              <button
                type="button"
                className="btn"
                aria-label={t('edit.removeSegment', { n: index + 1 })}
                onClick={() => onChange(removeSegment(value, index))}
              >
                ✕︎
              </button>
            )}
          </div>
        </fieldset>
      ))}
      {!running && (
        <button type="button" className="btn" onClick={() => onChange(addSegment(value))}>
          {t('edit.addSegment')}
        </button>
      )}
    </div>
  );
}
