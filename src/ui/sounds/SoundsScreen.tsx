import { useState } from 'react';
import { SOUNDS } from '../../audio/catalog';
import { percent } from '../../audio/volume';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Field } from '../shared/Field';
import { VisuallyHidden } from '../shared/VisuallyHidden';
import { MixList } from './MixList';
import { MixNameSheet, type MixNameRequest } from './MixNameSheet';
import { SoundTile } from './SoundTile';
import styles from './Sounds.module.css';
import { TimerChips } from './TimerChips';
import { statusText } from './text';
import { useRemaining } from './useRemaining';
import { useSoundEngine } from './useSoundEngine';

/** The Sesler tab: a view over the engine's snapshot. Every tap that can start sound calls the engine synchronously (R6). */
export function SoundsScreen() {
  const t = useT();
  const { engine, state } = useSoundEngine();
  const [notice, setNotice] = useState<string | null>(null);
  const [mixRequest, setMixRequest] = useState<MixNameRequest | null>(null);
  const remaining = useRemaining(t, state.endsAt);

  const toggle = (soundId: (typeof SOUNDS)[number]['id']) => {
    const result = engine.toggleLayer(soundId);
    setNotice(result === 'full' ? t('sounds.full') : null);
  };

  return (
    <section>
      <VisuallyHidden as="h1">{t('tab.sounds')}</VisuallyHidden>
      <Button
        variant="primary"
        size="lg"
        block
        className={styles.playButton}
        icon={state.status === 'playing' ? 'pause' : 'play'}
        disabled={state.layers.length === 0}
        onClick={() => (state.status === 'playing' ? engine.pause() : engine.play())}
      >
        {t(
          state.status === 'playing'
            ? 'sounds.pause'
            : state.status === 'interrupted'
              ? 'sounds.resume'
              : 'sounds.play',
        )}
      </Button>
      {/* Only the state is announced: inside the live region the countdown would be read out every minute. */}
      <p className={styles.status} data-testid="sound-status">
        <span aria-live="polite">{statusText(t, state)}</span>
        {remaining ? ` · ${remaining}` : ''}
      </p>
      <TimerChips value={state.timer} onChange={(choice) => engine.setTimer(choice)} />

      <div className={styles.tiles} role="group" aria-label={t('sounds.tiles')}>
        {SOUNDS.map((sound) => (
          <SoundTile
            key={sound.id}
            name={t(sound.nameKey)}
            level={state.layers.find((layer) => layer.soundId === sound.id)?.level}
            preparing={state.preparing.includes(sound.id)}
            onToggle={() => toggle(sound.id)}
            onLevel={(level) => engine.setLevel(sound.id, level)}
          />
        ))}
      </div>
      <p role="status" className={styles.notice}>
        {notice}
      </p>

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

      <Button
        block
        disabled={state.layers.length === 0}
        onClick={() =>
          setMixRequest({
            kind: 'save',
            layers: state.layers.map((layer) => ({ soundId: layer.soundId, gain: layer.level })),
          })
        }
      >
        {t('sounds.saveMix')}
      </Button>
      <MixList
        onPlay={(mix) =>
          setNotice(engine.loadMix(mix.layers) === 'empty' ? t('sounds.mix.empty') : null)
        }
        onRename={(mix) => setMixRequest({ kind: 'rename', mix })}
      />
      <MixNameSheet request={mixRequest} onClose={() => setMixRequest(null)} />
    </section>
  );
}
