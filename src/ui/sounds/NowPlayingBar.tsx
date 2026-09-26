import type { EngineState } from '../../audio/engine';
import { useT } from '../app/I18nProvider';
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
    <div className="nowplaying" role="region" aria-label={t('nowplaying.label')}>
      <button type="button" className="nowplaying-text" onClick={onOpen}>
        {statusText(t, state)}
        {remaining ? ` · ${remaining}` : ''}
      </button>
      {state.status === 'playing' ? (
        <button type="button" className="btn" onClick={onPause}>
          {t('sounds.pause')}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onPlay}>
          {t(state.status === 'interrupted' ? 'sounds.resume' : 'sounds.play')}
        </button>
      )}
    </div>
  );
}
