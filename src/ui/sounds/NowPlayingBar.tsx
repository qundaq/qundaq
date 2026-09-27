import type { EngineState } from '../../audio/engine';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import styles from './Sounds.module.css';
import { statusText } from './text';
import { useRemaining } from './useRemaining';

interface Props {
  state: EngineState;
  /** Opens the Sesler tab. */
  onOpen: () => void;
  onPlay: () => void;
  onPause: () => void;
}

/**
 * The compact bar above the tab bar while sound plays and another tab is open, so the parent can pause
 * from Home without switching tabs. Shell renders it outside the screens' ErrorBoundary (R16).
 */
export function NowPlayingBar({ state, onOpen, onPlay, onPause }: Props) {
  const t = useT();
  const remaining = useRemaining(t, state.endsAt);
  return (
    <div className={styles.bar} role="region" aria-label={t('nowplaying.label')}>
      <button type="button" className={styles.text} onClick={onOpen}>
        {statusText(t, state)}
        {remaining ? ` · ${remaining}` : ''}
      </button>
      {state.status === 'playing' ? (
        <Button icon="pause" onClick={onPause}>
          {t('sounds.pause')}
        </Button>
      ) : (
        <Button variant="primary" icon="play" onClick={onPlay}>
          {t(state.status === 'interrupted' ? 'sounds.resume' : 'sounds.play')}
        </Button>
      )}
    </div>
  );
}
