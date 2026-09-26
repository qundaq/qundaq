import { useState } from 'react';
import { SOUNDS } from '../../audio/catalog';
import { percent } from '../../audio/volume';
import { useT } from '../I18nProvider';
import { MixList } from './MixList';
import { MixNameSheet, type MixNameRequest } from './MixNameSheet';
import { SoundTile } from './SoundTile';
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
      <h1>{t('tab.sounds')}</h1>
      <button
        type="button"
        className="btn btn-primary play-button"
        disabled={state.layers.length === 0}
        onClick={() => (state.status === 'playing' ? engine.pause() : engine.play())}
      >
        {t(state.status === 'playing' ? 'sounds.pause' : state.status === 'interrupted' ? 'sounds.resume' : 'sounds.play')}
      </button>
      {/* Only the state is announced: inside the live region the countdown would be read out every minute. */}
      <p className="sound-status">
        <span aria-live="polite">{statusText(t, state)}</span>
        {remaining ? ` · ${remaining}` : ''}
      </p>
      <TimerChips value={state.timer} onChange={(choice) => engine.setTimer(choice)} />

      <div className="sound-tiles" role="group" aria-label={t('sounds.tiles')}>
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
      <p role="status" className="sound-notice">
        {notice}
      </p>

      <label className="field master">
        {t('sounds.master')}
        <input
          type="range"
          className="level"
          min={0}
          max={1}
          step={0.01}
          value={state.master}
          aria-valuetext={percent(state.master)}
          onChange={(event) => engine.setMaster(Number(event.target.value))}
        />
      </label>
      <p className="muted small">{t('sounds.safety')}</p>

      <div className="backup-actions">
        <button
          type="button"
          className="btn"
          disabled={state.layers.length === 0}
          onClick={() => setMixRequest({ kind: 'save', layers: state.layers.map((layer) => ({ soundId: layer.soundId, gain: layer.level })) })}
        >
          {t('sounds.saveMix')}
        </button>
      </div>
      <MixList
        onPlay={(mix) => setNotice(engine.loadMix(mix.layers) === 'empty' ? t('sounds.mix.empty') : null)}
        onRename={(mix) => setMixRequest({ kind: 'rename', mix })}
      />
      <MixNameSheet request={mixRequest} onClose={() => setMixRequest(null)} />
    </section>
  );
}
