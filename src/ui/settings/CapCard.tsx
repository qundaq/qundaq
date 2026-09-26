import { useEffect, useRef, useState } from 'react';
import { isAboveDefaultCap, percent } from '../../audio/volume';
import { DEFAULT_CAP, MIN_CAP } from '../../domain/sounds';
import { useT } from '../I18nProvider';

/** A slider move is saved this long after it stops: every move would otherwise be a write. */
const SAVE_AFTER_MS = 300;

/**
 * Ayarlar → Ses güvenlik sınırı: the upper bound of the Sesler tab's volume (a slider value in 0.2–1).
 * Above the default the safety advice stays in view (R12). Saving goes through Shell, which hands the
 * new cap to the engine; the engine never gets louder for it (R1).
 */
export function CapCard({ cap, onChange }: { cap: number; onChange: (cap: number) => void }) {
  const t = useT();
  const [value, setValue] = useState(cap);
  const onChangeRef = useRef(onChange);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // A saved move coming back must not undo a newer one still waiting to be saved (a lower cap chosen meanwhile).
  useEffect(() => {
    if (pending.current === null) setValue(cap);
  }, [cap]);
  useEffect(() => {
    if (value === cap) {
      pending.current = null;
      return;
    }
    pending.current = value;
    const handle = window.setTimeout(() => {
      pending.current = null;
      onChangeRef.current(value);
    }, SAVE_AFTER_MS);
    return () => window.clearTimeout(handle);
  }, [value, cap]);
  // A move still pending when the card goes away (a tab switch right after it) is saved then.
  useEffect(
    () => () => {
      if (pending.current !== null) onChangeRef.current(pending.current);
    },
    [],
  );

  return (
    <div className="card">
      <h2>{t('settings.cap.title')}</h2>
      <p className="muted small">{t('settings.cap.hint')}</p>
      <input
        type="range"
        className="level"
        min={MIN_CAP}
        max={1}
        step={0.05}
        value={value}
        aria-label={t('settings.cap.title')}
        aria-valuetext={percent(value)}
        onChange={(event) => setValue(Number(event.target.value))}
      />
      {isAboveDefaultCap(value) && (
        <p role="alert" className="status-warn">
          {t('settings.cap.warning')}
        </p>
      )}
      {!isAboveDefaultCap(value) && value !== DEFAULT_CAP && (
        <p className="muted small">{t('settings.cap.belowDefault')}</p>
      )}
    </div>
  );
}
