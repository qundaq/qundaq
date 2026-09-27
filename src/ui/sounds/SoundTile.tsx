import { percent } from '../../audio/volume';
import { useT } from '../app/I18nProvider';
import styles from './Sounds.module.css';

interface Props {
  name: string;
  /** The layer's slider while the sound is on; undefined while it is off. */
  level: number | undefined;
  preparing: boolean;
  onToggle: () => void;
  onLevel: (level: number) => void;
}

/** One sound: a toggle button, and its level slider while it is on. */
export function SoundTile({ name, level, preparing, onToggle, onLevel }: Props) {
  const t = useT();
  const active = level !== undefined;
  return (
    <div className={styles.tileCell}>
      {/* The name is the accessible name; the "Hazırlanıyor…" text is visual only, so the name never changes. */}
      <button
        type="button"
        className={[styles.tile, active ? styles.tileOn : ''].join(' ')}
        aria-pressed={active}
        aria-label={name}
        onClick={onToggle}
      >
        <span>{name}</span>
        {preparing && <span className={styles.preparing}>{t('sounds.preparing')}</span>}
      </button>
      {active && (
        <input
          type="range"
          className={styles.level}
          min={0}
          max={1}
          step={0.01}
          value={level}
          aria-label={t('sounds.level', { name })}
          aria-valuetext={percent(level)}
          onChange={(event) => onLevel(Number(event.target.value))}
        />
      )}
    </div>
  );
}
