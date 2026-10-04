import { SOUNDS } from '../../audio/catalog';
import { percent } from '../../audio/volume';
import { useT } from '../app/I18nProvider';
import { Field } from '../shared/Field';
import { VisuallyHidden } from '../shared/VisuallyHidden';
import { SoundTile, type TileState } from './SoundTile';
import styles from './Sounds.module.css';
import { TimerChips } from './TimerChips';
import { statusText } from './text';
import { useRemaining } from './useRemaining';
import { useSoundEngine } from './useSoundEngine';

/** The sounds tab: a view over the engine's snapshot. Every tap that can start sound calls the engine synchronously (R6). */
export function SoundsScreen() {
  const t = useT();
  const { engine, state } = useSoundEngine();
  const remaining = useRemaining(t, state.endsAt);

  const tileState = (id: (typeof SOUNDS)[number]['id']): TileState => {
    if (state.unavailable.includes(id)) return 'unavailable';
    if (state.current !== id || state.status === 'stopped') return 'off';
    if (state.status === 'playing') return state.loading === id ? 'loading' : 'playing';
    return 'paused';
  };

  return (
    <section>
      <VisuallyHidden as="h1">{t('tab.sounds')}</VisuallyHidden>
      {/* Only the state is announced: inside the live region the countdown would be read out every minute. */}
      <p className={styles.status} data-testid="sound-status">
        <span aria-live="polite">{statusText(t, state)}</span>
        {remaining ? ` · ${remaining}` : ''}
      </p>

      <div className={styles.tiles} role="group" aria-label={t('sounds.tiles')}>
        {SOUNDS.map((sound) => (
          <SoundTile
            key={sound.id}
            name={t(sound.nameKey)}
            state={tileState(sound.id)}
            onSelect={() => engine.select(sound.id)}
          />
        ))}
      </div>

      <TimerChips value={state.timer} onChange={(choice) => engine.setTimer(choice)} />

      <Field label={t('sounds.master')} className={styles.master}>
        <input
          type="range"
          className={styles.level}
          min={0}
          max={1}
          step={0.01}
          value={state.master}
          aria-valuetext={percent(state.master)}
          onChange={(event) => engine.setMaster(Number(event.target.value))}
        />
      </Field>
      <p className={styles.safety}>{t('sounds.safety')}</p>
    </section>
  );
}
