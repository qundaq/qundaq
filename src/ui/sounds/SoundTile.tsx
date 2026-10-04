import { useT } from '../app/I18nProvider';
import styles from './Sounds.module.css';

export type TileState = 'off' | 'loading' | 'playing' | 'paused' | 'unavailable';

interface Props {
  name: string;
  state: TileState;
  onSelect: () => void;
}

/**
 * One sound: the tile is the play control. Its accessible name carries the action a tap does now
 * ("White noise: Pause"); an unavailable sound (its file would not load) is dimmed, says so and does nothing.
 */
export function SoundTile({ name, state, onSelect }: Props) {
  const t = useT();
  const unavailable = state === 'unavailable';
  const on = state === 'playing' || state === 'loading';
  const action = on
    ? t('sounds.pause')
    : state === 'paused'
      ? t('sounds.resume')
      : t('sounds.play');
  return (
    <button
      type="button"
      className={[
        styles.tile,
        on ? styles.tileOn : '',
        unavailable ? styles.tileUnavailable : '',
      ].join(' ')}
      data-state={state}
      aria-label={unavailable ? name : t('sounds.tile', { name, action })}
      aria-disabled={unavailable || undefined}
      onClick={unavailable ? undefined : onSelect}
    >
      <span>{name}</span>
      {state === 'loading' && <span className={styles.tileNote}>{t('sounds.preparing')}</span>}
      {unavailable && <span className={styles.tileNote}>{t('sounds.unavailable')}</span>}
    </button>
  );
}
